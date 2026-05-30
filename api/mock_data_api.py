#!/usr/bin/env python3
"""模拟质检数据API — 从ds_mock_data读取并返回给前端"""
import pymysql, json
from flask import Flask, request, jsonify
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

def get_cursor():
    conn = pymysql.connect(host='127.0.0.1',port=3306,user='debian-sys-maint',
        password=*** database='xiyi_quality', charset='utf8mb4')
    class Ctx:
        def __enter__(s):
            s.conn=conn; s.cur=conn.cursor(pymysql.cursors.DictCursor); return s.cur
        def __exit__(s,*a):
            if not a[0]: s.conn.commit()
            s.cur.close(); s.conn.close()
    return Ctx()

def api_success(d): return jsonify({'code':0,'data':d})
def api_error(e): return jsonify({'code':-1,'error':str(e)})

@app.route('/api/v1/xiyi/mock/<int:scene_id>', methods=['GET'])
def get_mock_data(scene_id):
    """获取某场景的模拟数据"""
    try:
        category = request.args.get('category', '')
        limit = request.args.get('limit', 500, type=int)
        with get_cursor() as cur:
            sql = "SELECT * FROM ds_mock_data WHERE scene_id=%s"
            params = [scene_id]
            if category:
                sql += " AND data_category=%s"
                params.append(category)
            sql += " ORDER BY mock_date DESC LIMIT %s"
            params.append(limit)
            cur.execute(sql, params)
            rows = [dict(r) for r in cur.fetchall()]
            # 解析data_json
            for r in rows:
                if isinstance(r.get('data_json'), str):
                    try: r['data'] = json.loads(r['data_json'])
                    except: r['data'] = {}
                    del r['data_json']
            return api_success({'rows': rows, 'total': len(rows)})
    except Exception as e:
        return api_error(e)

@app.route('/api/v1/xiyi/mock/kpi', methods=['GET'])
def get_kpi_values():
    """根据模拟数据计算实时KPI值"""
    try:
        import statistics
        with get_cursor() as cur:
            # 场景1 FPY
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=1 AND data_category='fpy_daily' ORDER BY mock_date DESC LIMIT 30")
            fpy_rows = cur.fetchall()
            fpy_vals = []
            for r in fpy_rows:
                d = json.loads(r['data_json'])
                fpy_vals.append(d['fpy'])
            current_fpy = round(fpy_vals[0], 2) if fpy_vals else 97.5
            avg_fpy = round(statistics.mean(fpy_vals), 2) if len(fpy_vals) > 1 else 97.5
            min_fpy = round(min(fpy_vals), 2) if fpy_vals else 97.0
            
            # 场景2 磁物异常
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=2 AND data_category='mag_health' ORDER BY mock_date DESC LIMIT 50")
            mag_rows = cur.fetchall()
            mag_abnormal = sum(1 for r in mag_rows if json.loads(r['data_json']).get('is_abnormal'))
            mag_total = len(mag_rows)
            mag_rate = round(mag_abnormal/mag_total*100, 1) if mag_total > 0 else 0
            
            # 场景3 异常料
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=3")
            abn_rows = cur.fetchall()
            abn_pending = sum(1 for r in abn_rows if json.loads(r['data_json']).get('status') in ['pending','processing'])
            abn_total_value = sum(json.loads(r['data_json']).get('qty_kg',0) * json.loads(r['data_json']).get('unit_price',0) for r in abn_rows)
            
            # 场景4 呆滞
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=4")
            dead_rows = cur.fetchall()
            dead_total_value = sum(json.loads(r['data_json']).get('total_value',0) for r in dead_rows)
            
            # 场景5 IQC
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=5")
            iqc_rows = cur.fetchall()
            iqc_pass = sum(1 for r in iqc_rows if json.loads(r['data_json']).get('result')=='PASS')
            iqc_rate = round(iqc_pass/len(iqc_rows)*100, 1) if iqc_rows else 0
            
            # 场景6 PMP
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=6")
            pmp_rows = cur.fetchall()
            pmp_fpy_vals = [json.loads(r['data_json'])['fpy'] for r in pmp_rows]
            pmp_avg = round(statistics.mean(pmp_fpy_vals), 2) if pmp_fpy_vals else 0
            
            # 场景7 COQ
            cur.execute("SELECT data_json FROM ds_mock_data WHERE scene_id=7 ORDER BY mock_date DESC LIMIT 1")
            coq_row = cur.fetchone()
            coq_rate = json.loads(coq_row['data_json'])['coq_rate'] if coq_row else 0
            
            kpis = [
                {'code':'FPY','name':'在线一次交验合格率','value':f'{current_fpy}','target':'99.0%','unit':'%','alert':'warning' if current_fpy < 97.5 else 'success'},
                {'code':'MAG','name':'磁物检验异常率','value':f'{mag_rate}%','target':'0%','unit':'%','alert':'danger' if mag_rate > 10 else 'warning'},
                {'code':'ABN','name':'异常料待处理批次数','value':str(abn_pending),'target':'0','unit':'批','alert':'danger' if abn_pending > 5 else 'success'},
                {'code':'IQC','name':'来料检验合格率','value':f'{iqc_rate}%','target':'≥95%','unit':'%','alert':'warning' if iqc_rate < 95 else 'success'},
                {'code':'PMP','name':'过程FPY均值','value':f'{pmp_avg}','target':'≥97%','unit':'%','alert':'warning' if pmp_avg < 97 else 'success'},
                {'code':'COQ','name':'质量成本率','value':f'{coq_rate}','target':'≤1.8%','unit':'%','alert':'warning' if coq_rate > 1.8 else 'success'},
            ]
            return api_success({'kpis': kpis, 'snapshot_time': str(datetime.now())})
    except Exception as e:
        return api_error(e)

from datetime import datetime
if __name__ == '__main__':
    import logging
    logging.basicConfig(level=logging.INFO)
    app.run(host='0.0.0.0', port=8891, debug=False)
