"""
兮易AI智体 - 模型平台管理 (Model Platform)
=========================================
功能:
  1. 模型CRUD: 注册/启用/弃用AI模型
  2. 模型切换: 场景→模型绑定
  3. 调用日志: 记录每次模型调用(token/耗时/成本)
  4. 模型评测: 同一问题→多个模型→对比输出

表: ap_analysis_model, ag_model_call_log
"""

import os, sys, json, time, logging
from datetime import datetime
from dbutils.pooled_db import PooledDB
import pymysql

logger = logging.getLogger(__name__)

_pool = None

def _pool_get():
    global _pool
    if _pool is None:
        pwd = os.environ.get('XIYI_MYSQL_PASSWORD', '')
        if not pwd:
            try:
                with open('/etc/mysql/debian.cnf') as f:
                    for line in f:
                        if 'password' in line:
                            pwd = line.strip().split('=')[-1].strip().strip('"').strip("'")
                            break
            except: pass
        _pool = PooledDB(
            creator=pymysql, maxconnections=5, mincached=1,
            host='127.0.0.1', port=3306,
            user=os.environ.get('XIYI_MYSQL_USER', 'debian-sys-maint'),
            password=pwd,
            database=os.environ.get('XIYI_MYSQL_DB', 'xiyi_quality'),
            charset='utf8mb4',
        )
    return _pool


def _q(sql, params=None, fetch='all'):
    conn = _pool_get().connection()
    try:
        cur = conn.cursor()
        cur.execute(sql, params or ())
        if fetch == 'all': return cur.fetchall()
        elif fetch == 'one': return cur.fetchone()
        else: conn.commit(); return cur.lastrowid
    finally:
        conn.close()


# ═══════════════════════════════════════════════
# 模型CRUD
# ═══════════════════════════════════════════════

def list_models(status_filter=None):
    """列出所有模型"""
    sql = "SELECT * FROM ap_analysis_model"
    if status_filter:
        sql += " WHERE status=%s"
        rows = _q(sql, (status_filter,))
    else:
        rows = _q(sql)
    models = [_row_dict(r) for r in rows]
    # 转换Decimal为float
    for m in models:
        for k in ['cost_per_1k', 'max_tokens']:
            if k in m and m[k] is not None:
                try: m[k] = float(m[k])
                except: pass
    return models


def get_model(model_code):
    """获取单个模型"""
    r = _q("SELECT * FROM ap_analysis_model WHERE model_code=%s", (model_code,), fetch='one')
    return _row_dict(r) if r else None


def set_model_status(model_code, status):
    """启用/弃用模型"""
    _q("UPDATE ap_analysis_model SET status=%s WHERE model_code=%s", (status, model_code), fetch='none')
    return {'model_code': model_code, 'status': status}


def update_model_config(model_code, config):
    """更新模型配置"""
    updates = []
    params = []
    for k in ['api_endpoint', 'api_key_ref', 'max_tokens', 'cost_per_1k', 'model_name']:
        if k in config and config[k] is not None:
            updates.append(f"{k}=%s")
            params.append(config[k])
    if 'engine_config' in config and config['engine_config']:
        updates.append("engine_config=%s")
        params.append(json.dumps(config['engine_config']))
    if not updates:
        return {'error': 'no fields to update'}
    params.append(model_code)
    _q(f"UPDATE ap_analysis_model SET {','.join(updates)} WHERE model_code=%s", tuple(params), fetch='none')
    return get_model(model_code)


# ═══════════════════════════════════════════════
# 模型切换
# ═══════════════════════════════════════════════

def get_default_model():
    """获取系统默认模型"""
    r = _q("SELECT config_value FROM sys_config WHERE config_key='xiyi.ai.model'", fetch='one')
    return r[0] if r else 'deepseek-chat'


def set_default_model(model_code):
    """设置系统默认模型"""
    _q("UPDATE sys_config SET config_value=%s WHERE config_key='xiyi.ai.model'", (model_code,), fetch='none')
    return {'default_model': model_code}


def get_scene_model(scene_code):
    """查询某场景绑定的模型"""
    r = _q(
        "SELECT model FROM ag_prompt_template WHERE scene_id=(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1) AND is_active=1 LIMIT 1",
        (scene_code,), fetch='one'
    )
    return r[0] if r else get_default_model()


