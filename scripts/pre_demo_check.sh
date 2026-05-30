#!/bin/bash
# 兮易AI大脑 · 品质专员平台 演示前置检查
# 运行方式：bash scripts/pre_demo_check.sh
# 输出：✅ 或 ❌ 状态标记

echo "=========================================="
echo "兮易AI大脑 · 品质专员平台 演示检查"
echo "=========================================="
echo ""

errors=0

# 1. 8890端口
echo -n "1. 8890端口 (兮易API) ... "
if curl -s -o /dev/null -w "" http://localhost:8890/health 2>/dev/null; then
    echo "✅ 运行中"
else
    echo "❌ 未启动"
    errors=$((errors+1))
fi

# 2. 451条模拟数据
echo -n "2. 模拟数据 (451条) ... "
COUNT=*** -u debian-sys-maint -p'iXve1rVBXfdA4tL9' -N -e "SELECT COUNT(*) FROM xiyi_quality.ds_mock_data" 2>/dev/null)
if [ "$COUNT" = "451" ] || [ "$COUNT" -gt "400" ] 2>/dev/null; then
    echo "✅ ${COUNT}条"
else
    echo "⚠️ ${COUNT:-0}条 (期望451)"
fi

# 3. 7个场景
echo -n "3. 7个工作场景 ... "
SCENE=*** -u debian-sys-maint -p'iXve1rVBXfdA4tL9' -N -e "SELECT COUNT(*) FROM xiyi_quality.ap_scene_config" 2>/dev/null)
if [ "$SCENE" = "7" ]; then
    echo "✅ ${SCENE}个"
else
    echo "⚠️ ${SCENE:-0}个"
fi

# 4. 49个流程步骤
echo -n "4. 49个流程步骤 ... "
STEP=*** -u debian-sys-maint -p'iXve1rVBXfdA4tL9' -N -e "SELECT COUNT(*) FROM xiyi_quality.ap_scene_step" 2>/dev/null)
if [ "$STEP" = "49" ]; then
    echo "✅ ${STEP}个"
else
    echo "⚠️ ${STEP:-0}个"
fi

# 5. 实时KPI接口
echo -n "5. 实时KPI接口 ... "
KPI=$(curl -s http://localhost:8890/api/v1/xiyi/mock/kpi 2>/dev/null | python3 -c "import sys,json;d=json.load(sys.stdin);print(len(d.get('data',{}).get('kpis',[])))" 2>/dev/null)
if [ "$KPI" = "6" ]; then
    echo "✅ 6项KPI"
elif [ -n "$KPI" ]; then
    echo "⚠️ ${KPI}项"
else
    echo "❌ 不可用"
    errors=$((errors+1))
fi

# 6. 前端页面
echo -n "6. 前端工作台 ... "
if curl -s -o /dev/null -w "" http://localhost/xiyi-quality-workbench.html 2>/dev/null; then
    echo "✅ 可访问"
else
    echo "❌ 不可访问"
    errors=$((errors+1))
fi

# 7. 场景详情弹窗数据
echo -n "7. 场景模拟数据 ... "
MOCK=*** -u debian-sys-maint -p'iXve1rVBXfdA4tL9' -N -e "SELECT COUNT(DISTINCT scene_id) FROM xiyi_quality.ds_mock_data" 2>/dev/null)
if [ "$MOCK" = "7" ]; then
    echo "✅ 覆盖${MOCK}个场景"
else
    echo "⚠️ 覆盖${MOCK:-0}个场景"
fi

# 8. Git
echo -n "8. Git仓库状态 ... "
cd /root/.openclaw/workspace/projects/兮易clawai-demo 2>/dev/null
if git status --porcelain 2>/dev/null | grep -q .; then
    echo "⚠️ 有未提交变更"
else
    echo "✅ 干净"
fi

echo ""
echo "=========================================="
if [ $errors -eq 0 ]; then
    echo "🎯 全部就绪，可以开始演示！"
else
    echo "⚠️ 有 ${errors} 项异常，请修复后重新检查"
fi
echo "=========================================="
