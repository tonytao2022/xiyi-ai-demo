"""
兮易AI智体 - AI分析执行器 (Agent AI Runner)
==========================================
功能:
  1. 异步后台执行AI推理(openclaw)
  2. 进度跟踪(10%-100%)
  3. 与coordinator_engine配合: trace_id可追踪完整链路
  4. 结果存入ag_agent_task.result + ag_memory_store

用法:
  from agent_runner import run_ai_analysis
  run_ai_analysis(trace_id, scene_id, scene_code, metrics_data, prompt_template)
"""

import os, sys, json, uuid, logging, threading, subprocess
from datetime import datetime

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════
# 数据库辅助(独立连接,避免连接池冲突)
# ═══════════════════════════════════════════════

def _direct_conn():
    import pymysql
    pwd = os.environ.get('XIYI_MYSQL_PASSWORD', '')
    if not pwd:
        try:
            with open('/etc/mysql/debian.cnf') as f:
                for line in f:
                    if 'password' in line:
                        pwd = line.strip().split('=')[-1].strip().strip('"').strip("'")
                        break
        except: pass
    return pymysql.connect(
        host='127.0.0.1', port=3306,
        user=os.environ.get('XIYI_MYSQL_USER', 'debian-sys-maint'),
        password=pwd,
        database=os.environ.get('XIYI_MYSQL_DB', 'xiyi_quality'),
        charset='utf8mb4'
    )


def _update_progress(trace_id, step, msg, pct=0):
    """更新Agent任务进度"""
    try:
        conn = _direct_conn()
        cur = conn.cursor()
        cur.execute("SELECT input_params FROM ag_agent_task WHERE trace_id=%s", (trace_id,))
        row = cur.fetchone()
        params = json.loads(row[0]) if row and row[0] else {}
        params['step'] = step
        params['progress'] = msg
        params['pct'] = pct
        cur.execute("UPDATE ag_agent_task SET input_params=%s WHERE trace_id=%s",
                    (json.dumps(params, ensure_ascii=False), trace_id))
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        logger.warning(f"progress update failed: {e}")


def _save_result(trace_id, result_dict):
    """保存AI分析结果"""
    try:
        conn = _direct_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE ag_agent_task SET status='done', result=%s, completed_at=NOW() WHERE trace_id=%s",
            (json.dumps(result_dict, ensure_ascii=False), trace_id)
        )
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        logger.error(f"save result failed: {e}")


def _save_error(trace_id, error_msg):
    """保存错误"""
    try:
        conn = _direct_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE ag_agent_task SET status='error', result=%s WHERE trace_id=%s",
            (json.dumps({'error': error_msg}, ensure_ascii=False), trace_id)
        )
        conn.commit()
        cur.close(); conn.close()
    except: pass


def _save_memory(trace_id, mem_type, key, value, scene_code=None):
    """保存记忆"""
    try:
        conn = _direct_conn()
        cur = conn.cursor()
        scene_sql = "(SELECT id FROM ap_scene_config WHERE scene_code=%s LIMIT 1)" if scene_code else "NULL"
        params = [trace_id, mem_type, key, json.dumps(value, ensure_ascii=False)]
        if scene_code:
            params.append(scene_code)
            cur.execute(
                f"INSERT INTO ag_memory_store (trace_id, memory_type, memory_key, memory_value, scene_id, is_persistent) "
                f"VALUES (%s,%s,%s,%s,{scene_sql},1)",
                tuple(params)
            )
        else:
            cur.execute(
                "INSERT INTO ag_memory_store (trace_id, memory_type, memory_key, memory_value, is_persistent) "
                "VALUES (%s,%s,%s,%s,1)",
                tuple(params)
            )
        conn.commit()
        cur.close(); conn.close()
    except Exception as e:
        logger.warning(f"save_memory failed: {e}")


# ═══════════════════════════════════════════════
# AI分析执行器
# ═══════════════════════════════════════════════

