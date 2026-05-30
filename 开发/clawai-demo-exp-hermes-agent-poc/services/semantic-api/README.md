# Semantic API

负责指标定义、模板查询、数据血缘与查询审计输出。

该服务只接受受控查询对象，不接受原始 SQL 字符串。

## 当前已实现接口

- `GET /health`：检查服务与数据库连通性
- `POST /metrics/query`：执行受控指标查询

当前最小支持的 `metricKey`：

- `fpyr_daily`
- `defect_item_breakdown`
- `equipment_event_timeline`

## 启动方式

先设置数据库环境变量：

```bash
export DB_HOST=361361.cn
export DB_PORT=22506
export DB_USER=root
export DB_PASSWORD='你的密码'
export MES_DB_NAME=mes_demo
export APP_DB_NAME=ce_agent_demo
```

然后启动：

```bash
pnpm --filter semantic-api dev
```

默认端口：

- `3010`

## 测试方式

### 1. 健康检查

```bash
curl http://localhost:3010/health
```

期望返回：

- `status = ok`
- `databases.mes = mes_demo`
- `databases.app = ce_agent_demo`

### 2. 测试 `fpyr_daily`

```bash
curl -X POST http://localhost:3010/metrics/query \
  -H 'Content-Type: application/json' \
  -d '{
    "metricKey": "fpyr_daily",
    "dimensions": ["date"],
    "filters": [
      { "field": "siteId", "operator": "eq", "value": "site-A01" },
      { "field": "stock_oper_order", "operator": "eq", "value": "ZKI" }
    ],
    "grain": "day",
    "timeRange": {
      "startAt": "2026-03-27T00:00:00+08:00",
      "endAt": "2026-03-30T23:59:59+08:00",
      "timezone": "Asia/Shanghai"
    },
    "queryReason": "测试日一次校验合格率趋势",
    "auditContext": {
      "traceId": "trace-local-test-001",
      "tenantId": "tenant-demo",
      "actorId": "user-001",
      "skillKey": "quality_first_pass_yield"
    }
  }'
```

期望看到：

- `2026-03-27`：`fpyr = 66.7`
- `2026-03-28`：`fpyr = 33.3`
- `2026-03-29`：`fpyr = 66.7`
- `2026-03-30`：`fpyr = 100`

### 3. 测试 `defect_item_breakdown`

```bash
curl -X POST http://localhost:3010/metrics/query \
  -H 'Content-Type: application/json' \
  -d '{
    "metricKey": "defect_item_breakdown",
    "dimensions": ["itemCategory", "itemName"],
    "filters": [
      { "field": "siteId", "operator": "eq", "value": "site-A01" },
      { "field": "judgeCode", "operator": "in", "value": ["A", "B", "F"] }
    ],
    "grain": "day",
    "timeRange": {
      "startAt": "2026-03-27T00:00:00+08:00",
      "endAt": "2026-03-30T23:59:59+08:00",
      "timezone": "Asia/Shanghai"
    },
    "queryReason": "测试不合格项目结构分布",
    "auditContext": {
      "traceId": "trace-local-test-002",
      "tenantId": "tenant-demo",
      "actorId": "user-001",
      "skillKey": "quality_first_pass_yield"
    }
  }'
```

期望看到：

- `磁物类 / 磁物超标`
- `ICP类 / 铁含量异常`
- `粒度类 / 粒度偏粗`

### 4. 测试 `equipment_event_timeline`

```bash
curl -X POST http://localhost:3010/metrics/query \
  -H 'Content-Type: application/json' \
  -d '{
    "metricKey": "equipment_event_timeline",
    "dimensions": ["unit", "eventTime"],
    "filters": [
      { "field": "unit", "operator": "eq", "value": "line-A" }
    ],
    "grain": "day",
    "timeRange": {
      "startAt": "2026-03-27T00:00:00+08:00",
      "endAt": "2026-03-30T23:59:59+08:00",
      "timezone": "Asia/Shanghai"
    },
    "queryReason": "测试设备事件时间线",
    "auditContext": {
      "traceId": "trace-local-test-003",
      "tenantId": "tenant-demo",
      "actorId": "user-001",
      "skillKey": "quality_first_pass_yield"
    }
  }'
```

期望看到：

- `fault / 温控异常`
- `repair / 更换温度传感器`
- `maintenance / 例行保养`

## 测试后额外核对

每次调用 `POST /metrics/query` 后，还可以到 `ce_agent_demo.metric_query_audit` 看是否新增审计记录。
