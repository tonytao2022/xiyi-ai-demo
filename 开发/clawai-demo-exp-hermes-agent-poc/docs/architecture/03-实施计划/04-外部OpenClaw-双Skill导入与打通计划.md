# 外部 OpenClaw：双 Skill 导入与代码打通计划

本文档基于前期沟通整理：**先在外部 OpenClaw（Gateway / Agent）侧完成两个「智能体」对应的 Skill 导入与 Tool 注册，再在本仓库打通 BFF → 外部编排 → 受控后端**的调用链。与 [03-openclaw-接入计划](./03-openclaw-接入计划.md) 中「仅演进外部 OpenClaw」的取向一致。

---

## 1. 目标与边界

**目标**

- 在 OpenClaw 侧可加载 **两个 Skill**（各对应一类分析意图），并能从本应用 **发起任务 → 外部编排 → 拉取结构化报告**。
- 全链路携带 **`traceId`**，租户与身份由 BFF 校验，**不允许**前端或模型自由指定 Tool 名称列举。

**不改变的原则**（与项目总则一致）

- 可信数字来自 **SemanticAPI**，结论裁量来自 **PlaybookEngine**，报告形态来自 **ReportService**。
- OpenClaw 只做编排与成文辅助；**口径、分支、阈值**以语义层注册与规则配置为准。

---

## 2. 两个 Skill 的定义（产品层）

以下命名与现有代码对齐，便于少改契约；若 OpenClaw 的 `SKILL.md` 里 `name` 与 `skillKey` 需不同，在 frontmatter 中显式写清映射表。

### 2.1 Skill A：全量监控与异常诊断（已有逻辑可复用）

| 项 | 取值 |
| --- | --- |
| **skillKey** | `quality_first_pass_yield` |
| **analysisType** | `first_pass_yield_monitoring` |
| **用户价值** | 从 FPY 趋势 → 不合格分解 → 按主导异常类别分支（设备 / 来料工艺 / 通用）→ 完整报告 |
| **白名单工具（概念）** | `query_fpyr_daily`、`query_defect_item_breakdown`、`query_equipment_event_timeline`（按分支可跳过）、`run_quality_playbook`、`build_quality_report` |

### 2.2 Skill B：趋势与预警简报（第二个「智能体」）

| 项 | 取值 |
| --- | --- |
| **skillKey** | `quality_fpyr_trend_brief`（建议，实现时可微调英文名） |
| **analysisType** | `first_pass_yield_trend_brief` |
| **用户价值** | 早会 / 管理视角：快速看趋势与规则层预警，**默认不做**检验项下钻与设备时间线 |
| **白名单工具（概念）** | `query_fpyr_daily`、`run_quality_playbook`、`build_quality_report`（**不包含** defect breakdown、equipment timeline） |

**说明**：Skill B 与 A 的差异必须在**编排层**真实体现（调用的 HTTP Tool 集合不同）。若当前 `PlaybookEngine` / `ReportService` 尚无 `brief` / `profile` 入参，需在本计划中列为 **前置小迭代**（见 §6）。

---

## 3. OpenClaw 侧：Skill 导入形态（SKILL.md）

上游习惯以 **目录 + `SKILL.md`** 描述 Skill（YAML frontmatter + Markdown 正文）。参考：

