# 讨论：用OpenClaw生态实现兮易AI大脑的AI智能体架构

日期：2026-05-30
参与：Antony（产品架构师）、Hugo（数据工程师）、Tony（架构师）

---

## 一、Hermes POC架构回顾与核心价值提取

### 1.1 Hermes架构最值得优先整合的三个设计（Antony观点）

**第一名：数据与推理分离的"三层受控"架构**
这是Hermes中最具战略价值的设计。它把系统拆成三个职责清晰的层：
- **语义层（Semantic API）**：只负责"可信数字"——指标口径、模板查询、审计。不开放SQL，不接受自由查询。
-  **规则引擎（Playbook Engine）** ：只负责"可信判断"——阈值、判断树、方法论。不渲染UI，不生产自由文本。
- **编排层（OpenClaw Runtime）**：只负责"可信编排"——工具调用顺序、分支决策、Prompt装配。不访问数据库，不改写核心数字。

> **为什么最有价值？** 现有品质专员平台的问题就是"数据、逻辑、展现全混在一起"——Flask API里拼SQL、前端直接计算KPI、没有审计轨迹。三层受控把这些拆开了，每个层只做自己的事，出了问题能快速定位。

**第二名：白名单工具与traceId全链路审计**
Hermes给每个Skill配置了固定的工具白名单（如 `quality_first_pass_yield` 只能调用5个工具），每个工具调用都必须携带 `traceId`，且所有调用都要写审计记录到 MySQL。
- 这不是"加个日志"——是每次指标查询、每次规则执行、每次报告生成都有 `traceId`、`spanId`、`durationMs`、`requestSummary`、`responseSummary`、`resultStatus`。
- 现有平台没有任何全链路跟踪，出了问题只能"看日志猜"。

**第三名：结构化报告协议（StructuredReport Schema）**
Hermes定义了一套完整的报告协议——KPI卡片、表格、图表、洞察列表、Markdown段落，全部走标准JSON Schema。前端只消费这个Schema渲染，不直接拼前端代码。
- 现有平台的前端硬编码了KPI计算逻辑，换了场景就要改代码。
- 有了结构化报告协议，新增一个场景只需在后端新增一个Skill和一套Playbook，前端不用改。

### 1.2 用OpenClaw替代Hermes后的架构图（Antony观点）

```
                              ┌──────────────────────────────────────┐
                              │         品质专员平台 前端             │
                              │  (Vue/React)                         │
                              │  场景入口 · 分析向导 · 报告渲染      │
                              └──────────────┬───────────────────────┘
                                             │ HTTP / REST
                                             ▼
                              ┌──────────────────────────────────────┐
                              │    BFF 层 (现有8890 Flask API扩展)    │
                              │  ap_analysis_instance 作为任务模型     │
                              │  鉴权 · 参数校验 · traceId生成        │
                              │  任务状态轮询 · 报告查询              │
                              │  新增: /api/v1/xiyi/agent/analyze     │
                              └──────────────┬───────────────────────┘
                                             │ 调用OpenClaw Skill
                                             ▼
               ┌─────────────────────────────────────────────────────────────┐
               │              OpenClaw Runtime (已有deepseek模型)            │
               │  ┌─────────────────────────────────────────────────────┐   │
               │  │ OpenClaw Skill: quality_first_pass_yield            │   │
               │  │  - 通过Tool白名单编排工具链                          │   │
               │  │  - 分支策略: 磁物→设备优先 / ICP→来料优先           │   │
               │  │  - Prompt装配 + 模型增强解释                         │   │
               │  │  - 禁止直连数据库，只能调用受控API                   │   │
               │  └──────────┬──────────┬──────────┬──────────────────┘   │
               └─────────────┼──────────┼──────────┼──────────────────────┘
                             │          │          │
               ┌─────────────▼──┐ ┌────▼──────────▼──┐ ┌───────────────┐
               │ 受控指标查询API │ │  规则引擎        │ │  报告服务     │
               │ (8890扩展/新增) │ │  (新服务)        │ │  (新服务)     │
               │ ────────────   │ │ ────────────     │ │ ──────────    │
               │ POST /api/v1/  │ │ POST /api/v1/    │ │ POST /api/v1/ │
               │ metrics/query  │ │ playbooks/execute │ │ reports/build │
               │ 只接受Metric-  │ │ 基于阈值的判断树  │ │ 结构化报告    │
               │ Query协议      │ │ 输出Insight[]     │ │ Schema装配    │
               └────────┬───────┘ └──────────────────┘ └───────────────┘
                        │ 只通过预定义SQL模板访问
                        ▼
               ┌──────────────────────────────────────┐
               │    xiyi_quality 数据库 (27张表)       │
               │    + ds_mock_data 模拟数据             │
               │    + 新增: audit_log, rule_config     │
               └───────────────────────────────────────┘
```

