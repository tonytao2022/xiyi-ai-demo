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
        return api_error(e)
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
        return api_error(e)
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
        return api_error(e)
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
        return api_error(e)
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
        return api_error(e)
# ─── 指标API ───
@app.route('/api/v1/xiyi/indicators', methods=['GET'])
def list_indicators():
    try:
        with get_cursor() as cur:
            cur.execute("""SELECT a.*, c.category_name FROM dg_indicator_atom a
                LEFT JOIN dg_indicator_category c ON a.category_id=c.id ORDER BY a.id""")
            return api_success({'indicators': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        return api_error(e)
@app.route('/api/v1/xiyi/standards', methods=['GET'])
def list_standards():
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM dg_standard_column ORDER BY id")
            return api_success({'standards': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        return api_error(e)
# ─── 健康检查 ───
@app.route('/health', methods=['GET'])
def health():
    return api_success({'status': 'ok', 'service': 'xiyi-quality', 'port': 8890})
# ─── 实时KPI（从ds_mock_data计算） ───

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
        return api_error(e)

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
        return api_error(e)


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
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

@app.route('/api/v1/xiyi/capa/tasks/<int:task_id>/tracks', methods=['GET'])
def list_task_tracks(task_id):
    """获取任务跟踪记录"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_capa_task_track WHERE task_id=%s ORDER BY track_time DESC", (task_id,))
            return api_success({'tracks': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        return api_error(e)

@app.route('/api/v1/xiyi/scenes/<int:scene_id>/steps', methods=['GET'])
def list_steps(scene_id):
    """获取场景的七步流程"""
    try:
        with get_cursor() as cur:
            cur.execute("SELECT * FROM ap_scene_step WHERE scene_id=%s ORDER BY sort_order", (scene_id,))
            return api_success({'steps': [dict(r) for r in cur.fetchall()]})
    except Exception as e:
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

@app.route('/api/v1/xiyi/steps/<int:step_id>', methods=['DELETE'])
def delete_step(step_id):
    """删除步骤"""
    try:
        with get_cursor() as cur:
            cur.execute("DELETE FROM ap_scene_step WHERE id=%s", (step_id,))
            return api_success({'message':'已删除'})
    except Exception as e:
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)

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
        return api_error(e)
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    logging.getLogger('xiyi_8890').info("Starting Xiyi AI Brain API on port 8890...")
 
    app.run(host='0.0.0.0', port=8890, debug=False)
