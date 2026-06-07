"""
兮易AI智体 - 协调智能体引擎 (Coordinator Agent Engine)
====================================================
功能:
  1. 意图解析: 用户输入→LLM意图分类→Agent路由
  2. 多Agent调度: 5角色Agent并行/串行协作  
  3. 上下文装配: 角色上下文+历史记忆+场景数据→完整prompt
  4. 工作流执行: 加载workflow→按步骤执行→返回结果

架构:
  用户输入 → 意图解析器 → Agent调度器 → 工作流执行器 → 工具调用 → 结果汇总
              ↑                              ↓
         长期记忆 ←────────────────── 记忆存储
"""

import os, sys, json, uuid, logging, pymysql, traceback
from datetime import datetime
from typing import Dict, List, Optional, Any
from dbutils.pooled_db import PooledDB

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════
# 数据库连接
# ═══════════════════════════════════════════════
_pool = None

def _get_pool():
    global _pool
    if _pool is None:
        mysql_pass = os.environ.get('XIYI_MYSQL_PASSWORD', '')
        if not mysql_pass:
            try:
                with open('/etc/mysql/debian.cnf') as f:
                    for line in f:
                        if 'password' in line:
                            mysql_pass = line.strip().split('=')[-1].strip().strip('"').strip("'")
                            break
            except: pass
        _pool = PooledDB(
            creator=pymysql, maxconnections=10, mincached=2,
            host='127.0.0.1', port=3306,
            user=os.environ.get('XIYI_MYSQL_USER', 'debian-sys-maint'),
            password=mysql_pass,
            database=os.environ.get('XIYI_MYSQL_DB', 'xiyi_quality'),
            charset='utf8mb4',
        )
    return _pool

def _q(sql, params=None, fetch='all'):
    conn = _get_pool().connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        if fetch == 'all': return cur.fetchall()
        elif fetch == 'one': return cur.fetchone()
        else: conn.commit(); return cur.lastrowid
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# 1. 意图解析器
# ═══════════════════════════════════════════════

# 意图→场景映射表
INTENT_SCENE_MAP = {
    'fpy_analysis': {'scene_code': 'QUAL_01', 'keywords': ['合格率','FPY','一次交验','直通率','不合格']},
    'mag_analysis':  {'scene_code': 'QUAL_02', 'keywords': ['磁物','磁材','磁粉','清洁度','颗粒度']},
    'abn_analysis':  {'scene_code': 'QUAL_03', 'keywords': ['异常料','不良品','不合格品','MRB','退回']},
    'dead_stock':    {'scene_code': 'QUAL_04', 'keywords': ['呆滞','库存积压','超龄库存','滞销']},
    'iqc_analysis':  {'scene_code': 'QUAL_05', 'keywords': ['来料','IQC','供应商质量','进货检验']},
    'pmp_analysis':  {'scene_code': 'QUAL_06', 'keywords': ['过程','PMP','SPC','CPK','过程控制']},
    'coq_analysis':  {'scene_code': 'QUAL_07', 'keywords': ['成本','COQ','质量成本','失败成本','预防成本']},
    'equipment':     {'scene_code': None, 'keywords': ['设备','OEE','故障','维护','停机']},
    'production':    {'scene_code': None, 'keywords': ['排产','产能','瓶颈','计划','交期']},
    'inventory':     {'scene_code': None, 'keywords': ['库存','周转','物料','周转率']},
    'sales':         {'scene_code': None, 'keywords': ['销售','预测','客户','流失','订单']},
}

# 意图→角色映射
INTENT_ROLE_MAP = {
    'fpy_analysis': 'quality_specialist',
    'mag_analysis':  'quality_specialist',
    'abn_analysis':  'quality_specialist',
    'dead_stock':    'inventory_manager',
    'iqc_analysis':  'quality_specialist',
    'pmp_analysis':  'quality_specialist',
    'coq_analysis':  'quality_specialist',
    'equipment':     'equipment_specialist',
    'production':    'production_scheduler',
    'inventory':     'inventory_manager',
    'sales':         'sales_analyst',
}