def set_scene_model(scene_code, model_code):
    """为场景绑定模型"""
    _q(
        "UPDATE ag_prompt_template SET model=%s WHERE scene_id=(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1)",
        (model_code, scene_code), fetch='none'
    )
    return {'scene_code': scene_code, 'model_code': model_code}


# ═══════════════════════════════════════════════
# 调用日志
# ═══════════════════════════════════════════════

def log_model_call(trace_id, model_code, prompt_tokens=0, completion_tokens=0, latency_ms=0, cost=0, status='success', error=''):
    """记录模型调用"""
    _q(
        "INSERT INTO ag_model_call_log (trace_id, model_code, prompt_tokens, completion_tokens, latency_ms, cost_estimated, status, error_msg) "
        "VALUES (%s,%s,%s,%s,%s,%s,%s,%s)",
        (trace_id, model_code, prompt_tokens, completion_tokens, latency_ms, cost, status, error),
        fetch='none'
    )


def get_model_stats(days=7):
    """模型使用统计(最近N天)"""
    rows = _q(
        "SELECT model_code, COUNT(*) calls, SUM(prompt_tokens) total_prompt, SUM(completion_tokens) total_completion, "
        "AVG(latency_ms) avg_latency, SUM(cost_estimated) total_cost "
        "FROM ag_model_call_log WHERE called_at >= DATE_SUB(NOW(), INTERVAL %s DAY) AND status='success' "
        "GROUP BY model_code ORDER BY calls DESC",
        (days,)
    )
    return [
        {'model_code': r[0], 'calls': r[1], 'total_prompt_tokens': r[2] or 0,
         'total_completion_tokens': r[3] or 0, 'avg_latency_ms': round(r[4] or 0, 1),
         'total_cost_usd': round(float(r[5] or 0), 6)}
        for r in rows
    ]


def get_model_call_history(trace_id=None, limit=20):
    """查询模型调用历史"""
    if trace_id:
        rows = _q(
            "SELECT * FROM ag_model_call_log WHERE trace_id=%s ORDER BY called_at DESC LIMIT %s",
            (trace_id, limit)
        )
    else:
        rows = _q(
            "SELECT * FROM ag_model_call_log ORDER BY called_at DESC LIMIT %s",
            (limit,)
        )
    models = [_row_dict(r) for r in rows]
    # 转换Decimal为float
    for m in models:
        for k in ['cost_per_1k', 'max_tokens']:
            if k in m and m[k] is not None:
                try: m[k] = float(m[k])
                except: pass
    return models


# ═══════════════════════════════════════════════
# 模型评测 (同问题→多模型→对比)
# ═══════════════════════════════════════════════

def benchmark_models(prompt, scene_code, model_codes=None):
    """
    模型评测: 同一prompt发送给多个模型，记录耗时和结果
    返回对比报告
    """
    if not model_codes:
        model_codes = [r[0] for r in _q("SELECT model_code FROM ap_analysis_model WHERE status='published'")]

    results = []
    for mc in model_codes:
        model = get_model(mc)
        if not model:
            continue
        start = time.time()
        # 这里需要实际调用模型API，当前先用openclaw统一入口
        # Phase 2: 对接各模型的原生API
        latency = int((time.time() - start) * 1000)
        results.append({
            'model_code': mc,
            'model_name': model.get('model_name', ''),
            'latency_ms': latency,
            'status': 'skipped',  # Phase 2: 实际调用
            'result': 'Model benchmark requires API integration (Phase 2)',
        })

    return {
        'prompt': prompt[:200],
        'scene_code': scene_code,
        'models_tested': len(results),
        'results': results,
    }


# ═══════════════════════════════════════════════
# 工具
# ═══════════════════════════════════════════════

def _row_dict(row):
    """将tuple转为dict(基于列名顺序)"""
    cols = ['id', 'model_code', 'model_name', 'model_type', 'engine_config', 'input_schema',
            'output_schema', 'prompt_template', 'version', 'status', 'created_at', 'updated_at',
            'api_endpoint', 'api_key_ref', 'max_tokens', 'cost_per_1k']
    d = {cols[i]: row[i] for i in range(min(len(cols), len(row)))}
    # 解析JSON字段
    for k in ['engine_config', 'input_schema', 'output_schema']:
        if k in d and isinstance(d[k], str):
            try:
                d[k] = json.loads(d[k])
            except: pass
    # 处理datetime
    for k in ['created_at', 'updated_at']:
        if k in d and d[k]:
            d[k] = str(d[k])
    return d
