# 制造咨询智能体骨架

本工作区用于承接“制造咨询智能体”的从 0 到 1 架构落地，当前已补齐系统边界、核心协议、安全约束、前端统一渲染方式与目录骨架。

## 当前产物

- `AGENTS.md`：项目级 Agent 协作约定。
- `.cursor/rules/`：面向 Cursor 的持久规则文件。
- `docs/architecture/00-导航/01-目录与文件作用说明.md`：目录与文件作用总说明。
- `docs/architecture/01-场景/01-首个-demo-场景-在线一次校验合格率管控.md`：首个 demo 场景“在线一次校验合格率管控”的业务链路与 MVP 约束。
- `docs/architecture/02-总体设计/01-系统边界与职责.md`：六类系统边界与责任矩阵。
- `docs/architecture/02-总体设计/02-审计与安全设计.md`：`traceId`、审计日志、工具白名单、数据库受控访问等安全约束。
- `docs/architecture/02-总体设计/03-目录骨架设计.md`：建议目录骨架与初始化顺序。
- `docs/architecture/03-实施计划/01-demo-完整打通计划.md`：首个 demo 的端到端打通路线。
- `docs/architecture/03-实施计划/02-demo-开发计划.md`：首个 demo 的工程实施计划。
- `docs/architecture/03-实施计划/03-openclaw-接入计划.md`：OpenClaw 运行时接入顺序、边界和替换策略。
- `docs/architecture/04-AI资产/01-AI资产总览.md`：AI 资产总览与使用方式。
- `docs/architecture/04-AI资产/02-模型路由策略.md`：按场景和步骤选模型的策略。
- `docs/architecture/04-AI资产/03-Prompt模板设计.md`：Prompt 设计和变量约定。
- `docs/architecture/04-AI资产/04-工具白名单设计.md`：OpenClaw 工具边界与审计要求。
- `docs/architecture/04-AI资产/05-Agent与规则约定.md`：`AGENTS.md` 与 `.cursor/rules/` 的职责分工。
- `docs/data/01-首个demo-语义层指标草案.md`：首个 demo 的首批语义层指标定义草案。
- `docs/data/02-首个demo-来源表与字段映射草案.md`：首个 demo 的来源表、字段和关联关系草案。
- `docs/data/03-首个demo-指标计算与查询逻辑草案.md`：首个 demo 的指标计算和查询路径草案。
- `docs/data/04-首个demo-样例查询输入输出.md`：首个 demo 的语义层查询输入输出样例。
- `docs/data/05-首个demo-业务确认清单.md`：进入开发前需要和业务确认的关键问题清单。
- `docs/data/06-首个demo-检验项目字典与分类映射.md`：检验项目字典表说明与业务分类映射（含模拟 Demo 降级规则）。
- `docs/data/07-首个demo-数据库初始化方案.md`：双数据库拆分建议、最小表清单与 MySQL 8.0 脚本执行顺序。
- `docs/testing/01-接口联调-Postman集合.json`：可导入 `Postman / Apifox` 的联调集合。
- `scripts/sql/mysql/`：首个 demo 的 MySQL 8.0 建库建表脚本。
- `packages/analysis-contract/src/index.ts`：分析任务请求协议。
- `packages/metric-contract/src/index.ts`：受控指标查询协议。
- `packages/report-schema/src/index.ts`：结构化报告协议。
- `apps/web/src/features/reporting/README.md`：前端统一报告渲染约束。
- `apps/web/src/features/reporting/renderers.ts`：基于报告协议的渲染计划生成器。

## 当前优先场景

当前优先落地的第一个 demo 场景是“在线一次校验合格率管控”。

- 目标用户：品质专员、品管部经理
- 核心目标：监控一次校验合格率异常并输出结构化分析报告
- 主要输入：`MOM/MES` 中的一次校验合格率、检验项目、不合格批次、原料、ICP、粒度、设备维修保养等数据
- 后续工程化优先实现：该场景的分析任务流、白名单工具链、规则 Playbook 和报告页

## 快速开始

### 1. 环境准备

- Node.js >= 18
- pnpm >= 8
- MySQL 8.0（需可访问，或使用已有的 Demo 库）

### 2. 安装与配置

```bash
# 安装依赖
pnpm install

# 复制环境变量并修改数据库连接信息
cp .env.example .env
# 编辑 .env，确认 DB_HOST/DB_PORT/DB_USER/DB_PASSWORD 正确

# 初始化数据库（可选，已有 Demo 库可跳过）
# 按 scripts/sql/mysql/ 下编号顺序执行 SQL 脚本
```

### 3. 启动服务

```bash
# 终端 1：启动后端服务（语义层 + 规则引擎 + 报告服务）
pnpm dev:services

# 终端 2：启动 BFF
pnpm dev:bff

# 终端 3：启动前端
pnpm dev:web
```

打开浏览器访问 `http://localhost:5173`，进入向导页选择日期范围提交分析任务。

### 4. 编排模式

默认直连模式（BFF 直接调用语义层/规则引擎/报告服务）。如需启用 OpenClaw 编排：

```bash
# 启动 OpenClaw 运行时
pnpm dev:openclaw-runtime

# .env 中设置
USE_OPENCLAW_RUNTIME=true
```

详情见各服务 README：
- `apps/bff/README.md` — BFF 启动与 API 测试
- `services/semantic-api/README.md` — 语义层指标查询
- `services/playbook-engine/README.md` — 规则引擎
- `services/report-service/README.md` — 报告服务
- `services/openclaw-runtime/README.md` — OpenClaw 运行时

---

## 目录概览

```text
apps/
  bff/
  web/
docs/
  architecture/
    00-导航/
    01-场景/
    02-总体设计/
    03-实施计划/
    04-AI资产/
  data/
packages/
  analysis-contract/
  metric-contract/
  report-schema/
plugins/
  openclaw-domain-tools/
services/
  openclaw-runtime/
  playbook-engine/
  report-service/
  semantic-api/
scripts/
  sql/
    mysql/
```

其中：

- `plugins/openclaw-domain-tools/`：OpenClaw 固定技能与白名单工具适配
- `services/openclaw-runtime/`：OpenClaw 运行时 HTTP 入口与编排调用入口
