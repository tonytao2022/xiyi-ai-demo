# OpenClaw Domain Tools

用于注册制造咨询场景下的白名单工具，连接 `OpenClaw` 与领域服务。

这里的插件属于高信任后端代码，负责：

- 固定技能定义
- 白名单工具清单
- 工具到后端服务的调用适配
- 技能执行结果中的工具执行轨迹

## 当前技能

| skillKey | analysisType | 工具白名单 |
|---|---|---|
| `quality_first_pass_yield` | `first_pass_yield_monitoring` | `query_fpyr_daily`, `query_defect_item_breakdown`, `query_equipment_event_timeline`, `run_quality_playbook`, `build_quality_report` |
| `quality_fpyr_trend_brief` | `first_pass_yield_trend_brief` | `query_fpyr_daily`, `run_quality_playbook`, `build_quality_report` |

## 工具说明

### `query_fpyr_daily`
调用 `semantic-api` 查询一次校验合格率日趋势（`metricKey: fpyr_daily`）。

### `query_defect_item_breakdown`
调用 `semantic-api` 查询不合格项目结构分布（`metricKey: defect_item_breakdown`）。趋势简报技能不调用此工具。

### `query_equipment_event_timeline`
调用 `semantic-api` 查询设备事件时间线（`metricKey: equipment_event_timeline`）。趋势简报技能不调用此工具；全量诊断按分支策略可能跳过。

### `run_quality_playbook`
调用 `playbook-engine` 执行规则判断，返回状态等级、关键发现和规则摘要。

### `build_quality_report`
调用 `report-service` 装配结构化报告（`StructuredReport`）。

## 分支编排

- 默认从 `playbook-engine` 的 `GET /rules/branch-routing` 读取分支策略
- 接口不可用或未配置时，使用插件内置降级规则
- 典型策略：`磁物` → 设备时间线优先；`ICP` → 可跳过设备查询；其余 → 通用路径
- 趋势简报技能走固定路径，不进行分支编排

## 约束

- 不暴露原始 SQL
- 不允许任意 HTTP 代理
- 只允许通过语义层、规则引擎、报告服务访问领域能力
