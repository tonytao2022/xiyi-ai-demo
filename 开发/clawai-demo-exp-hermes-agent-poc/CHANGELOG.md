# Changelog

## 未发布

- 双 OpenClaw Skill：`quality_fpyr_trend_brief` / `first_pass_yield_trend_brief`（趋势简报，仅 FPY + playbook + 报告），与既有全量监控技能并行；BFF 白名单校验、`OPENCLAW_EXECUTE_URL_TREND_BRIEF` 可选覆盖；仓库内 `skills/*/SKILL.md` 供外部龙虾导入。
- Playbook / Report 支持简报分析类型与精简报告区块；OpenClaw Runtime 统一为 `POST /skills/:skillKey/execute`。

## 初始化阶段

### `1f82895` 初始化首个 demo 工程骨架

- 建立 monorepo 基础结构
- 增加 `apps/web` 与 `apps/bff` 最小可运行 demo
- 增加共享协议包：
  - `packages/analysis-contract`
  - `packages/metric-contract`
  - `packages/report-schema`
- 增加服务与插件占位目录：
  - `services/semantic-api`
  - `services/playbook-engine`
  - `services/report-service`
  - `services/openclaw-runtime`
  - `plugins/openclaw-domain-tools`

### `9c2af9e` 补充首个 demo 的架构与数据设计文档

- 增加场景、总体设计、实施计划、AI 资产等架构文档
- 统一 `docs/architecture/` 文档结构
- 增加 `docs/data/` 数据设计文档：
  - 语义层指标草案
  - 来源表与字段映射草案
  - 指标计算与查询逻辑草案
- 更新 `README.md` 作为项目总览入口

### `ca0f1a3` 补充 AI 协作约定与仓库忽略规则

- 增加 `AGENTS.md`
- 增加 `.cursor/rules/` 项目规则
- 增加 `.gitignore`
- 明确 AI 协作、文档维护和仓库管理约定

### 未打标签的文档更新（检验项目字典与分类）

- 新增 `docs/data/06-首个demo-检验项目字典与分类映射.md`：`qm_test_type` 字典说明、`item_code` 对齐待确认项、正式映射与模拟 Demo 关键词降级规则
- `02` 补充检验项目字典小节与委托结果—字典可选链路；`00` 阅读顺序与文档关系同步；`05` 清单交叉引用 `06`；`README` 与导航文档索引更新

### 未打标签的数据库初始化脚本

- 新增 `docs/data/07-首个demo-数据库初始化方案.md`：明确 `mes_demo` 与 `ce_agent_demo` 的双库拆分、最小表范围和执行顺序
- 新增 `scripts/sql/mysql/`：补充 `MySQL 8.0` 建库建表脚本，覆盖 `MES` 模拟库与应用库
- `README`、目录说明、目录骨架设计与开发计划同步补充数据库脚本索引和双库约定，并将数据库实现约定统一到 `MySQL 8.0`

## 当前状态

当前仓库已具备：

- 可运行的前后端 demo 骨架
- 首个场景“在线一次校验合格率管控”的设计文档
- 面向后续真实实现的语义层、规则引擎、OpenClaw 和报告服务规划
- 可持续维护的 AI 资产、规则和数据文档结构
