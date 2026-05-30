# 1. OpenClaw 接入计划

## 1.1 目标

明确首个 demo 中与 **外部 OpenClaw（上游 Gateway / Agent）** 的接入顺序、边界和替换策略，保证当前已实现的 `BFF -> SemanticAPI -> PlaybookEngine -> ReportService` 链路可以平滑升级为真实智能编排链路。**内部自建 `openclaw-runtime` 暂不作为后续演进方向**（见 1.9）。

## 1.2 当前阶段定位

当前仓库已先落地：

- `SemanticAPI`：可信数字查询
- `PlaybookEngine`：可信规则判断
- `BFF`：任务入口与任务状态持久化

这意味着当前已完成的是：

- **非 OpenClaw 模式的可运行主链路**

这样做的目的是：

- 先验证数据口径
- 先验证规则判断
- 先验证结构化报告和前端展示
- 避免在 OpenClaw 尚未接好前，把问题混在编排层里排查

## 1.3 推荐接入顺序

### 1.3.1 第一步：保留现有直连链路作为基线

当前建议继续保留：

- `BFF -> SemanticAPI`
- `BFF -> PlaybookEngine`
- `BFF -> ReportService`

价值：

- 有稳定基线可对照
- OpenClaw 接入失败时可以快速回退

### 1.3.2 第二步：在外部 OpenClaw 注册场景技能（及对应 Tools）

**（历史记录）** 曾规划在自建 `services/openclaw-runtime` 上增加场景入口；**当前取向改为只对接外部 OpenClaw**，技能与工具注册在 Gateway 侧完成，HTTP 调用本仓库语义层 / 规则 / 报告等受控接口。

首版建议只接一个固定技能：

- `quality_first_pass_yield`

它只服务：

- `first_pass_yield_monitoring`

首版不做：

- 自由问答
- 开放式工具选择
- 任意指标自由组合

### 1.3.3 第三步：把现有服务包装成白名单工具

OpenClaw 首批白名单工具建议直接映射现有后端能力：

1. `query_fpyr_daily`
2. `query_defect_item_breakdown`
3. `query_equipment_event_timeline`
4. `run_quality_playbook`
5. `build_quality_report`

要求：

- 输入输出必须走受控 JSON 协议
- 不允许传原始 SQL
- 每次调用都保留 `traceId`
- 工具结果保留审计记录

## 1.4 对当前代码的具体改造建议

### 1.4.1 `BFF`

当前：

- `BFF` 直接调用 `SemanticAPI`
- `BFF` 直接调用 `PlaybookEngine`
- `BFF` 直接调用 `ReportService`

后续改造（以外部 OpenClaw 为准）：

- `BFF` 只调用 **外部 OpenClaw**（Gateway 或官方约定的执行端点），不传自由 Tool 列表
- 由外部编排触发本仓库 **白名单 Tools**（HTTP），再间接调用 `SemanticAPI` / `PlaybookEngine` / `ReportService`

### 1.4.2 `SemanticAPI`

保持不变：

- 继续做受控查询
- 继续输出 `queryAuditId`

### 1.4.3 `PlaybookEngine`

保持不变：

- 继续输出可信判断
- 后续由 OpenClaw 调用，而不是由 BFF 直接调用

### 1.4.4 报告装配

当前已拆到：

- `services/report-service`

后续由 OpenClaw 调用 `build_quality_report`

## 1.5 推荐里程碑

### M1：当前阶段

- 真实数据库
- 真实查询接口
- 真实规则服务
- 真实前端报告展示

### M2：外部 OpenClaw 接入

- 上游 Gateway / Agent 可调通本仓库环境
- 固定技能 `quality_first_pass_yield`（或等价 Skill 配置）
- 注册首批白名单 Tools（HTTP → 各受控服务）

### M3：BFF 切换调用入口

- `BFF` 在编排模式下不再直接串 `SemanticAPI` / `PlaybookEngine` / `ReportService`
- 改由 `BFF -> 外部 OpenClaw`（失败时可回退直连基线，见 1.3.1）