- [openclaw/openclaw — creating-skills](https://github.com/openclaw/openclaw/blob/main/docs/tools/creating-skills.md)
- [openclaw/clawhub — skill-format](https://github.com/openclaw/clawhub/blob/main/docs/skill-format.md)

**建议-repo 布局（可与本仓库分仓，便于 Gateway 挂载）**

```text
skills/
  quality_first_pass_yield/
    SKILL.md
  quality_fpyr_trend_brief/
    SKILL.md
```

**每个 `SKILL.md` 建议写明（正文层）**

- 场景边界：只服务本 Demo 制造质量分析，不做自由 SQL、不扩展未注册指标。
- 强制变量：`traceId`、租户相关上下文（与 BFF 下发字段一致）。
- **允许的 Tool 列表**（与 §2 白名单一字不差），并说明调用顺序；Skill A 需简述「分支由规则服务返回的事实决定，模型不自造分支」。
- 输出期望：最终需得到可被 BFF 消费的结构化报告引用或任务完成回调（取决于 Gateway 与 BFF 的集成方式）。

**环境依赖**（frontmatter / `metadata.openclaw`）

- 声明访问本应用所需 Base URL、鉴权方式（如 Bearer）、超时建议；避免在 Skill 内写死密钥。

---

## 4. OpenClaw 侧：Tool 注册

每个白名单能力对应 **一个 HTTP Tool**（或 Gateway 的等价抽象），请求体使用本仓库已有或即将冻结的 **受控 JSON**（与 `metric-contract`、playbook、report 入参对齐）。

**工具与后端映射（逻辑）**

| toolKey | 典型 HTTP 目标（由你方选定，二选一） |
| --- | --- |
| `query_fpyr_daily` | `SemanticAPI` `/metrics/query`（metricKey 等受控） |
| `query_defect_item_breakdown` | 同上 |
| `query_equipment_event_timeline` | 同上 |
| `run_quality_playbook` | `PlaybookEngine` `/playbooks/execute` |
| `build_quality_report` | `ReportService` `/reports/build` |

**集成策略建议**

- **对内网**：若 Gateway 与语义层同事务区，可直接调各服务（仍需 `traceId`、鉴权）。
- **与「BFF 唯一入口」一致**：在 BFF 增加一层 **`/internal/tools/*` 或 API 网关转发**（推荐），统一鉴权与审计，OpenClaw 只认 BFF 暴露的少量 URL。具体路径在实施阶段拆解为 OpenAPI 小表。

Skill B 在 Gateway 的 Agent 配置中 **只挂载上述子集** 三个 Tool，从工程上保证「不会误调下钻接口」。

---

## 5. 本仓库代码打通（阶段任务）

按依赖顺序执行，便于每步可验收。

### 阶段 A：契约与后端差异（Skill B）

1. **PlaybookEngine**：支持 `analysisType: first_pass_yield_trend_brief` 或在 execute 请求中增加 **`mode: brief`**（二选一），规则输出足以支撑简报（可允许缺省 defect/equipment 事实）。
2. **ReportService**：支持简报 **profile**（更少区块），且核心 KPI/规则结论仍来自结构化字段，不由模型改写。
3. **SemanticAPI**：无需新指标即可支撑 Skill B 的 FPY 日趋势查询；确认时间范围、租户过滤与 Skill A 一致。

### 阶段 B：BFF

1. **白名单**：`(skillKey, analysisType)` 允许集合增加 Skill B；非法组合返回 **400**。
2. **外部执行 URL**：
   - 若外部 Gateway **单一入口**：`OPENCLAW_EXECUTE_URL` + body 内 `skillKey`，由对端路由到对应 Agent/Skill。
   - 若 **按 Skill 分 URL**：扩展环境变量（如 `OPENCLAW_EXECUTE_URL_QUALITY_FPYR_BRIEF`）或在代码内维护 **skillKey → URL** 映射表（避免前端传 URL）。
3. **请求/响应适配**：沿用现有 `OPENCLAW_AUTH_TOKEN`、`OPENCLAW_REQUEST_TIMEOUT_MS`、`OPENCLAW_COMPAT_MODE`；与外部真实响应做一次 **样例对齐**（必要时增加 `external` compat 分支）。
4. **任务落库**：`task.input` 中持久化 `skillKey`、`analysisType`，便于报表与审计。

### 阶段 C：Web（可选但建议）

1. 向导增加 **分析模式**：「深度诊断」→ Skill A；「趋势简报」→ Skill B（映射为枚举，不写死字符串给模型）。
2. 仅提交业务参数（时间、工厂、产线等），与现有 `analysis-contract` 输入一致。

### 阶段 D：联调与门禁

1. 在外部 OpenClaw 用 **固定 traceId** 各跑通 Skill A / B。
2. 查审计：Skill B 的请求链中 **不得出现** defect breakdown、equipment timeline 的 queryAuditId（或等价日志）。
3. 验证 **直连基线**：`USE_OPENCLAW_RUNTIME=false` 或关闭外部编排时，原 BFF 直连链路仍可用（与 [03](./03-openclaw-接入计划.md) 一致）。

---

## 6. 风险与依赖

| 风险 | 缓解 |
| --- | --- |
| 外部 Gateway API 与当前 BFF 假设不一致 | 早期拉通一次真实 response，锁定适配层；文档记录样例 JSON |
| Skill B 缺 brief 能力 | 先做 Skill A 外部打通；Skill B 延后或暂用全量 playbook + 报告截断（仅过渡，需在报告层标明 profile） |
| Skill 目录放本仓库还是独立仓 | 若独立仓，在 CI 或文档中标注 **版本对齐**（与本仓库 Tool 契约同步） |

---

## 7. 建议里程碑（顺序）

| 序号 | 里程碑 | 产出 |
| --- | --- | --- |
| M0 | 冻结 Tool HTTP 请求/响应样例 | 小表格或 `docs/testing` 下补片段 |
| M1 | Skill A：`SKILL.md` + Gateway Tools + 单次手工跑通 | 录屏或 Postman 集 |
| M2 | BFF 适配外部 URL 与响应；任务全链路 Skill A | 端到端从 Web 或 API |
| M3 | 后端 brief/profile（Skill B） | Playbook + Report 可测 |
| M4 | Skill B：`SKILL.md` + 子集 Tools + BFF 枚举 + 向导 | 双 Skill 可切换 |
| M5 | 文档：更新 03 中执行 URL 说明、CHANGELOG | 上线备忘 |

---

## 8. 与本文档相关的其他文件

- 工具与白名单语义：`docs/architecture/04-AI资产/04-工具白名单设计.md`
- 系统边界：`docs/architecture/02-总体设计/01-系统边界与职责.md`
- 接入总取向：`docs/architecture/03-实施计划/03-openclaw-接入计划.md`

---

**结论**：先在外部 OpenClaw 用 **`SKILL.md` + Tool 注册** 落地两个 Skill（A 全量、B 简报子集），同时在本仓库补齐 **Skill B 所需 brief/profile** 与 **BFF 双 skill 白名单及执行 URL 策略**，即可完成「导入 → 打通调用」的闭环。