def classify_intent(user_input: str) -> dict:
    """
    意图分类: 基于关键词匹配 + 兜底返回通用意图
    
    返回: {intent, confidence, scene_code, role_code, matched_keywords}
    """
    user_lower = user_input.lower()
    best_match = None
    best_count = 0
    best_keywords = []

    for intent_id, config in INTENT_SCENE_MAP.items():
        matches = [kw for kw in config['keywords'] if kw.lower() in user_lower]
        if len(matches) > best_count:
            best_count = len(matches)
            best_match = intent_id
            best_keywords = matches

    if best_match and best_count > 0:
        confidence = min(best_count / 3, 1.0)  # 最多1.0
        return {
            'intent': best_match,
            'confidence': confidence,
            'scene_code': INTENT_SCENE_MAP[best_match]['scene_code'],
            'role_code': INTENT_ROLE_MAP[best_match],
            'matched_keywords': best_keywords,
        }
    
    # 兜底: 通用品质分析
    return {
        'intent': 'general_quality',
        'confidence': 0.3,
        'scene_code': None,
        'role_code': 'quality_specialist',
        'matched_keywords': [],
    }


# ═══════════════════════════════════════════════
# 2. 上下文装配器
# ═══════════════════════════════════════════════

def assemble_context(trace_id: str, scene_code: str, role_code: str, user_input: str) -> dict:
    """
    组装Agent执行所需的完整上下文:
      1. 角色设定(prompt template)
      2. 历史记忆(同类场景的observation + analysis)
      3. 场景数据(最新的指标值)
      4. 工具清单(该场景可用的工具)
    """
    context = {
        'trace_id': trace_id,
        'scene_code': scene_code,
        'role_code': role_code,
        'user_input': user_input,
        'prompt_template': {},
        'memories': [],
        'indicators': {},
        'available_tools': [],
        'workflow_steps': [],
        'timestamp': datetime.now().isoformat(),
    }

    # ── 1. 角色设定 ──
    if scene_code:
        rows = _q(
            "SELECT template_code, role, system_prompt, temperature, model "
            "FROM ag_prompt_template WHERE scene_id=(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1) AND is_active=1",
            (scene_code,)
        )
        if rows:
            t = rows[0]
            context['prompt_template'] = {
                'code': t[0], 'role': t[1], 'system_prompt': t[2],
                'temperature': float(t[3]), 'model': t[4],
            }

    # ── 2. 历史记忆 ──
    memories = _q(
        "SELECT memory_type, memory_key, memory_value, created_at "
        "FROM ag_memory_store WHERE scene_id=(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1) "
        "AND is_persistent=1 ORDER BY created_at DESC LIMIT 5",
        (scene_code,)
    ) if scene_code else []
    context['memories'] = [
        {'type': m[0], 'key': m[1], 'value': json.loads(m[2]) if m[2] else {}, 'time': str(m[3])}
        for m in memories
    ]

    # ── 3. 场景最新指标 ──
    if scene_code:
        indicators = _q(
            "SELECT indicator_code, snapshot_value, snapshot_date "
            "FROM dg_indicator_snapshot "
            "WHERE scene_id=(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1) "
            "ORDER BY snapshot_date DESC LIMIT 10",
            (scene_code,)
        )
        context['indicators'] = {
            r[0]: {'value': float(r[1]) if r[1] else 0, 'time': str(r[2])}
            for r in indicators
        }

    # ── 4. 可用工具 ──
    tools = _q("SELECT tool_code, tool_name, tool_type, description FROM ag_tool_registry WHERE is_active=1 AND is_agent_tool=1")
    context['available_tools'] = [
        {'code': t[0], 'name': t[1], 'type': t[2], 'desc': t[3]} for t in tools
    ]

    # ── 5. 工作流步骤 ──
    if scene_code:
        steps = _q(
            "SELECT step_order, step_name, step_type, tool_code "
            "FROM ag_workflow_step WHERE workflow_code=%s AND is_active=1 ORDER BY step_order",
            (scene_code,)
        )
        context['workflow_steps'] = [
            {'order': s[0], 'name': s[1], 'type': s[2], 'tool': s[3]} for s in steps
        ]

    return context