**关键变化对比（Hermes → OpenClaw）**：

| 组件 | Hermes POC | OpenClaw方案 |
|------|-----------|-------------|
| 编排层 | services/openclaw-runtime (Node.js, 自己写编排代码) | **OpenClaw原生Skill机制**（SKILL.md + Tool编排，不需要自己写Runtime Server） |
| 语义层 | services/semantic-api (独立Express服务，MySQL直连) | **8890 Flask API扩展 + 新增受控查询端点**（复用现有基础设施） |
| 规则引擎 | services/playbook-engine (独立Express服务) | **Python/Flask新服务 + MySQL rule_config表**（与Python技术栈一致） |
| 报告服务 | services/report-service (独立Express服务) | **Python/Flask新服务 + 现有ap_scene_report_tpl** |
| 协议包 | packages/analysis-contract/metric-contract/report-schema (TypeScript) | **Python dataclasses + JSON Schema**（或直接复用Hermes的TS Schema生成JSON） |
| 白名单插件 | plugins/openclaw-domain-tools (TypeScript) | **OpenClaw Tool定义 + Python HTTP客户端** |
| 审计 | metric_query_audit表 (独立) | **新增 audit_tool_call 表**（记录工具调用链路） |

### 1.3 支撑"受控查询"和"规则引擎"的现有表分析（Antony观点）

**可以直接用于受控查询的表**：

| 表名 | 用途 | 对应Hermes MetricKey |
|------|------|---------------------|
| `dg_indicator_atom` | **已有7个注册指标**（FPY_RATE, MAG_ABNORM_RATE等），含threshold_upper/lower，可作为受控指标的注册中心 | fpyr_daily |
| `dg_indicator_snapshot` | 已有每日指标快照数据，可直接作为趋势分析的数据来源 | fpyr_daily |
| `ds_mock_data` | 模拟数据含fpy、合格率等，可做测试验证 | fpyr_daily, defect_item_breakdown |
| `dg_indicator_category` | 指标分类，可支撑多维度下钻 | dimensions |

**可以直接用于规则引擎的表**：

| 表名 | 用途 |
|------|------|
| `dg_quality_check_rule` | **已有规则定义框架**（rule_code, check_condition, severity），可扩展为规则引擎配置源 |
| `dg_quality_check_log` | 规则执行日志，可扩展为审计记录 |
| `dg_data_standard` | 数据字典，可作为"判断树"中的分类依据 |
| `sys_config` | 系统配置，可存放阈值等运行时配置 |

**需要新增的表**：

| 表名 | 用途 | 建议位置 |
|------|------|---------|
| `agent_skill_config` | Skill定义、工具白名单、分支路由策略 | xiyi_quality |
| `agent_skill_execution` | skill执行记录、traceId、工具调用链路 | xiyi_quality |
| `agent_audit_tool_call` | 每次工具调用的审计记录（traceId, toolKey, duration, status） | xiyi_quality |
| `agent_rule_config` | 规则引擎配置（阈值、判断树、分支策略），类似于Hermes的rule_config | xiyi_quality |

---

## 二、数据层扩展方案

### 2.1 semantic-api受控指标查询在8890 API上的扩展（Hugo观点）

**方案：在现有8890 Flask API上新增一个受控指标查询端点**

现有的8890 API是Flask框架，直连MySQL。我们要做的是**新增而不是重写**。

**新增端点设计**：

