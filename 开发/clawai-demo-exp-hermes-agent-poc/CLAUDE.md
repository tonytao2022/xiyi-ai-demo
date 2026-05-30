# 制造咨询智能体 — 项目上下文

## 项目定位

制造咨询场景 AI 应用，首个 Demo 聚焦「在线一次校验合格率管控」。核心思路不是「让大模型直接分析数据库」，而是：

1. 先把业务口径、数据来源、规则判断固化到服务层
2. 再让编排层（OpenClaw）负责工具编排
3. 最终输出可审计的 `StructuredReport`

## 关键原则

- 可信数字来自语义层，可信结论来自规则引擎，模型只负责解释与成文
- 前端只消费 `StructuredReport`，不在前端编写业务判断和指标计算逻辑
- OpenClaw 只负责工具编排、模型路由和 Prompt 装配，不直接访问数据库
- 全链路携带 `traceId`，保留审计记录

## 目录结构

```
apps/
  bff/         — 任务入口、编排路由、鉴权、降级
  web/         — 向导页、任务页、报告页
services/
  semantic-api/       — 受控指标查询（不暴露原始 SQL）
  playbook-engine/    — 规则阈值与判断树
  report-service/     — 结构化报告装配
  openclaw-runtime/   — 技能执行 HTTP 入口
packages/
  analysis-contract/  — 分析任务请求协议
  metric-contract/    — 受控指标查询协议
  report-schema/      — 结构化报告协议
plugins/
  openclaw-domain-tools/ — 白名单工具与技能适配
skills/
  quality_first_pass_yield/   — 全量诊断技能
  quality_fpyr_trend_brief/   — 趋势简报技能
scripts/sql/mysql/            — 建库建表与种子数据
```

## 两个 Skill

| skillKey | analysisType | 用途 |
|---|---|---|
| `quality_first_pass_yield` | `first_pass_yield_monitoring` | 全量监控与异常诊断：趋势+缺陷+设备+规则 |
| `quality_fpyr_trend_brief` | `first_pass_yield_trend_brief` | 管理简报：仅趋势+阈值状态+行动提示 |

## 开发命令

```bash
pnpm dev:web                # 前端 (Vite)
pnpm dev:bff                # BFF (Express)
pnpm dev:semantic-api       # 语义层
pnpm dev:playbook-engine    # 规则引擎
pnpm dev:report-service     # 报告服务
pnpm dev:openclaw-runtime   # OpenClaw 运行时
pnpm dev:services           # 同时启动 semantic + playbook + report
pnpm dev                    # 同时启动 bff + web
```

## 环境变量

复制 `.env.example` 为 `.env`，关键变量：

- `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD` — MySQL 连接
- `USE_OPENCLAW_RUNTIME=true` — 启用 OpenClaw 编排
- `OPENCLAW_EXECUTE_URL` — 外部编排地址
- `OPENCLAW_FALLBACK_TO_DIRECT=true` — 编排失败时降级直连

## 约定

- 新增关键文件后同步更新 `docs/architecture/00-导航/01-目录与文件作用说明.md`
- 协议变更优先改 `packages/` 下的类型定义
- 文档优先中文文件名，放入 `docs/architecture/` 对应分类