### M4：增强编排

- 根据不合格类别决定工具路径
- 失败重试和降级
- 模型解释增强

## 1.6 当前建议

当前最合理的安排是：

1. 先把 `.env`、服务持久化和 `PlaybookEngine` 稳定住
2. 再补 `report-service`
3. **以外部 OpenClaw 接管编排**（内部 `openclaw-runtime` 不作为后续迭代重点，见 1.9）

## 1.7 当前落地状态

目前仓库中已经具备：

- **（保留作对照/过渡）** `services/openclaw-runtime` 最小服务 + `plugins/openclaw-domain-tools` 编排实现
- 固定技能 `quality_first_pass_yield`（逻辑可迁移为「外部 Skill + 本仓库 Tool 端点」）
- 首批白名单工具包装（对内 runtime 或对外 Gateway 均可复用同一 HTTP 契约）
- `BFF` 通过环境变量切换编排入口（当前实现指向自建 runtime；**演进目标为指向外部 OpenClaw**，见 1.9）
- 首版分支编排（按主导异常类别选择路径；规则源仍以 `playbook-engine` / 配置为准）

基线与编排相关开关仍以工程需要为准；**产品与技术演进上，优先完成「外部 OpenClaw + 本仓库受控服务」闭环**。

## 1.8 与上游 OpenClaw 仓库（openclaw/openclaw）的对接方向

后续开发**以对接 [openclaw/openclaw](https://github.com/openclaw/openclaw) 为主路径**，并保持本仓库 **BFF → 语义层 / 规则 / 报告** 的直连基线作失败回退。

| 阶段 | 内容 |
| --- | --- |
| 当前（演进重点） | 将域能力注册为上游可调用 **Tools / Skills**（HTTP 或 Gateway 约定），由 **Gateway + Agent** 编排；分支与阈值仍以 `playbook-engine` 与配置为准 |
| 仓库内遗留 | `openclaw-runtime` + `openclaw-domain-tools`：**暂不继续作为功能演进载体**，可与外部行为对齐时当作参考实现或本地调试，不写死新产品需求 |
| 再下一阶 | `BFF` 编排模式主路径改为调用 **外部** `openclaw gateway`（或官方 CLI/API）；失败时回退 **直连** `SemanticAPI` / `PlaybookEngine` / `ReportService` |
| 长期 | 模型只负责解释与成文；**口径、分支、阈值仍以配置与规则服务为准**，与项目总则一致 |

结论：**新增 Skill、编排策略与 Gateway 配置走外部 OpenClaw**；本仓库专注 **受控 Tool 端点 + 协议 + 审计**，与 1.9 一致。

## 1.9 架构取向：后续仅考虑外部 OpenClaw

**决策**：智能编排统一走**外部 OpenClaw**；**内部自建 `services/openclaw-runtime` 暂不考虑继续投入**（不在其上叠加新 Skill、新分支策略的产品目标）。

**仍建议保留**：

- `plugins/openclaw-domain-tools` 中的 **工具契约、HTTP 适配、白名单语义**——可视为「给外部 Gateway 调用的同一批能力」的代码与类型载体，避免重复造协议。
- `BFF -> SemanticAPI / PlaybookEngine / ReportService` **直连基线**，便于对照与降级。

**实施侧要点**：

- 新能力优先做成 **可被外部调用的 Tool**（及在上游注册的 Skill），并保证 `traceId`、租户上下文贯通。
- `BFF` 的「编排模式」执行 URL 与未来环境变量命名，逐步从「指向自建 runtime」过渡到「指向外部 Gateway」，以实际部署为准更新 README / `.env.example`。

**双 Skill（外部导入 + 本仓库打通）的逐步计划**：见 [04-外部OpenClaw-双Skill导入与打通计划](./04-外部OpenClaw-双Skill导入与打通计划.md)。
