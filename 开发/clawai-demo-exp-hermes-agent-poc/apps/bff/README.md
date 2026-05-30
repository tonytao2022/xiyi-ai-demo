# BFF

负责用户鉴权、租户隔离、任务触发、参数校验、审计透传与报告查询。

后续工程化时，`BFF` 应作为前端唯一后端入口，不直接承载规则判断或指标计算。

## 当前已实现

- `POST /api/tasks`：创建分析任务
- `GET /api/tasks/:taskId`：查询任务状态
- `GET /api/reports/:taskId`：读取结构化报告

当前实现方式：

- `BFF` 把任务状态与报告持久化到 `MySQL`
- 默认可直接调用 `semantic-api`、`playbook-engine`、`report-service`
- 开启 `USE_OPENCLAW_RUNTIME=true` 后改由 `openclaw-runtime` 统一编排
- 规则判断由 `playbook-engine` 输出
- 结构化报告由 `report-service` 输出

## 启动方式

推荐先复制环境变量模板：

```bash
cp .env.example .env
```

再启动 `semantic-api`：

```bash
pnpm dev:semantic-api
```

再启动 `playbook-engine`：

```bash
pnpm dev:playbook-engine
```

再启动 `report-service`：

```bash
pnpm dev:report-service
```

如需启用 OpenClaw 编排模式，再启动 `openclaw-runtime`：

```bash
pnpm dev:openclaw-runtime
```

最后启动 `BFF`：

```bash
pnpm dev:bff
```

默认端口：

- `BFF`: `3001`
- `semantic-api`: `3010`
- `playbook-engine`: `3020`
- `report-service`: `3030`
- `openclaw-runtime`: `3040`

启用 OpenClaw 模式时，在 `.env` 中设置：

```bash
USE_OPENCLAW_RUNTIME=true
OPENCLAW_RUNTIME_BASE_URL=http://localhost:3040
```

若切到“外部 OpenClaw 服务”，可直接配置执行地址（BFF 会优先使用）：

```bash
USE_OPENCLAW_RUNTIME=true
OPENCLAW_EXECUTE_URL=https://openclaw.example.com/api/v1/skills/quality_first_pass_yield/execute
OPENCLAW_AUTH_TOKEN=your-token-if-needed
OPENCLAW_REQUEST_TIMEOUT_MS=30000
OPENCLAW_COMPAT_MODE=responses
OPENCLAW_FALLBACK_TO_DIRECT=true
```

说明：

- 未配置 `OPENCLAW_EXECUTE_URL` 时，仍走本地 `OPENCLAW_RUNTIME_BASE_URL`
- 配置了 `OPENCLAW_EXECUTE_URL` 时，`BFF` 直接调用外部 OpenClaw 执行接口
- 如外部平台要求鉴权，使用 `OPENCLAW_AUTH_TOKEN`（Bearer Token）
- `OPENCLAW_COMPAT_MODE=responses` 时，按 OpenClaw Gateway `POST /v1/responses` 协议调用
- `OPENCLAW_COMPAT_MODE=runtime` 时，按原有 `openclaw-runtime` 的 `{ report }` 协议调用
- `OPENCLAW_COMPAT_MODE=auto`（默认）会根据 URL 自动识别 `/v1/responses` 或 `/v1/chat/completions`

### Hermes 编排模式（POC）

当任务参数中传入 `orchestratorMode=hermes`（或设置 `ORCHESTRATOR_DEFAULT_MODE=hermes`）时，BFF 会走 Hermes 外部编排链路：

```bash
ORCHESTRATOR_DEFAULT_MODE=hermes
HERMES_EXECUTE_URL=http://127.0.0.1:8642/v1/responses
HERMES_AUTH_TOKEN=your-hermes-api-key
HERMES_REQUEST_TIMEOUT_MS=30000
HERMES_MAX_ATTEMPTS=2
HERMES_RETRY_DELAY_MS=1200
```

说明：

- Hermes 对接默认使用 OpenAI Responses 兼容协议（`POST /v1/responses`）
- `HERMES_EXECUTE_URL` 未配置时，`orchestratorMode=hermes` 任务会直接失败
- 目前 `orchestratorMode=hermes` 下不走 OpenClaw fallback，便于对比实验定位问题

## 测试方式

### 1. 用浏览器直接走前端

如果同时启动了 `web`：

```bash
pnpm dev:web
```

打开页面后：

1. 进入向导页
2. 选择日期范围 `2026-03-27` 到 `2026-03-30`
3. 提交任务
4. 查看任务页进度
5. 自动跳转到报告页

这是最直观的可视化测试方式。

### 2. 用 Apifox / Postman / Bruno 测试 BFF

推荐优先：

- `Apifox`
- `Postman`
- `Bruno`
- `Insomnia`

#### 第一步：创建任务

- 方法：`POST`
- URL：`http://localhost:3001/api/tasks`
- Header：`Content-Type: application/json`
- Body 选 `JSON`

请求体示例：

```json
{
  "analysisType": "first_pass_yield_monitoring",
  "tenantId": "tenant-demo",
  "orgId": "org-A",
  "siteId": "site-A01",
  "timeRange": {
    "startAt": "2026-03-27",
    "endAt": "2026-03-30",
    "timezone": "Asia/Shanghai"
  },
  "inputParams": {
    "productLine": "line-A",
    "analysisFocus": ["yield_overview", "defect_breakdown", "equipment_correlation"]
  },
  "playbookVersion": "quality-fpyr-v1",
  "reportTemplateVersion": "fpyr-demo-v1"
}
```

期望返回：

- `taskId`
- `traceId`
- `status = accepted`

#### 第二步：轮询任务状态

- 方法：`GET`
- URL：`http://localhost:3001/api/tasks/{taskId}`

期望看到：

- `status` 从 `accepted` 变成 `running`
- `steps` 依次推进
- 最终 `status = completed`
- 返回 `reportId`

#### 第三步：获取报告

- 方法：`GET`
- URL：`http://localhost:3001/api/reports/{taskId}`

期望看到：

- `summary.headline`
- `sections`
- `sourceRefs`
- `auditTrail`

### 3. 在 Apifox / Postman 里串自动化流程

你可以这样配：

1. 第一个请求：`POST /api/tasks`
2. 从返回体里提取 `taskId`
3. 第二个请求：`GET /api/tasks/{{taskId}}`
4. 给第二个请求加轮询或手动重复发送，直到 `status = completed`
5. 第三个请求：`GET /api/reports/{{taskId}}`

这套方式比纯 `curl` 更适合日常联调。

## 建议的可视化工具使用方式

如果你希望更像“接口平台”：

- 用 `Apifox`

可直接导入的集合文件：

- `docs/testing/01-接口联调-Postman集合.json`

如果你希望更像“调试客户端”：

- 用 `Postman` 或 `Insomnia`

如果你希望更轻量、文件化、适合放仓库：

- 用 `Bruno`

## 验收要点

- 创建任务后，任务状态能逐步推进到完成
- 报告不再是固定 mock，而是会随数据库数据返回真实趋势和结构
- `sourceRefs` 中能看到来自 `semantic-api` 的 `queryAuditId`
- 开启 OpenClaw 模式后，`auditTrail` 中能看到 `OpenClawRuntime`