# ═══════════════════════════════════════════════
# 3. Agent调度器 + 工作流执行
# ═══════════════════════════════════════════════

def dispatch_agent(trace_id: str, scene_code: str, role_code: str, user_input: str, user_info: dict = None) -> dict:
    """
    协调智能体主入口:
      1. 分类意图
      2. 装配上下文
      3. 创建工作流任务
      4. 返回trace_id(异步执行)
    """
    # ── 1. 意图分类(如果调用方没有预先分类) ──
    intent = classify_intent(user_input)
    if not scene_code and intent['scene_code']:
        scene_code = intent['scene_code']
    
    # ── 2. 装配上下文 ──
    context = assemble_context(trace_id, scene_code, role_code, user_input)
    
    # ── 3. 创建Agent任务记录 ──
    task_id = _q(
        "INSERT INTO ag_agent_task (trace_id, scene_id, skill_name, input_params, status) "
        "VALUES (%s, (SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1), %s, %s, 'pending')",
        (trace_id, scene_code, scene_code, json.dumps({
            'user_input': user_input,
            'intent': intent,
            'user_info': user_info,
        }, ensure_ascii=False)),
        fetch='none'
    )

    # ── 4. 保存初始记忆 ──
    _q(
        "INSERT INTO ag_memory_store (trace_id, memory_type, memory_key, memory_value, scene_id, is_persistent) "
        "VALUES (%s, 'observation', 'user_input', %s, (SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1), 1)",
        (trace_id, json.dumps({'input': user_input, 'intent': intent}, ensure_ascii=False), scene_code),
        fetch='none'
    )

    result = {
        'trace_id': trace_id,
        'task_id': task_id,
        'intent': intent,
        'scene_code': scene_code,
        'role_code': role_code,
        'context': {
            'prompt_template': context['prompt_template'],
            'workflow_steps': context['workflow_steps'],
            'memories_count': len(context['memories']),
            'indicators_count': len(context['indicators']),
            'tools_count': len(context['available_tools']),
        },
        'status': 'dispatched',
    }

    # ── 5. 尝试执行第一个工作流步骤(同步) ──
    if context['workflow_steps']:
        first_step = context['workflow_steps'][0]
        if first_step['type'] == 'query' and first_step['tool']:
            step_result = _execute_query_tool(first_step['tool'], trace_id, scene_code)
            result['first_step_result'] = step_result
            
            # 如果有数据+有AI分析步骤, 自动触发
            has_ai_step = any(s['type'] == 'ai_analysis' for s in context['workflow_steps'])
            if step_result.get('data') and len(step_result['data']) > 0 and has_ai_step:
                try:
                    from agent_runner import execute_workflow
                    # 获取场景ID和名称
                    scene_row = _q(
                        "SELECT id, scene_name FROM ap_scene_config WHERE scene_code=%s LIMIT 1",
                        (scene_code,), fetch='one'
                    )
                    if scene_row:
                        metrics = {item['code']: {'value': item['value'], 'time': item['time']} 
                                   for item in step_result['data']}
                        wf_result = execute_workflow(
                            trace_id, scene_code, scene_row[0], 
                            metrics, context['prompt_template']
                        )
                        result['workflow_triggered'] = True
                        result['ai_status'] = wf_result
                        # 更新任务状态
                        _q(
                            "UPDATE ag_agent_task SET status='running', started_at=NOW() WHERE trace_id=%s",
                            (trace_id,), fetch='none'
                        )
                except Exception as e:
                    logger.warning(f"AI trigger failed: {e}")
                    result['workflow_triggered'] = False
                    result['ai_trigger_error'] = str(e)

    return result


