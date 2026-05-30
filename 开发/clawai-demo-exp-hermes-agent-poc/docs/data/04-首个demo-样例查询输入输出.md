# 1. 首个 Demo 样例查询输入输出

## 1.1 目标

给首个 demo 的核心 `metricKey` 提供样例查询输入与返回输出，帮助语义层、规则引擎、BFF 和前端快速对齐接口格式。

## 1.2 说明

- 本文档基于当前 `packages/metric-contract` 协议整理。
- 样例以“在线一次校验合格率管控”场景为基准。
- 所有 JSON 都是示例，不代表最终真实数据。

## 1.3 查询协议回顾

语义层查询的核心结构为：

- `metricKey`
- `dimensions`
- `filters`
- `grain`
- `timeRange`
- `queryReason`
- `auditContext`

## 1.4 样例一：`fpyr_daily`

### 1.4.1 样例输入

```json
{
  "metricKey": "fpyr_daily",
  "dimensions": ["date"],
  "filters": [
    { "field": "siteId", "operator": "eq", "value": "site-A01" },
    { "field": "stock_oper_order", "operator": "eq", "value": "ZKI" }
  ],
  "grain": "day",
  "timeRange": {
    "startAt": "2026-03-27T00:00:00+08:00",
    "endAt": "2026-04-02T23:59:59+08:00",
    "timezone": "Asia/Shanghai"
  },
  "queryReason": "统计日一次校验合格率趋势",
  "auditContext": {
    "traceId": "trace-demo-001",
    "tenantId": "tenant-demo",
    "actorId": "user-001",
    "skillKey": "quality_first_pass_yield"
  }
}
```

### 1.4.2 样例输出

```json
{
  "queryAuditId": "audit-fpyr-001",
  "requestedAt": "2026-04-02T10:00:00+08:00",
  "sourceSystem": "MES",
  "dataTimestamp": "2026-04-02T09:58:00+08:00",
  "metricDefinitions": [
    {
      "metricKey": "fpyr_daily",
      "metricName": "日一次校验合格率",
      "definitionVersion": "v1",
      "unit": "%"
    }
  ],
  "rows": [
    {
      "date": "2026-03-27",
      "totalBatchCount": 120,
      "qualifiedBatchCount": 111,
      "defectBatchCount": 9,
      "fpyr": 92.5
    },
    {
      "date": "2026-03-28",
      "totalBatchCount": 118,
      "qualifiedBatchCount": 104,
      "defectBatchCount": 14,
      "fpyr": 88.1
    }
  ]
}
```

## 1.5 样例二：`defect_item_breakdown`

### 1.5.1 样例输入

```json
{
  "metricKey": "defect_item_breakdown",
  "dimensions": ["itemCategory", "itemName"],
  "filters": [
    { "field": "siteId", "operator": "eq", "value": "site-A01" },
    { "field": "judgeCode", "operator": "in", "value": ["A", "B", "F"] }
  ],
  "grain": "day",
  "timeRange": {
    "startAt": "2026-03-27T00:00:00+08:00",
    "endAt": "2026-04-02T23:59:59+08:00",
    "timezone": "Asia/Shanghai"
  },
  "queryReason": "统计不合格项目结构分布",
  "auditContext": {
    "traceId": "trace-demo-001",
    "tenantId": "tenant-demo",
    "actorId": "user-001",
    "skillKey": "quality_first_pass_yield"
  }
}
```

### 1.5.2 样例输出

```json
{
  "queryAuditId": "audit-defect-001",
  "requestedAt": "2026-04-02T10:02:00+08:00",
  "sourceSystem": "MES",
  "dataTimestamp": "2026-04-02T09:58:00+08:00",
  "metricDefinitions": [
    {
      "metricKey": "defect_item_breakdown",
      "metricName": "不合格项目结构分布",
      "definitionVersion": "v1"
    }
  ],
  "rows": [
    {
      "itemCategory": "磁物类",
      "itemName": "磁物超标",
      "count": 32,
      "ratio": 41.0
    },
    {
      "itemCategory": "ICP类",
      "itemName": "铁含量异常",
      "count": 24,
      "ratio": 30.8
    },
    {
      "itemCategory": "粒度类",
      "itemName": "粒度偏粗",
      "count": 22,
      "ratio": 28.2
    }
  ]
}
```

## 1.6 样例三：`equipment_event_timeline`

### 1.6.1 样例输入

```json
{
  "metricKey": "equipment_event_timeline",
  "dimensions": ["unit", "eventTime"],
  "filters": [
    { "field": "siteId", "operator": "eq", "value": "site-A01" }
  ],
  "grain": "day",
  "timeRange": {
    "startAt": "2026-03-27T00:00:00+08:00",
    "endAt": "2026-04-02T23:59:59+08:00",
    "timezone": "Asia/Shanghai"
  },
  "queryReason": "查询合格率异常期间设备事件时间线",
  "auditContext": {
    "traceId": "trace-demo-001",
    "tenantId": "tenant-demo",
    "actorId": "user-001",
    "skillKey": "quality_first_pass_yield"
  }
}
```

### 1.6.2 样例输出

```json
{
  "queryAuditId": "audit-equip-001",
  "requestedAt": "2026-04-02T10:05:00+08:00",
  "sourceSystem": "MES",
  "dataTimestamp": "2026-04-02T09:57:00+08:00",
  "metricDefinitions": [
    {
      "metricKey": "equipment_event_timeline",
      "metricName": "设备事件时间线",
      "definitionVersion": "v1"
    }
  ],
  "rows": [
    {
      "eventTime": "2026-03-28T08:20:00+08:00",
      "unit": "烧结机A",
      "eventType": "fault",
      "faultDesc": "温控异常",
      "faultGrade": "high",
      "repairStatus": "opened"
    },
    {
      "eventTime": "2026-03-28T13:40:00+08:00",
      "unit": "烧结机A",
      "eventType": "repair",
      "faultDesc": "更换温度传感器",
      "faultGrade": "high",
      "repairStatus": "completed"
    }
  ]
}
```

## 1.7 如何使用这些样例

- `SemanticAPI`：以这些样例作为接口返回的目标格式
- `PlaybookEngine`：以这些样例中的 `rows` 结构作为事实输入参考
- `BFF`：根据这些样例确认调用参数是否齐全
- `Web`：根据输出字段决定图表、表格和卡片展示方式

## 1.8 后续补充建议

- 补充 `defect_batch_count` 和 `mix_weight_by_batch` 的样例
- 补充多维过滤条件样例，例如按 `batchId`、`materialCode` 查询
- 补充规则引擎消费这些结果后的结构化结论样例
