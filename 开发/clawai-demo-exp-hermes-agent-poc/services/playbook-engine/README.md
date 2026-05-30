# Playbook Engine

负责制造咨询方法论、阈值规则、判断树与可解释结论模板。

该服务输出可信判断结果，供报告服务汇总，不承担前端渲染职责。

## 当前已实现接口

- `GET /health`
- `POST /playbooks/execute`
- `GET /rules/branch-routing?analysisType=first_pass_yield_monitoring`：只读返回 `rule_config.openclaw_branch_routing`（供 OpenClaw 域插件拉取分支编排）

当前默认场景：

- `first_pass_yield_monitoring`

## 启动方式

```bash
pnpm dev:playbook-engine
```

默认端口：

- `3020`

## 请求体示例

```json
{
  "traceId": "trace-demo-001",
  "analysisType": "first_pass_yield_monitoring",
  "input": {
    "siteId": "site-A01"
  },
  "facts": {
    "fpyrDaily": {
      "rows": [
        { "date": "2026-03-27", "totalBatchCount": 3, "qualifiedBatchCount": 2, "defectBatchCount": 1, "fpyr": 66.7 },
        { "date": "2026-03-28", "totalBatchCount": 3, "qualifiedBatchCount": 1, "defectBatchCount": 2, "fpyr": 33.3 }
      ]
    },
    "defectBreakdown": {
      "rows": [
        { "itemCategory": "磁物类", "itemName": "磁物超标", "count": 2, "ratio": 40 }
      ]
    },
    "equipmentTimeline": {
      "rows": [
        { "eventTime": "2026-03-28T08:20:00", "unit": "line-A", "eventType": "fault", "faultDesc": "温控异常", "faultGrade": "high", "repairStatus": "opened" }
      ]
    }
  }
}
```