def _execute_query_tool(tool_code: str, trace_id: str, scene_code: str) -> dict:
    """执行查询类型工具 - 返回指标数据"""
    try:
        rows = _q(
            "SELECT indicator_code, snapshot_value, snapshot_date "
            "FROM dg_indicator_snapshot "
            "WHERE scene_id=(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1) "
            "ORDER BY snapshot_date DESC LIMIT 20",
            (scene_code,)
        )
        data = [{'code': r[0], 'value': float(r[1]) if r[1] else 0, 'time': str(r[2])} for r in rows]
        
        # 保存执行记忆
        _q(
            "INSERT INTO ag_memory_store (trace_id, memory_type, memory_key, memory_value, scene_id) "
            "VALUES (%s, 'observation', %s, %s, (SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1))",
            (trace_id, f'query_{tool_code}', json.dumps({'tool': tool_code, 'rows': len(data)}, ensure_ascii=False), scene_code),
            fetch='none'
        )
        return {'tool': tool_code, 'status': 'ok', 'data': data, 'count': len(data)}
    except Exception as e:
        logger.error(f"Query tool {tool_code} failed: {e}")
        return {'tool': tool_code, 'status': 'error', 'error': str(e)}


def get_agent_status(trace_id: str) -> dict:
    """查询Agent任务状态"""
    row = _q(
        "SELECT id, scene_id, skill_name, status, result, started_at, completed_at "
        "FROM ag_agent_task WHERE trace_id=%s", (trace_id,), fetch='one'
    )
    if not row:
        return {'error': 'trace_id not found'}

    # 获取关联记忆
    memories = _q(
        "SELECT memory_type, memory_key, memory_value, created_at "
        "FROM ag_memory_store WHERE trace_id=%s ORDER BY created_at", (trace_id,)
    )

    return {
        'task_id': row[0],
        'trace_id': trace_id,
        'status': row[3],
        'result': json.loads(row[4]) if row[4] else None,
        'started_at': str(row[5]) if row[5] else None,
        'completed_at': str(row[6]) if row[6] else None,
        'memories': [
            {'type': m[0], 'key': m[1], 'value': json.loads(m[2]) if m[2] else {}, 'time': str(m[3])}
            for m in memories
        ],
    }


# ═══════════════════════════════════════════════
# 4. 记忆管理
# ═══════════════════════════════════════════════

def save_memory(trace_id: str, mem_type: str, key: str, value: any, scene_code: str = None, persistent: bool = True):
    """保存记忆到长期存储"""
    scene_sql = "(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1)" if scene_code else "NULL"
    params = [trace_id, mem_type, key, json.dumps(value, ensure_ascii=False), scene_code if scene_code else None, 1 if persistent else 0]
    return _q(
        f"INSERT INTO ag_memory_store (trace_id, memory_type, memory_key, memory_value, scene_id, is_persistent) "
        f"VALUES (%s, %s, %s, %s, {scene_sql}, %s)",
        tuple(params), fetch='none'
    )


# ═══════════════════════════════════════════════
# 5. 超级智能体: 任务拆解与规划
# ═══════════════════════════════════════════════

def decompose_task(user_input: str, intent: dict, context: dict) -> list:
    """
    将用户复杂需求拆解为子任务序列
    
    返回: [{step, agent_role, action, tool, priority}]
    """
    steps = context.get('workflow_steps', [])
    if not steps:
        return [{'step': 1, 'agent_role': intent.get('role_code','quality_specialist'),
                 'action': 'analyze', 'tool': 'AI_ANALYSIS', 'priority': 1}]
    
    tasks = []
    for s in steps:
        tasks.append({
            'step': s['order'],
            'name': s['name'],
            'agent_role': intent.get('role_code', 'quality_specialist'),
            'action': s['type'],
            'tool': s['tool'],
            'priority': s['order'],
        })
    return tasks


# ═══════════════════════════════════════════════
# 6. 多Agent协作(为未来扩展预留)
# ═══════════════════════════════════════════════

def parallel_dispatch(user_input: str) -> dict:
    """
    多Agent并行协作:
      - 将用户问题广播给所有5个角色Agent
      - 每个Agent独立分析自己领域视角
      - 汇总为统一结果
    (Phase 2 扩展)
    """
    intent = classify_intent(user_input)
    return {
        'mode': 'parallel',
        'primary_intent': intent,
        'agents_invoked': list(INTENT_ROLE_MAP.values()),
        'trace_ids': [],
        'status': 'not_implemented_yet',  # Phase 2
    }