```python
# api/v1/xiyi/metrics/query  (新增受控查询端点)

POST /api/v1/xiyi/metrics/query
Request Body:
{
  "metricKey": "fpyr_daily",          # 必须有，受控指标注册中心校验
  "dimensions": ["date"],              # 维度列表
  "filters": [                         # 受控过滤器
    {"field": "siteId", "operator": "eq", "value": "A01"},
    {"field": "stock_oper_order", "operator": "eq", "value": "ZKI"}
  ],
  "grain": "day",                      # 粒度
  "timeRange": {
    "startAt": "2026-03-01T00:00:00+08:00",
    "endAt": "2026-03-30T23:59:59+08:00",
    "timezone": "Asia/Shanghai"
  },
  "auditContext": {
    "traceId": "trace_abc123",
    "tenantId": "tenant-demo",
    "actorId": "openclaw-runtime",
    "skillKey": "quality_first_pass_yield"
  }
}

Response:
{
  "queryAuditId": "audit_uuid",
  "requestedAt": "2026-05-30T...",
  "sourceSystem": "xiyi_quality",
  "dataTimestamp": "2026-03-30T...",
  "metricDefinitions": [
    {"metricKey": "fpyr_daily", "metricName": "日一次校验合格率", "definitionVersion": "v1", "unit": "%"}
  ],
  "rows": [
    {"date": "2026-03-27", "totalBatchCount": 10, "qualifiedBatchCount": 9, "defectBatchCount": 1, "fpyr": 90.0},
    ...
  ]
}
```

**关键安全约束**：
1. `metricKey` 必须在 `dg_indicator_atom` 中已注册，否则拒绝
2. 不接受原始SQL，只接受预定义的查询模板（在代码中hardcode，类似Hermes的executeFpyrDaily）
3. `filters` 只支持特定的字段白名单（如 `siteId`, `judgeCode`, `stock_oper_order`），不接受任意字段
4. 所有查询记录写入 `metric_query_audit`（新增表）
5. `auditContext.traceId` 必填，否则拒绝

### 2.2 traceId全链路审计在MySQL中的实现（Hugo观点）

**三个新增表的设计**：

```sql
-- 表1: agent_task (对应Hermes的analysis_task)
CREATE TABLE agent_task (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL UNIQUE,      -- 任务UUID
  trace_id VARCHAR(64) NOT NULL UNIQUE,      -- 全局唯一traceId
  scene_id INT NOT NULL,                     -- 关联现有ap_scene_config
  analysis_type VARCHAR(64) NOT NULL,        -- first_pass_yield_monitoring等
  status ENUM('pending','running','completed','failed') DEFAULT 'pending',
  input_payload JSON,
  playbook_result JSON,
  report_id VARCHAR(36),
  error_message TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  completed_at DATETIME(3),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 表2: agent_tool_call (审计日志核心表)
CREATE TABLE agent_tool_call (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  trace_id VARCHAR(64) NOT NULL,             -- 关联traceId
  task_id VARCHAR(36),                       -- 关联taskId
  span_id VARCHAR(64) NOT NULL,              -- 子步骤唯一ID
  parent_span_id VARCHAR(64),                -- 父步骤ID (形成调用树)
  tool_key VARCHAR(64) NOT NULL,             -- 工具名称
  target_service VARCHAR(32) NOT NULL,       -- semantic-api / playbook-engine / report-service
  status ENUM('success','failure','skipped') NOT NULL,
  request_summary JSON,                      -- 请求摘要 (不含敏感数据)
  response_summary JSON,                     -- 响应摘要
  duration_ms INT,
  error_message TEXT,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_trace_id (trace_id),
  INDEX idx_task_id (task_id),
  INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 表3: agent_report (结构化报告存储)
CREATE TABLE agent_report (
  report_id VARCHAR(36) PRIMARY KEY,
  task_id VARCHAR(36) NOT NULL UNIQUE,
  trace_id VARCHAR(64) NOT NULL UNIQUE,
  analysis_type VARCHAR(64) NOT NULL,
  template_version VARCHAR(32),
  report_payload JSON NOT NULL,               -- 完整的StructuredReport JSON
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

**traceId生成规则**：
- BFF层（8890 Flask API）在收到分析请求时用 `uuid.uuid4().hex` 生成全局唯一traceId
- traceId贯穿整个调用链：`BFF → OpenClaw Skill → 语义层/规则引擎/报告服务`
- 每个工具调用生成一个新的 `span_id`，记录`parent_span_id`形成调用树
- 报告落库时traceId写入report_payload的reportMeta中

### 2.3 OpenClaw Skill不直接访问数据库的实现（Hugo观点）

**核心原则：OpenClaw Skill只能通过HTTP调用受控API，不能直连数据库。**

实现方式：
1. **在OpenClaw Skill中定义Tool**，每个Tool对应一个HTTP请求到受控API
2. **Skill的SKILL.md中明确声明白名单工具**，禁止调用未注册工具
3. **8890 API新增端点作为数据出口**，OpenClaw只调用这些端点

```
OpenClaw Skill (SKILL.md)
  │
  ├── Tool: query_fpyr_daily
  │     → http POST to 8890/api/v1/xiyi/metrics/query   (受控指标查询)
  │       ← 返回MetricQueryResult JSON
  │
  ├── Tool: query_defect_item_breakdown
  │     → http POST to 8890/api/v1/xiyi/metrics/query   (另一个受控查询)
  │
  ├── Tool: run_quality_playbook
  │     → http POST to playbook-engine (新服务)
  │
  └── Tool: build_quality_report
        → http POST to report-service (新服务)
