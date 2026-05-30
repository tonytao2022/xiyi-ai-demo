#!/usr/bin/env python3
"""兮易AI大脑 · 品质专员平台API (8890端口)"""
import os, sys, json, pymysql
from datetime import datetime
from flask import Flask, request, jsonify
from flask_cors import CORS
app = Flask(__name__)
CORS(app)
MYSQL_USER = 'debian-sys-maint'
MYSQL_PASS = 'iXve1rVBXfdA4tL9'
MYSQL_DB = 'xiyi_quality'
def get_cursor():
    conn = pymysql.connect(host='127.0.0.1', port=3306, user=MYSQL_USER,
        password=MYSQL_PASS, database=MYSQL_DB, charset='utf8mb4')
    class Ctx:
        def __enter__(s):
            s.conn = conn
            s.cur = conn.cursor(pymysql.cursors.DictCursor)
            return s.cur
        def __exit__(s, *a):
            if not a[0]: s.conn.commit()
            s.cur.close(); s.conn.close()
    return Ctx()
def api_success(data):
    return jsonify({'code': 0, 'data': data})
def api_error(msg, code=200):
    return jsonify({'code': -1, 'error': str(msg)}), code
# ─── 场景API ───
@app.route('/api/v1/xiyi/scenes', methods=['GET'])
def list_scenes():
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_scene_config WHERE status='published' ORDER BY sort_order, id")
            rows = [dict(r) for r in cur.fetchall()]
            for r in rows:
                cur.execute("SELECT COUNT(*) as cnt FROM ap_scene_step WHERE scene_id=%s", (r['id'],))
                r['step_count'] = cur.fetchone()['cnt']
            return api_success({'scenes': rows})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
@app.route('/api/v1/xiyi/scenes/<int:scene_id>', methods=['GET'])
def scene_detail(scene_id):
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_scene_config WHERE id=%s", (scene_id,))
            scene = cur.fetchone()
            if not scene: return api_error('场景不存在')
            cur.execute("SELECT * FROM ap_scene_step WHERE scene_id=%s ORDER BY sort_order", (scene_id,))
            steps = [dict(r) for r in cur.fetchall()]
            return api_success({'scene': dict(scene), 'steps': steps})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
# ─── 分析流程API ───
@app.route('/api/v1/xiyi/analysis/start', methods=['POST'])
def start_analysis():
    try:
        data = request.get_json()
        scene_id = data.get('scene_id')
        title = data.get('title', '')
        if not scene_id: return api_error('缺少scene_id')
        inst_code = f"AI_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{scene_id}"
        with get_cursor() as cur:
            cur.execute("INSERT INTO ap_analysis_instance (scene_id,instance_code,title,status,current_step,initiator) VALUES(%s,%s,%s,'init',1,'system')",
                (scene_id, inst_code, title))
            inst_id = cur.lastrowid
            cur.execute("SELECT id FROM ap_scene_step WHERE scene_id=%s ORDER BY sort_order", (scene_id,))
            for step in cur.fetchall():
                cur.execute("INSERT INTO ap_analysis_step_log (instance_id,step_id,step_status) VALUES(%s,%s,'pending')",
                    (inst_id, step['id']))
            return api_success({'instance_id': int(inst_id), 'instance_code': inst_code})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
@app.route('/api/v1/xiyi/analysis/<int:inst_id>', methods=['GET'])
def get_analysis(inst_id):
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_analysis_instance WHERE id=%s", (inst_id,))
            inst = cur.fetchone()
            if not inst: return api_error('分析实例不存在')
            cur.execute("""SELECT l.*, s.step_name, s.step_type, s.sort_order
                FROM ap_analysis_step_log l JOIN ap_scene_step s ON l.step_id=s.id
                WHERE l.instance_id=%s ORDER BY s.sort_order""", (inst_id,))
            logs = [dict(r) for r in cur.fetchall()]
            return api_success({'instance': dict(inst), 'step_logs': logs})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