def run_ai_analysis(trace_id, scene_id, scene_code, scene_name, metrics_data, prompt_template=None):
    """
    异步执行AI分析(后台线程)
    
    参数:
      trace_id: 链路追踪ID
      scene_id: 场景ID
      scene_code: 场景编码(如QUAL_01)
      scene_name: 场景名称
      metrics_data: 场景指标数据 dict {code: {value, time}}
      prompt_template: 可选, system_prompt字典
    
    通过 ag_agent_task 跟踪进度:
      10% → fetch_metrics
      25% → metrics_ready
      30% → calling_llm (openclaw)
      70% → parsing
      85% → analyzing
      100% → done
    """
    def _run():
        try:
            # ── 1. 数据准备 ──
            _update_progress(trace_id, 'prepare', '正在准备分析数据...', 10)
            
            # 构建数据摘要
            metrics_summary_lines = []
            for code, info in metrics_data.items():
                val = info.get('value', info) if isinstance(info, dict) else info
                time_str = info.get('time', '') if isinstance(info, dict) else ''
                metrics_summary_lines.append(f"  {code}: {val} {time_str}")
            metrics_summary = '\n'.join(metrics_summary_lines) if metrics_summary_lines else '暂无指标数据'

            # ── 2. 构建Prompt ──
            _update_progress(trace_id, 'build_prompt', '正在构建分析提示词...', 20)
            
            system_prompt = prompt_template.get('system_prompt', '你是专业品质分析助手') if prompt_template else '你是专业品质分析助手'
            
            user_prompt = f"""请基于以下品质数据进行分析:

【场景】{scene_name} ({scene_code})
【指标数据】
{metrics_summary}

请按以下结构输出:
## 1. 当前品质状况评估
- 总体合格率水平
- 与目标值对比
## 2. 异常指标识别
- 哪些指标偏离正常范围
- 异常严重程度排序
## 3. 根因分析(4M1E)
- 人(Man): 操作规范检查
- 机(Machine): 设备状态排查
- 料(Material): 原料质量排查
- 法(Method): 工艺参数检查
- 环(Environment): 环境因素排查
## 4. 改进建议
- 短期措施(1-3天)
- 长期措施(1-4周)
## 5. 下一步行动计划
"""

            # ── 3. 调用OpenClaw推理 ──
            _update_progress(trace_id, 'calling_llm', '正在调用AI大模型分析(约20-60秒)...', 30)
            
            full_prompt = f"{system_prompt}\n\n{user_prompt}"
            
            # 设置环境变量
            env = os.environ.copy()
            env['HOME'] = '/root'
            env['XDG_RUNTIME_DIR'] = '/run/user/0'
            nvm_bin = '/root/.nvm/versions/node/v22.22.1/bin'
            if os.path.exists(nvm_bin):
                env['NVM_BIN'] = nvm_bin
                env['PATH'] = nvm_bin + ':' + env.get('PATH', '')
            
            logger.info(f"[AI_RUNNER] Calling openclaw for trace_id={trace_id}")
            
            result = subprocess.run(
                ['openclaw', 'agent', '-m', full_prompt, '--agent', 'main', '--json'],
                capture_output=True, text=True, timeout=180,
                env=env
            )
            
            # ── 4. 解析结果 ──
            _update_progress(trace_id, 'parsing', '正在解析AI返回结果...', 70)
            
            ai_text = ''
            output = result.stdout.strip()
            if output:
                # 尝试解析JSON输出
                try:
                    json_out = json.loads(output)
                    payloads = json_out.get('result', {}).get('payloads', [])
                    if payloads:
                        ai_text = payloads[0].get('text', '')
                except:
                    try:
                        lines = output.strip().split('\n')
                        last_line = lines[-1]
                        json_out = json.loads(last_line)
                        payloads = json_out.get('result', {}).get('payloads', [])
                        if payloads:
                            ai_text = payloads[0].get('text', '')
                    except:
                        ai_text = output[:3000]
            
            if not ai_text:
                ai_text = 'AI分析完成，但未返回文本内容。请检查数据源。'
            
            # ── 5. 保存结果 ──
            _update_progress(trace_id, 'saving', '正在保存分析结果...', 85)
            
            # 检测是否有异常
            has_alarm = any(kw in ai_text for kw in ['异常', '预警', '超标', '不合格', '偏离', '下降'])
            
            report = {
                'trace_id': trace_id,
                'scene_id': scene_id,
                'scene_code': scene_code,
                'scene_name': scene_name,
                'metrics_summary': metrics_summary,
                'ai_analysis': ai_text,
                'has_alarm': has_alarm,
                'analysis_time': datetime.now().isoformat(),
            }
            
            _save_result(trace_id, report)
            
            # 保存记忆
            _save_memory(trace_id, 'analysis', f'{scene_code}_analysis', {
                'scene_name': scene_name,
                'ai_summary': ai_text[:500],
                'has_alarm': has_alarm,
            }, scene_code)
            
            _update_progress(trace_id, 'done', '分析完成', 100)
            logger.info(f"[AI_RUNNER] Analysis completed for trace_id={trace_id}")
            
        except subprocess.TimeoutExpired:
            _save_error(trace_id, 'AI分析超时(180秒), 请稍后重试')
            logger.warning(f"[AI_RUNNER] Timeout for trace_id={trace_id}")
        except Exception as e:
            _save_error(trace_id, str(e))
            logger.error(f"[AI_RUNNER] Error for trace_id={trace_id}: {e}")

    # 启动后台线程
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    return {'trace_id': trace_id, 'status': 'started', 'message': 'AI分析已启动'}


# ═══════════════════════════════════════════════
# 工作流执行器(完整多步骤)
# ═══════════════════════════════════════════════

def execute_workflow(trace_id, scene_code, scene_id, metrics_data, prompt_template):
    """
    执行完整工作流: 查询→AI分析→规则验证→结果汇总
    
    返回: { status, steps_completed, result }
    """
    scene_name = prompt_template.get('code', scene_code) if prompt_template else scene_code
    
    # Step 1: 数据已由coordinator准备好
    _update_progress(trace_id, 'workflow_step1', '数据查询完成', 25)
    
    # Step 2: AI分析(异步)
    run_ai_analysis(trace_id, scene_id, scene_code, scene_name, metrics_data, prompt_template)
    
    return {
        'trace_id': trace_id,
        'scene_code': scene_code,
        'status': 'running',
        'steps': ['data_query', 'ai_analysis_started'],
        'message': 'AI分析已在后台启动, 请通过 /agent/status/{trace_id} 查询结果'
    }