```

**为什么OpenClaw不需要直连数据库？**
- 所有数据都通过8890 API的受控查询获取
- 受控查询只返回预定义指标、不返回原始表数据
- 即使模型"想要"更多数据，它也没有工具可以直连
- 审计在受控API层就完成了（每次查询写audit_log）

---

## 三、编排层与规则引擎设计

### 3.1 Playbook Engine用OpenClaw Skill实现（Tony观点）

**Hermes的Playbook Engine是一个独立的Express微服务**。在OpenClaw方案中，我们有两种实现方式：

**方式A（推荐）：独立Python Playbook Service + OpenClaw Skill编排调用**

Hermes的playbook-engine核心逻辑——阈值判断、分支策略、规则结论——作为独立Python微服务部署。OpenClaw Skill不实现这些规则逻辑，而是编排调用这个服务。

优势：
- 规则逻辑与AI编排分离：修改阈值不需要改Skill
- 规则存储在MySQL（rule_config表），可配置
- 规则结论可回溯（有审计、有规则版本）
- Python技术栈与现有8890 API一致

```
OpenClaw Skill: quality_first_pass_yield
  │
  ├── Tool: query_fpyr_daily     → 8890 API
  ├── Tool: query_defect         → 8890 API
  ├── Tool: query_equipment      → 8890 API (按分支策略可选)
  │
  ├── Tool: run_quality_playbook → Playbook Service (POST /playbooks/execute)
  │     输入: facts (fpyr_rows + defect_rows + equipment_rows)
  │     输出: PlaybookResult (statusLevel, headline, insights, ruleSummary)
  │
  └── Tool: build_quality_report → Report Service (POST /reports/build)
        输入: facts + playbookResult
        输出: StructuredReport JSON
```

**方式B（轻量替代）：全部放在OpenClaw Skill中，通过Prompt + Tool调用实现**

把阈值判断、分支策略写在SKILL.md的Prompt里，让模型自己判断。但这种方式：
- 问题：结论不可回溯、规则版本不可控、模型可能"自由发挥"
- 不推荐原因是用户明确要求"数据与推理分离、规则引擎"

**建议采用方式A**。Playbook Service代码量不大（约200行Python），核心逻辑是基于阈值和事实的结构化判断，不需要复杂AI。

### 3.2 Skill执行流程在OpenClaw中的定义（Tony观点）

**OpenClaw Skill的执行流程由SKILL.md + Tool白名单 + 模型推理共同完成**。

```
执行流程:
1. BFF收到分析请求，生成traceId，调用OpenClaw
2. OpenClaw加载 quality_first_pass_yield Skill
3. Skill按SKILL.md定义的流程执行:
   a. 调用 query_fpyr_daily → 获取FPY趋势数据
   b. 调用 query_defect_item_breakdown → 获取不合格项目结构
   c. 模型基于缺陷数据做"分支决策":
      - 主导类别是"磁物类" → 调用 query_equipment_event_timeline
      - 主导类别是"ICP类" → 跳过设备查询，从来料方向分析
      - 其他 → 标准流程
   d. 调用 run_quality_playbook → 获取规则引擎结论
   e. 调用 build_quality_report → 生成结构化报告
   f. 模型对报告做"增强解释"（补充风险信号、建议动作、下一步追问）
4. 报告返回给BFF
5. BFF把报告存到agent_report表
6. 前端通过reportId查询渲染
```

**SKILL.md中需要定义的编排逻辑**：

```markdown
## 标准执行流程
1. 先用 query_fpyr_daily 确认最新FPY
2. 再用 query_defect_item_breakdown 锁定主导异常类别
3. 分支策略:
   - 磁物类 → 补充 query_equipment_event_timeline
   - ICP类 → 设备线索可跳过
   - 其他 → 走平衡路径
