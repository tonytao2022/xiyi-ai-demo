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
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] %(message)s')
    logging.getLogger('xiyi_8890').info("Starting Xiyi AI Brain API on port 8890...")
 
    app.run(host='0.0.0.0', port=8890, debug=False)
