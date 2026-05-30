# OpenClaw Runtime

模型路由、工具编排、Hook 注入与提示模板装配的 HTTP 入口。

该层只允许调用白名单工具，不拥有业务口径定义权，也不得直接访问数据库。

## 已实现接口

- `GET /health` — 健康检查，返回支持的 skillKey 列表
- `GET /skills` — 列出所有技能定义
- `POST /skills/:skillKey/execute` — 执行指定技能

## 当前支持的技能

| skillKey | analysisType | 白名单工具 | 用途 |
|---|---|---|---|
| `quality_first_pass_yield` | `first_pass_yield_monitoring` | `query_fpyr_daily`, `query_defect_item_breakdown`, `query_equipment_event_timeline`, `run_quality_playbook`, `build_quality_report` | 全量诊断：趋势、缺陷结构、设备线索、规则结论 |
| `quality_fpyr_trend_brief` | `first_pass_yield_trend_brief` | `query_fpyr_daily`, `run_quality_playbook`, `build_quality_report` | 趋势简报：仅 FPY 趋势、阈值状态、管理动作 |

`POST /skills/:skillKey/execute` 响应额外包含：

- `routingDecision` — 分支策略、主导异常类别、路径理由
- `toolExecutions` — 本次实际执行（或跳过）的工具轨迹

工具定义与服务适配已下沉到 `plugins/openclaw-domain-tools`。

## 启动

```bash
pnpm --filter openclaw-runtime dev
```

默认端口：`3040`

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `3040` | 运行时端口 |
| `SEMANTIC_API_BASE_URL` | `http://localhost:3010` | 语义层地址 |
| `PLAYBOOK_ENGINE_BASE_URL` | `http://localhost:3020` | 规则引擎地址 |
| `REPORT_SERVICE_BASE_URL` | `http://localhost:3030` | 报告服务地址 |

## 技能定义

两个 Skill 的 Prompt、工具白名单和执行流程分别在 `skills/*/SKILL.md` 中定义：

- `skills/quality_first_pass_yield/SKILL.md` — 全量诊断
- `skills/quality_fpyr_trend_brief/SKILL.md` — 趋势简报