4. 将事实交给 run_quality_playbook 输出可信判断
5. 用 build_quality_report 生成结构化报告
```

### 3.3 前端品质工作台的调整（Tony观点）

**现有前端（七步法）不变，新增"AI分析报告"视图**。

**最小改动方案**：

现有场景列表的每个场景卡片上，增加一个"AI分析"按钮：

```
┌──────────────────────────────────────┐
│ 场景卡片                            │
│ ┌─ 在线一次交验合格率管控 ─────────┐ │
│ │ 步骤: 问题定义 → 分析 → ...     │ │
│ │                                  │ │
│ │ [进入七步法]  [🤖 AI分析]        │ │
│ └──────────────────────────────────┘ │
└──────────────────────────────────────┘
```

点击"AI分析"后：
1. BFF创建一个 `agent_task`，生成 `traceId`
2. BFF调用OpenClaw Skill异步执行
3. 前端轮询任务状态（现有 `GET /analysis/{inst_id}` 模式可复用）
4. 任务完成后，前端用 `StructuredReport` Schema渲染报告

**新增报告渲染组件**（参考Hermes前端设计）：

```javascript
// 在现有前端中新增通用报告渲染器
// 组件: AiReportRenderer.vue

<template>
  <div class="ai-report">
    <!-- 报告元信息 -->
    <div class="report-meta">...</div>
    
    <!-- 报告区块渲染器 -->
    <div v-for="section in report.sections" :key="section.id">
      <h2>{{ section.title }}</h2>
      <div v-for="block in section.blocks" :key="block.id">
        <!-- 根据block.type渲染不同组件 -->
        <KpiCards v-if="block.type === 'kpi_cards'" :items="block.items" />
        <ChartBlock v-if="block.type === 'chart'" :data="block.data" ... />
        <TableBlock v-if="block.type === 'table'" :columns="block.columns" :rows="block.rows" />
        <InsightList v-if="block.type === 'insight_list'" :items="block.items" />
        <MarkdownBlock v-if="block.type === 'markdown'" :content="block.markdown" />
      </div>
    </div>
    
    <!-- 审计轨迹（折叠） -->
    <details class="audit-trail">
      <summary>审计轨迹</summary>
      <div v-for="entry in report.auditTrail" :key="entry.service + entry.action">
        {{ entry.service }} → {{ entry.action }} ({{ entry.status }})
      </div>
    </details>
  </div>
</template>
```

**现有七步法流程保持不动**，新功能是"并行入口"：
- "七步法"：现有手动分析流程，适合深度定制分析
- "AI分析"：一键生成结构化报告，适合日常监控和快速诊断

---

## 四、MVP方案：最小可行性版本

### 4.1 只做最必要的4个模块

```
M1 ── 8890 API扩展（受控查询）
       ├── 新增 /api/v1/xiyi/metrics/query
       ├── 注册第一个指标 fpyr_daily
       ├── 写入 metric_query_audit 审计日志
       └── SQL模板hardcode（不开放自由查询）

M2 ── Playbook Service（规则引擎）
       ├── 新增API: POST /api/v1/xiyi/playbooks/execute
       ├── 阈值配置存 rule_config 表
       ├── FPY阈值判断 + 异常分类 + 设备线索判断
       └── 写入 tool_call 审计日志

M3 ── OpenClaw Skill
       ├── 编写 SKILL.md: quality_first_pass_yield
       ├── 定义5个Tool（通过OpenClaw的Tool机制）
       ├── 分支路由逻辑（磁物→设备 / ICP→来料）
       └── 结构化报告Prompt模板

M4 ── 前端新增"AI分析"入口
       ├── 场景页面增加"AI分析"按钮
       ├── 新增 AiReportRenderer 组件
       ├── 支持kpi_cards / chart / table / insight_list渲染
       └── 审计轨迹折叠展示
