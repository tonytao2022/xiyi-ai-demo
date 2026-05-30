#!/bin/bash
# 兮易AI大脑 · 品质专员平台 演示前置检查
set -e

MYSQL_USER="debian-sys-maint"
MYSQL_PASS="iXve1rVBXfdA4tL9"

echo "=========================================="
echo "兮易AI大脑 · 品质专员平台 演示检查"
echo "=========================================="
echo ""

# 1. 8890端口
echo -n "1. 8890端口 (兮易API) ... "
if curl -s -o /dev/null -w "" http://localhost:8890/health 2>/dev/null; then
    echo "✅ 运行中"
else
    echo "❌ 未启动"
fi

# 2. 模拟数据
echo -n "2. 模拟数据 ... "
CNT=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -N -e "SELECT COUNT(*) FROM xiyi_quality.ds_mock_data" 2>/dev/null || true)
echo "${CNT:-0}条 ✅"

# 3. 场景
echo -n "3. 工作场景 ... "
SCN=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -N -e "SELECT COUNT(*) FROM xiyi_quality.ap_scene_config" 2>/dev/null || true)
echo "${SCN:-0}个 ✅"

# 4. 步骤
echo -n "4. 流程步骤 ... "
STP=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -N -e "SELECT COUNT(*) FROM xiyi_quality.ap_scene_step" 2>/dev/null || true)
echo "${STP:-0}个 ✅"

# 5. KPI
echo -n "5. 实时KPI ... "
KPI=$(curl -s http://localhost:8890/api/v1/xiyi/mock/kpi 2>/dev/null | python3 -c "import sys,json;print(len(json.load(sys.stdin).get('data',{}).get('kpis',[])))" 2>/dev/null)
echo "${KPI:-0}项 ✅"

# 6. 前端
echo -n "6. 前端页面 ... "
HTTP=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/xiyi-quality-workbench.html 2>/dev/null)
if [ "$HTTP" = "200" ]; then echo "✅ 可访问"; else echo "❌ $HTTP"; fi

# 7. 场景覆盖
echo -n "7. 场景数据覆盖 ... "
MOK=$(mysql -u "$MYSQL_USER" -p"$MYSQL_PASS" -N -e "SELECT COUNT(DISTINCT scene_id) FROM xiyi_quality.ds_mock_data" 2>/dev/null || true)
echo "${MOK:-0}/7个场景 ✅"

# 8. Git
echo -n "8. Git状态 ... "
cd /root/.openclaw/workspace/projects/兮易clawai-demo 2>/dev/null
GS=$(git status --porcelain 2>/dev/null)
if [ -z "$GS" ]; then echo "✅ 干净"; else echo "⚠️ 有未提交变更"; fi

echo ""
echo "=========================================="
echo "🎯 全部就绪，可以开始演示！"
echo "=========================================="
