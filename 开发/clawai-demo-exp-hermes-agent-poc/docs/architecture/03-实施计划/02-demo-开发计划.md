# 1. 首个 Demo 开发计划

## 1.1 目标

围绕“在线一次校验合格率管控”场景，形成一份面向工程实施的开发计划，明确从当前 mock demo 逐步演进到端到端可运行系统的实施顺序、模块任务和验收标准。

## 1.2 开发范围

- 场景固定为 `first_pass_yield_monitoring`
- 打通 `Web -> BFF -> OpenClaw -> SemanticAPI -> PlaybookEngine -> ReportService -> Web`
- 接入现有 `MES/MOM` 作为业务数据源
- 增加系统侧 `MySQL 8.0` 与 `Redis`
- 支持首个 demo 的异步任务、结构化报告、审计与多人使用

## 1.3 开发原则

- 先打通链路，再替换 mock 数据和 mock 编排
- 先保证可信数字和规则结论，再引入模型解释
- 前端只消费结构化报告协议，不写业务判断
- OpenClaw 只负责编排和模型路由，不直接访问数据库
- 所有关键步骤都要保留 `traceId` 与审计记录

## 1.4 里程碑计划

### 1.4.1 M1：任务链路与系统基础设施

- 目标：把当前前后端 demo 变成可持续扩展的异步任务系统。
- 主要任务：
  - 引入系统数据库表：任务、报告、审计、模板配置
  - 引入 `Redis` 作为队列和缓存
  - 在 `apps/bff` 中替换当前内存 `Map`
  - 统一任务状态：`pending`、`running`、`completed`、`failed`
  - 固化 `analysisType`、`skillKey`、模板版本、规则版本
- 验收标准：
  - 任务和报告可以持久化
  - 服务重启后历史任务仍可查询
  - 前端任务页能读取真实状态

### 1.4.2 M2：语义层与规则引擎接入

- 目标：让报告中的核心数字和结论都来自可信后端能力。
- 主要任务：
  - 在 `services/semantic-api` 实现统一查询接口
  - 注册首批指标和维度映射
  - 在 `services/playbook-engine` 实现首版质量诊断 Playbook
  - 让 `BFF` 或中间任务流可以调用语义层和规则引擎
- 验收标准：
  - 能拿到一次校验合格率趋势、不合格结构、原料/设备关联结果
  - 能输出结构化规则结论

### 1.4.3 M3：OpenClaw 与模型接入

- 目标：让分析路径和模型调用由 OpenClaw 管理。
- 主要任务：
  - 在 `services/openclaw-runtime` 接入 OpenClaw Gateway
  - 注册白名单工具并完成 Hook 注入
  - 把当前 `simulateProcessing()` 替换为真实编排调用
  - 配置场景级和步骤级模型路由
  - 落地提示词模板和模型 fallback
- 验收标准：
  - OpenClaw 能根据中间结果决定下一步工具调用
  - 模型解释文本由 OpenClaw 驱动生成
  - 工具调用和模型调用都带审计记录

### 1.4.4 M4：报告服务、前端渲染与稳定化

- 目标：形成可演示、可多人使用的完整 demo。
- 主要任务：
  - 在 `services/report-service` 实现报告装配和模板输出
  - 完善 `apps/web` 的向导页、任务页、报告页
  - 完善统一区块渲染器和降级展示
  - 增加并发控制、超时、缓存与错误恢复
- 验收标准：
  - 用户可完整发起任务并查看报告
  - 报告可追溯来源和审计轨迹
  - 多用户同时使用时任务能稳定排队执行

## 1.5 模块开发清单

### 1.5.1 `apps/bff`

- 任务创建接口
- 任务状态查询接口
- 报告查询接口
- OpenClaw 调用适配层
- 任务存储与结果持久化
- 用户/租户上下文注入

### 1.5.2 `services/semantic-api`

- 查询接口 `POST /metrics/query`
- 指标注册表
- 维度映射与字段映射
- 数据源 repository
- 受控 SQL 模板
- 查询审计日志

### 1.5.3 `services/playbook-engine`

- Playbook 执行接口
- 阈值规则配置
- 判断树实现
- 结构化结论输出
- 规则版本管理

### 1.5.4 `services/openclaw-runtime`

- OpenClaw Gateway 接入
- Skill 定义
- 白名单工具注册
- Hook 注入
- 模型路由策略
- Prompt 模板管理

### 1.5.5 `services/report-service`

- 报告模板定义
- 报告装配逻辑
- `StructuredReport` 输出
- `sourceRefs` 与 `auditTrail` 生成
- 报告持久化

### 1.5.6 `apps/web`

- 场景向导页
- 任务状态页
- 报告页
- 统一区块渲染器
- 错误态、空态、等待态
- 报告模板适配展示

## 1.6 推荐开发顺序

1. 先补系统数据库与任务持久化
2. 再实现 `SemanticAPI`
3. 然后实现 `PlaybookEngine`
4. 再接 `ReportService`
5. 然后接入 `OpenClaw`
6. 最后完善前端联调和多人稳定性

## 1.7 数据与基础设施准备

### 1.7.1 业务数据源

- `MES/MOM`
- 检验记录
- 原料批次与配比
- ICP / 粒度等质量数据
- 设备维修保养记录

### 1.7.2 系统基础设施

- `MySQL 8.0`
  - 业务来源库：`mes_demo`（模拟 `MES/MOM` 数据，只读接入）
  - 应用自有库：`ce_agent_demo`（任务、报告、审计、规则、映射）
  - 初始化脚本见 `scripts/sql/mysql/`，执行说明见 `docs/data/07-首个demo-数据库初始化方案.md`
- `Redis`
  - 任务队列
  - 进度缓存
  - 查询缓存
  - 并发控制

## 1.8 联调顺序

1. 前端与 BFF：先打通任务发起、状态查询、报告读取
2. BFF 与系统数据库：先落真实任务状态和报告存储
3. BFF 与 SemanticAPI：联调首批指标查询
4. BFF 与 PlaybookEngine：联调规则结论
5. OpenClaw 与各工具：联调编排和审计
6. ReportService 与前端：联调结构化报告渲染

## 1.9 验收标准

- 用户能在前端发起“在线一次校验合格率管控”任务
- 系统能自动完成查数、诊断、解释、报告生成
- 报告核心数字可追溯到指标定义与查询记录
- 报告结论区分 `rule`、`model`、`hybrid`
- 前端只根据 `StructuredReport` 渲染，不写业务判断
- 多用户并发使用时，任务可排队、可查询、可回看

## 1.10 后续扩展方向

- 新增更多分析场景
- 丰富模型路由策略
- 增加报告导出能力
- 增加历史报告对比与趋势复盘