```

**不做（MVP范围外）**：
- ❌ 多场景并行（先只做QUAL_01一个场景）
- ❌ PDF导出（后续扩展）
- ❌ 实时通知/预警（Phase2考虑）
- ❌ 复杂的模型路由策略（先用deepseek统一处理）
- ❌ 知识库RAG集成（有就用，但没有也不阻塞MVP）

### 4.2 工作量评估

| 模块 | 文件/组件 | 估计代码行数 | 难度 |
|------|----------|------------|------|
| **M1: 8890 API扩展** | | | |
| | 新增 metrics/query 端点 | 180行 | ★★ |
| | fpyr_daily SQL模板 | 50行 | ★★ |
| | defect_breakdown SQL模板 | 60行 | ★★ |
| | audit_log写入 | 40行 | ★ |
| | M1小计 | **~330行** | |
| **M2: Playbook Service** | | | |
| | Flask最小服务骨架 | 60行 | ★ |
| | FPyr阈值判断逻辑 | 80行 | ★★ |
| | 异常分类 + 设备线索逻辑 | 90行 | ★★ |
| | rule_config读取 | 30行 | ★ |
| | 审计写入 | 30行 | ★ |
| | M2小计 | **~290行** | |
| **M3: OpenClaw Skill** | | | |
| | SKILL.md编写 | 120行 | ★★ |
| | Tool定义 (5个工具) | 150行 | ★★★ |
| | 分支路由Prompt | 50行 | ★★ |
| | 报告模板Prompt | 80行 | ★★ |
| | M3小计 | **~400行** | |
| **M4: 前端新增** | | | |
| | AiReportRenderer组件 | 200行 | ★★ |
| | 场景页面"AI分析"入口 | 50行 | ★ |
| | 前端API调用 | 30行 | ★ |
| | M4小计 | **~280行** | |
| **新增数据库表** | | | |
| | agent_task / agent_tool_call / agent_report | 3个DDL | ★ |
| | 小计 | ~50行 | |
| **总计** | | **~1350行** | |

**总计：约1300-1400行代码**，按1人天200-300行效率估算，**约5-7人天**。

### 4.3 风险点和依赖

| 风险 | 等级 | 说明 | 缓解措施 |
|------|------|------|---------|
| **R1: 现有8890 API的数据质量** | 🔴 | `ds_mock_data` 的fpy数据可能与真实业务有偏差；Hermes POC用的MES模拟表与现有平台数据结构不同 | 先验证 `dg_indicator_snapshot` 数据是否足够支撑fpyr_daily指标 |
| **R2: OpenClaw Tool定义的"泥巴路"** | 🟡 | 在OpenClaw中定义Tool（白名单、HTTP调用、审计）没有现成模板，需要探索 | 参考 `Claude Code Skill` 的实现模式，先写1个Tool验证 |
| **R3: 前端报告渲染组件的"Schema适配"** | 🟡 | Hermes的StructuredReport Schema有10种block类型，MVP只需要4种 | 先实现kpi_cards / chart / table / insight_list，markdown / chart等后续加 |
| **R4: 独立Git仓库维护** | 🟢 | 用户要求不与股票系统冲突 | 现有Hermes POC已在独立目录，新增智能体层代码放在现有ximi-clawai-demo仓库 |
| **R5: OpenClaw Skill执行超时** | 🟡 | deepseek模型执行多个Tool调用可能超时（尤其是分支决策需要模型推理） | 设置合理的超时时间，Tool调用之间加状态检测 |
| **R6: 权限与安全** | 🟡 | 当前8890 API无鉴权，新增受控查询端点可能被滥用 | MVP阶段先加简单的API Key或IP白名单，生产用JWT |

### 4.4 实施建议

**阶段划分**：

```
Week 1: M1 + 数据库表DDL
  - 创建 agent_task / agent_tool_call / agent_report 三张表
  - 8890 API新增 /metrics/query 端点，先实现fpyr_daily
  - 验证 ds_mock_data 数据能否支撑指标查询

Week 2: M2 + M3
  - Python Playbook Service (最小版本)
  - OpenClaw Skill: quality_first_pass_yield
  - 打通整条链路: BFF → Skill → 语义层 → 规则引擎 → 报告
  - 在前端新建页面做全链路联调

Week 3: M4 + 联调 + 验收
  - 前端"AI分析"入口 + 报告渲染器
  - 端到端联调
  - 撰写使用文档
```

---

## 五、总结

**核心结论**：
1. Hermes最有价值的三个设计是"三层受控"、"白名单+全链路审计"、"结构化报告协议"——这些可以用OpenClaw生态+Python/Flask实现，不需要TypeScript/Node.js
2. 现有8890 Flask API可以扩展受控查询端点，复用 `dg_indicator_atom` 作为指标注册中心
3. 规则引擎（Playbook）作为独立Python服务部署，OpenClaw Skill负责编排调用
4. 现有前端七步法流程不动，新增"AI分析"并行入口

**MVP只需要4个模块、约1300行代码、5-7人天**：
- M1: 8890 API受控查询扩展
- M2: Playbook Service规则引擎
- M3: OpenClaw Skill定义
- M4: 前端"AI分析"入口

**最大风险**是现有 `ds_mock_data` 数据结构与Hermes POC所用MES模拟表不同，建议先花1天做数据验证再启动全量开发。
