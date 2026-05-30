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



@app.route('/api/v1/xiyi/scenes/<int:scene_id>', methods=['PUT'])
def update_scene(scene_id):
    try:
        data = request.get_json()
        with get_cursor() as cur:
            sets = []
            params = []
            for f in ['scene_name','category','description','status','icon','role_type']:
                if f in data:
                    sets.append(f + "=%s")
                    params.append(data[f])
            if not sets:
                return api_error('没有需要更新的字段')
            params.append(scene_id)
            cur.execute("UPDATE ap_scene_config SET " + ",".join(sets) + " WHERE id=%s", params)
            return api_success({'message':'更新成功'})
    except Exception as e:
        return api_error(e)

@app.route('/api/v1/xiyi/scenes', methods=['POST'])
def create_scene():
    try:
        data = request.get_json()
        code = data.get('scene_code','')
        name = data.get('scene_name','')
        if not code or not name:
            return api_error('scene_code和scene_name必填')
        with get_cursor() as cur:
            cur.execute("INSERT INTO ap_scene_config (scene_code,scene_name,category,description,role_type,icon) VALUES (%s,%s,%s,%s,%s,%s)",
                (code, name, data.get('category',''), data.get('description',''), data.get('role_type','quality'), 'chart-line'))
            scene_id = cur.lastrowid
            step_types = [('definition','问题定义与数据'),('analysis','现象分析与定位'),('correlation','4M1E关联分析'),('verification','核心根因验证'),('attribution','能力短板归因'),('solution','解决方案CAPA'),('tracking','任务落地跟踪')]
            for i,(st, sn) in enumerate(step_types, 1):
                cur.execute("INSERT INTO ap_scene_step (scene_id,step_code,step_name,step_type,sort_order) VALUES(%s,%s,%s,%s,%s)",
                    (scene_id, code + "_STEP_%02d" % i, sn, st, i))
            return api_success({'scene_id':scene_id,'message':'创建成功，已添加默认7步流程'})
    except Exception as e:
        return api_error(e)
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    logging.getLogger('xiyi_8890').info("Starting Xiyi AI Brain API on port 8890...")
 
    app.run(host='0.0.0.0', port=8890, debug=False)