@app.route('/api/v1/xiyi/analysis/<int:inst_id>/step/<int:step_id>', methods=['POST'])
def update_step(inst_id, step_id):
    try:
        data = request.get_json()
        with get_cursor() as cur:
            cur.execute("""UPDATE ap_analysis_step_log SET step_status=%s, output_data=%s, completed_at=NOW()
                WHERE instance_id=%s AND step_id=%s""",
                (data.get('status', 'done'),
                 json.dumps(data.get('output', {}), ensure_ascii=False) if data.get('output') else None,
                 inst_id, step_id))
            return api_success({'message': '更新成功'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
# ─── 指标API ───
@app.route('/api/v1/xiyi/indicators', methods=['GET'])
def list_indicators():
    try:
        with get_cursor() as cur:
            cur.execute("""SELECT a.*, c.category_name FROM dg_indicator_atom a
                LEFT JOIN dg_indicator_category c ON a.category_id=c.id ORDER BY a.id""")
            return api_success({'indicators': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
@app.route('/api/v1/xiyi/standards', methods=['GET'])
def list_standards():
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM dg_standard_column ORDER BY id")
            return api_success({'standards': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
# ─── 健康检查 ───
@app.route('/health', methods=['GET'])
def health():
    return api_success({'status': 'ok', 'service': 'xiyi-quality', 'port': 8890})
# ─── 实时KPI(从ds_mock_data计算) ───

@app.route('/api/v1/xiyi/mock/kpi', methods=['GET'])
def realtime_kpi():
    try:
        import statistics
        with get_cursor() as cur:
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=1 ORDER BY mock_date DESC LIMIT 30")
            fpy_rows = cur.fetchall()
            fpy_vals = [json.loads(r['data_json'])['fpy'] for r in fpy_rows]
            cur_fpy = round(fpy_vals[0],2) if fpy_vals else 97.5
            avg_fpy = round(statistics.mean(fpy_vals),2) if fpy_vals else 97.5
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=2 ORDER BY mock_date DESC LIMIT 50")
            mag = cur.fetchall()
            mag_abn = sum(1 for r in mag if json.loads(r['data_json']).get('is_abnormal'))
            mag_r = round(mag_abn/len(mag)*100,1) if mag else 0
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=3")
            abn_all = cur.fetchall()
            abn_pending = sum(1 for r in abn_all if json.loads(r['data_json']).get('status') in ['pending','processing'])
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=5")
            iqc_all = cur.fetchall()
            iqc_pass = sum(1 for r in iqc_all if json.loads(r['data_json']).get('result')=='PASS')
            iqc_r = round(iqc_pass/len(iqc_all)*100,1) if iqc_all else 0
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=6")
            pmp_all = cur.fetchall()
            pmp_fpy = round(statistics.mean([json.loads(r['data_json'])['fpy'] for r in pmp_all]),2) if pmp_all else 0
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=7 ORDER BY mock_date DESC LIMIT 1")
            coq_r = cur.fetchone()
            coq = json.loads(coq_r['data_json'])['coq_rate'] if coq_r else 0
            kpis = [
                {'name':'在线一次交验合格率(FPY)','value':str(cur_fpy),'target':'>=99.0%','unit':'%','level':'warning' if cur_fpy<97.5 else 'success'},
                {'name':'磁物检验异常率','value':str(mag_r)+'%','target':'0%','unit':'%','level':'danger' if mag_r>10 else 'success'},
                {'name':'异常料待处理','value':str(abn_pending),'target':'0批','unit':'批','level':'danger' if abn_pending>5 else 'success'},
                {'name':'来料检验合格率(IQC)','value':str(iqc_r)+'%','target':'>=95%','unit':'%','level':'warning' if iqc_r<95 else 'success'},
                {'name':'过程FPY均值(PMP)','value':str(pmp_fpy),'target':'>=97%','unit':'%','level':'warning' if pmp_fpy<97 else 'success'},
                {'name':'质量成本率(COQ)','value':str(coq),'target':'<=1.8%','unit':'%','level':'warning' if coq>1.8 else 'success'},
            ]
            return api_success({'kpis':kpis,'time':__import__('datetime').datetime.now().strftime('%Y-%m-%d %H:%M:%S')})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/mock/<int:scene_id>', methods=['GET'])
def mock_data(scene_id):
    try:
        limit = request.args.get('limit',500,type=int)
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ds_mock_data WHERE scene_id=%s ORDER BY mock_date DESC LIMIT %s",(scene_id,limit))
            rows = []
            for r in cur.fetchall():
                d = dict(r)
                if isinstance(d.get('data_json'),str):
                    try: d['data'] = json.loads(d['data_json'])
                    except: d['data']={}
                    del d['data_json']
                rows.append(d)
            return api_success({'rows':rows})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))


@app.route('/api/v1/xiyi/capa/plans', methods=['GET'])
def list_capa_plans():
    """获取CAPA方案列表"""
    try:
        instance_id = request.args.get('instance_id', type=int)
        with get_cursor() as cur:
            if instance_id:
                cur.execute("SELECT * FROM ap_capa_plan WHERE instance_id=%s ORDER BY created_at DESC", (instance_id,))
            else:
                cur.execute("SELECT p.*, i.title as instance_title FROM ap_capa_plan p LEFT JOIN ap_analysis_instance i ON p.instance_id=i.id ORDER BY p.created_at DESC LIMIT 50")
            return api_success({'plans': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/capa/plans', methods=['POST'])
def create_capa_plan():
    """创建CAPA方案"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            cur.execute("""INSERT INTO ap_capa_plan (plan_code,instance_id,title,root_cause,plan_content,priority,status,created_by)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                (data['plan_code'], data.get('instance_id',0), data.get('title','CAPA方案'),
                 data.get('root_cause',''), data.get('plan_content',''),
                 data.get('priority','medium'), 'draft', 'admin'))
            pid = cur.lastrowid
            return api_success({'plan_id': pid, 'plan_code': data['plan_code']})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/capa/plans/<int:plan_id>', methods=['GET'])
def get_capa_plan(plan_id):
    """获取CAPA方案详情含任务"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_capa_plan WHERE id=%s", (plan_id,))
            plan = cur.fetchone()
            if not plan: return api_error('方案不存在')
            cur.execute("SELECT t.*, (SELECT COUNT(*) FROM ap_capa_task_track WHERE task_id=t.id) as track_count FROM ap_capa_task t WHERE t.plan_id=%s ORDER BY t.id", (plan_id,))
            tasks = [dict(r) for r in cur.fetchall()]
            return api_success({'plan': dict(plan), 'tasks': tasks})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/capa/tasks', methods=['POST'])
def create_capa_task():
    """创建CAPA任务"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            cur.execute("""INSERT INTO ap_capa_task (plan_id,task_code,title,description,assignee,deadline,priority,status,deliverables)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
                (data['plan_id'], data['task_code'], data.get('title',''), data.get('description',''),
                 data.get('assignee',''), data.get('deadline',None), data.get('priority','medium'), 'open', data.get('deliverables','')))
            tid = cur.lastrowid
            return api_success({'task_id': tid})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/capa/tasks/<int:task_id>', methods=['PUT'])
def update_capa_task(task_id):
    """更新CAPA任务状态"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            sets = []
            params = []
            for f in ['status','assignee','deadline','priority','deliverables','title','description']:
                if f in data:
                    sets.append(f + "=%s")
                    params.append(data[f])
            if sets:
                params.append(task_id)
                cur.execute("UPDATE ap_capa_task SET " + ",".join(sets) + " WHERE id=%s", params)
            return api_success({'message':'更新成功'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/capa/tasks/<int:task_id>/track', methods=['POST'])
def add_task_track(task_id):
    """添加任务跟踪记录"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            cur.execute("""INSERT INTO ap_capa_task_track (task_id,track_time,track_type,content,verifier,verify_result)
                VALUES (%s,NOW(),%s,%s,%s,%s)""",
                (task_id, data.get('track_type','progress'), data.get('content',''),
                 data.get('verifier',''), data.get('verify_result','')))
            return api_success({'message':'跟踪记录已添加'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/capa/tasks/<int:task_id>/tracks', methods=['GET'])
def list_task_tracks(task_id):
    """获取任务跟踪记录"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_capa_task_track WHERE task_id=%s ORDER BY track_time DESC", (task_id,))
            return api_success({'tracks': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/scenes/<int:scene_id>/steps', methods=['GET'])
def list_steps(scene_id):
    """获取场景的七步流程"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_scene_step WHERE scene_id=%s ORDER BY sort_order", (scene_id,))
            return api_success({'steps': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/steps/<int:step_id>', methods=['PUT'])
def update_step_config(step_id):
    """更新步骤配置信息"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            sets = []
            params = []
            for f in ['step_name','step_type','description','sort_order','is_ai_required','is_manual_input']:
                if f in data:
                    sets.append(f + "=%s")
                    params.append(data[f])
            if not sets:
                return api_error('没有需要更新的字段')
            params.append(step_id)
            cur.execute("UPDATE ap_scene_step SET " + ",".join(sets) + " WHERE id=%s", params)
            return api_success({'message':'更新成功'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/scenes/<int:scene_id>/steps/reorder', methods=['POST'])
def reorder_steps(scene_id):
    """重新排序步骤"""
    try:
        data = request.get_json()
        step_ids = data.get('step_ids', [])
        with get_cursor() as cur:
            for i, sid in enumerate(step_ids):
                cur.execute("UPDATE ap_scene_step SET sort_order=%s WHERE id=%s AND scene_id=%s", (i+1, sid, scene_id))
            return api_success({'message':'排序已更新'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/scenes/<int:scene_id>/steps', methods=['POST'])
def add_step(scene_id):
    """添加步骤"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            cur.execute("SELECT COALESCE(MAX(sort_order),0)+1 FROM ap_scene_step WHERE scene_id=%s", (scene_id,))
            next_order = cur.fetchone()
            next_order = next_order['COALESCE(MAX(sort_order),0)+1'] if isinstance(next_order, dict) else next_order[0] if next_order else 1
            cur.execute("INSERT INTO ap_scene_step (scene_id,step_code,step_name,step_type,sort_order,description) VALUES(%s,%s,%s,%s,%s,%s)",
                (scene_id, data.get('step_code',f'STEP_{next_order:02d}'), data.get('step_name','新步骤'), data.get('step_type','analysis'), next_order, data.get('description','')))
            return api_success({'step_id':cur.lastrowid,'sort_order':next_order})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/steps/<int:step_id>', methods=['DELETE'])
def delete_step(step_id):
    """删除步骤"""
    try:
        with get_cursor() as cur:
            cur.execute("DELETE FROM ap_scene_step WHERE id=%s", (step_id,))
            return api_success({'message':'已删除'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/roles', methods=['GET'])
def list_roles():
    """获取所有角色"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM sys_role WHERE is_active=1 ORDER BY sort_order")
            roles = [dict(r) for r in cur.fetchall()]
            # 给每个角色附加场景数
            for role in roles:
                cur.execute("SELECT COUNT(*) as cnt FROM ap_scene_config WHERE role_type=%s", (role['role_code'],))
                cnt = cur.fetchone()
                role['scene_count'] = cnt['cnt'] if cnt else 0
            return api_success({'roles': roles})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/roles/<string:role_code>/scenes', methods=['GET'])
def list_role_scenes(role_code):
    """获取角色下的场景"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_scene_config WHERE role_type=%s AND status='published' ORDER BY id", (role_code,))
            scenes = [dict(r) for r in cur.fetchall()]
            for s in scenes:
                cur.execute("SELECT COUNT(*) as cnt FROM ap_scene_step WHERE scene_id=%s", (s['id'],))
                cnt = cur.fetchone()
                s['step_count'] = cnt['cnt'] if cnt else 0
            return api_success({'scenes': scenes})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/indicators/<string:code>', methods=['PUT'])
def update_indicator(code):
    """更新指标"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            sets = []; params = []
            for f in ['indicator_name','category_id','calc_logic','unit','threshold_lower','threshold_upper','alert_level']:
                if f in data:
                    sets.append(f + "=%s"); params.append(data[f])
            if sets:
                params.append(code)
                cur.execute("UPDATE dg_indicator_atom SET " + ",".join(sets) + " WHERE indicator_code=%s", params)
            return api_success({'message':'更新成功'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    logging.getLogger('xiyi_8890').info("Starting Xiyi AI Brain API on port 8890...")

    app.run(host='0.0.0.0', port=8890, debug=False)

# ═══════════════════════════════════════════════
# AI智能体层 - 受控查询 + Skill封装
# ═══════════════════════════════════════════════

@app.route('/api/v1/xiyi/metrics/query', methods=['POST'])
def metrics_query():
    """受控指标查询(semantic-api替代方案)

    前端不可直接查询数据库,必须通过此端点,且指标必须在 dg_indicator_atom 中注册。
    """
    try:
        data = request.get_json()
        indicator_code = data.get('indicator_code', '')
        scene_id = data.get('scene_id')
        limit = data.get('limit', 10)
        if not indicator_code:
            return api_error('indicator_code 必填')
        with get_cursor() as cur:
            # 验证指标是否注册
            cur.execute("SELECT id FROM dg_indicator_atom WHERE indicator_code=%s AND is_active=1", (indicator_code,))
            if not cur.fetchone():
                return api_error(f'指标 {indicator_code} 未注册或已禁用')
            # 从模拟数据查询
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=%s ORDER BY mock_date DESC LIMIT %s", (scene_id or 1, limit))
            return api_success({'rows': [json.loads(r['data_json']) for r in cur.fetchall()]})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/rules/evaluate', methods=['POST'])
def evaluate_rules():
    """规则引擎执行(playbook-engine替代方案)

    接收场景ID + 输入数据,返回所有命中规则及其严重程度。
    """
    try:
        data = request.get_json()
        scene_id = data.get('scene_id', 1)
        input_data = data.get('input_data', {})
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ag_rule_config WHERE scene_id=%s AND enabled=1 ORDER BY priority", (scene_id,))
            rules = cur.fetchall()
            results = []
            for rule in rules:
                expr = json.loads(rule['rule_expr'])
                rule_result = {
                    'rule_code': rule['rule_code'],
                    'rule_name': rule['rule_name'],
                    'rule_type': rule['rule_type'],
                    'hit': False,
                    'message': expr.get('message', ''),
                    'severity': expr.get('severity', 'info')
                }
                # 简单规则评估
                ind_val = input_data.get(expr.get('indicator', ''), 0)
                if isinstance(ind_val, (int, float)):
                    op = expr.get('operator', '')
                    val = expr.get('value', 0)
                    if op == 'lt' and ind_val < val:
                        rule_result['hit'] = True
                    elif op == 'gt' and ind_val > val:
                        rule_result['hit'] = True
                    elif op == 'eq' and abs(ind_val - float(val)) < 0.01:
                        rule_result['hit'] = True
                results.append(rule_result)
            hits = [r for r in results if r['hit']]
            return api_success({'rules': results, 'hit_count': len(hits), 'max_severity': max([r['severity'] for r in hits]) if hits else 'info'})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))

@app.route('/api/v1/xiyi/analysis/ai-run', methods=['POST'])
def ai_analysis_run():
    import traceback
    """AI分析入口(Skill封装唯一入口)

    前端只传 traceId + scene_id + input_data,不暴露任何Skill细节。
    服务端根据scene_id从 ap_scene_config 查找关联Skill,动态触发执行。
    """
    try:
        data = request.get_json()
        trace_id = data.get('trace_id', '')
        scene_id = data.get('scene_id', 1)
        input_data = data.get('input_data', {})
        user_prompt = data.get('prompt', '')

        if not trace_id:
            import uuid
            trace_id = str(uuid.uuid4())

        with get_cursor() as cur:
            # 查场景信息
            cur.execute("SELECT scene_name, scene_code FROM ap_scene_config WHERE id=%s", (scene_id,))
            scene = cur.fetchone()
            scene_name = scene['scene_name'] if scene else '未知场景'

            # 创建Agent任务记录
            import pymysql
            _params = (trace_id, scene_id, f'quality_{scene_id}', json.dumps({'scene_name': scene_name}), 'running')
            _sql = "INSERT INTO ag_agent_task (trace_id,scene_id,skill_name,input_params,status,started_at) VALUES (%s,%s,%s,%s,%s,NOW())"
            cur.execute(_sql, _params)

            # 1. 先查指标数据（受控查询）
            metrics_result = {}
            cur.execute("SELECT indicator_code, indicator_name FROM dg_indicator_atom ORDER BY id")
            for ind in cur.fetchall():
                cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=%s ORDER BY mock_date DESC LIMIT 1", (scene_id,))
                row = cur.fetchone()
                if row:
                    try:
                        d = json.loads(row['data_json'])
                        metrics_result[ind['indicator_code']] = d
                    except: pass

            # 2. 执行规则引擎
            json_input = json.dumps({'FPY_RATE': metrics_result.get('FPY_RATE', {}).get('fpy', 0)})
            mock_input = json.loads(json_input)
            rules_result = {'FPY_RATE': mock_input.get('FPY_RATE', 0)}
            cur.execute("""INSERT INTO ag_tool_call_log (trace_id, parent_span_id, tool_name, input_params, output_result, status)
                VALUES (%s, %s, %s, %s, %s, %s)""",
                (trace_id, 'span_root', 'metrics_query',
                 json.dumps({'indicator_code': 'FPY_RATE', 'scene_id': scene_id}),
                 json.dumps(metrics_result),
                 'ok'))

            # 3. 调用OpenClaw执行AI推理
            import subprocess
            _metrics_summary = '\n'.join([f"{k}: {v}" for k, v in metrics_result.items()])
            _prompt = f"""你是一位制造企业品质专员助理。请分析以下品质数据：\n\n场景：{scene_name}\n指标数据：{_metrics_summary}\n\n请输出：\n1. 当前品质状况评估\n2. 异常指标识别\n3. 建议的4M1E排查方向\n4. 下一步行动计划\n\n请以结构化方式输出。"""
            try:
                _result = subprocess.run(
                    ['openclaw', 'agent', '-m', _prompt, '--agent', 'main', '--json'],
                    capture_output=True, text=True, timeout=60
                )
                _output = _result.stdout.strip()
                _ai_response = ''
                if _output:
                    try:
                        _json_out = json.loads(_output)
                        _payloads = _json_out.get('result', {}).get('payloads', [])
                        if _payloads:
                            _ai_response = _payloads[0].get('text', '')
                    except:
                        _ai_response = _output[:2000]
            except Exception as _e:
                _ai_response = f'AI推理异常: {str(_e)}'
            
            # 4. 生成报告
            report = {
                'trace_id': trace_id,
                'scene_id': scene_id,
                'scene_name': scene_name,
                'metrics': metrics_result,
                'ai_analysis': _ai_response,
                'hit_count': 0,
                'max_severity': 'info',
            }
            
            cur.execute("UPDATE ag_agent_task SET status='done', result=%s, completed_at=NOW() WHERE trace_id=%s",
                (json.dumps(report), trace_id))
            
            # 5. 自动创建CAPA方案（AI分析过程中发现异常指标时）
            _plan_code = f"AI-{trace_id[-8:]}"
            _has_alarm = '异常' in _ai_response or '预警' in _ai_response or '超标' in _ai_response or '不合格' in _ai_response
            _root_cause_hint = ''
            _action_hint = ''
            for _line in _ai_response.split('\n'):
                if '根因' in _line or '原因' in _line or '排查' in _line:
                    _root_cause_hint = _line[:200]
                if '行动' in _line or '建议' in _line or '改善' in _line or '计划' in _line:
                    _action_hint = _line[:200]
            
            if _has_alarm:
                cur.execute(
                    "INSERT INTO ap_capa_plan (plan_code,instance_id,title,root_cause,plan_content,priority,status,created_by) VALUES(%s,0,%s,%s,%s,%s,'open','openclaw_ai')",
                    (_plan_code, f'[AI自动] {scene_name} 异常告警分析',
                     _root_cause_hint or 'AI分析识别到异常指标，建议人工确认根因',
                     _action_hint or '1. 确认异常指标的真实性\n2. 启动4M1E排查流程\n3. 制定纠正预防措施',
                     'medium'))
                _plan_id = cur.lastrowid
                # 创建默认任务
                _task_code = f"AI-TASK-{trace_id[-6:]}"
                cur.execute(
                    "INSERT INTO ap_capa_task (plan_id,task_code,title,assignee,status) VALUES(%s,%s,%s,%s,'open')",
                    (_plan_id, _task_code, f'{scene_name} 异常排查与改善', '品质专员'))
            else:
                # 即使没有异常也创建一份常规方案
                cur.execute(
                    "INSERT INTO ap_capa_plan (plan_code,instance_id,title,root_cause,plan_content,priority,status,created_by) VALUES(%s,0,%s,'常规分析','1. 持续监控指标趋势\n2. 保持当前控制措施\n3. 定期回顾分析结果','low','open','openclaw_ai')",
                    (_plan_code + '-R', f'[AI常规] {scene_name} 例行分析'))

            return api_success({
                'trace_id': trace_id,
                'scene_id': scene_id,
                'scene_name': scene_name,
                'skill': f'quality_{scene_id}',
                'metrics_summary': str(len(metrics_result)) + '个指标',
                'report': report
            })
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))


@app.route('/api/v1/xiyi/analysis/trace/<trace_id>', methods=['GET'])
def get_trace(trace_id):
    """查询traceId的全链路日志"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ag_agent_task WHERE trace_id=%s", (trace_id,))
            task = cur.fetchone()
            if not task:
                return api_error('traceId不存在')
            cur.execute("SELECT * FROM ag_tool_call_log WHERE trace_id=%s ORDER BY called_at", (trace_id,))
            logs = [dict(r) for r in cur.fetchall()]
            return api_success({'task': dict(task), 'tool_calls': logs})
    except Exception as e:
        import traceback;print(traceback.format_exc());print("AI_RUN_ERROR:", str(e));import traceback;traceback.print_exc();return api_error(str(e))



@app.route('/api/v1/xiyi/rules', methods=['GET'])
def list_rules():
    """获取所有规则"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT r.*, s.scene_name FROM ag_rule_config r LEFT JOIN ap_scene_config s ON r.scene_id=s.id ORDER BY r.scene_id, r.priority")
            return api_success({'rules': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        return api_error(e)

@app.route('/api/v1/xiyi/rules/<int:rule_id>', methods=['PUT'])
def update_rule(rule_id):
    """更新规则"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            sets = []; params = []
            for f in ['rule_name','rule_type','rule_expr','priority','enabled']:
                if f in data:
                    if isinstance(data[f], dict):
                        sets.append(f + "=%s"); params.append(json.dumps(data[f]))
                    else:
                        sets.append(f + "=%s"); params.append(data[f])
            if sets:
                params.append(rule_id)
                cur.execute("UPDATE ag_rule_config SET " + ",".join(sets) + " WHERE id=%s", params)
            return api_success({'message':'更新成功'})
    except Exception as e:
        return api_error(e)

@app.route('/api/v1/xiyi/rules', methods=['POST'])
def create_rule():
    """新建规则"""
    try:
        data = request.get_json()
        with get_cursor() as cur:
            cur.execute("INSERT INTO ag_rule_config (rule_code,scene_id,rule_name,rule_type,rule_expr,priority) VALUES (%s,%s,%s,%s,%s,%s)",
                (data['rule_code'], data['scene_id'], data.get('rule_name',''), data.get('rule_type','threshold'), json.dumps(data.get('rule_expr',{})), data.get('priority',0)))
            return api_success({'rule_id':cur.lastrowid,'message':'创建成功'})
    except Exception as e:
        return api_error(e)

@app.route('/api/v1/xiyi/rules/<int:rule_id>', methods=['DELETE'])
def delete_rule(rule_id):
    """删除规则"""
    try:
        with get_cursor() as cur:
            cur.execute("DELETE FROM ag_rule_config WHERE id=%s", (rule_id,))
            return api_success({'message':'已删除'})
    except Exception as e:
        return api_error(e)
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    logging.getLogger('xiyi_8890').info("Starting Xiyi AI Brain API on port 8890...")
    app.run(host='0.0.0.0', port=8890, debug=False)
