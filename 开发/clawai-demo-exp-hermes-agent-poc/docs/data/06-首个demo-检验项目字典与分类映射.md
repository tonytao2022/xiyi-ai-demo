# 1. 首个 Demo 检验项目字典与分类映射

## 1.1 目标

说明检验项目主数据字典的结构、与委托结果表的关联方式，以及「磁物类 / ICP类 / 粒度类 / 其他类」等业务分类如何落地，支撑 `defect_item_breakdown` 与模拟数据生成。

## 1.2 字典表结构（基于当前截图）

表形态为系统字典表，所有检验项目行共享同一字典类型：

- `dict_type`：固定为 `qm_test_type`，表示检验项目类型字典。

典型字段含义：

| 字段 | 含义 |
| --- | --- |
| `dict_code` | 项目编码，如 `941001`、`941002` |
| `dict_sort` | 排序号，**存在重复，不宜作为分组键** |
| `dict_label` | 检验项目中文名称，如「密度」「磁性物质」「ICP」 |
| `dict_value` | 内部值，如 `LAB01`、`LAB02` |
| `dict_type` | 字典类型，本场景为 `qm_test_type` |
| 其他 | `status`、`create_by`、`create_time` 等元数据 |

**结论**：字典表只定义「有哪些检验项目」，**不包含**「磁物类 / ICP类 / 粒度类」等业务分组列，分组必须另建映射。

## 1.3 与 `tqmtq_entrust_result` 的关联（待最终确认）

委托结果表中常见字段：

- `item_code`：检验项目编码
- `item_name`：检验项目名称

**建议优先向数据同事确认**：

- `item_code` 是否与字典表 `dict_code` 一致；或
- 是否与 `dict_value`（`LABxx`）一致；或
- 是否存在第三张映射表。

语义层实现时，应以**实际库表关联**为准；本文档在关联未定时，可同时支持「按 `dict_code`」与「按 `dict_label` / `item_name`」两条降级路径做模拟。

## 1.4 业务分类落地方式（推荐顺序）

### 1.4.1 正式环境推荐

新增或使用配置表 / 配置文件，维护显式映射：

- `dict_code` 或 `item_code` → `item_category`

类别枚举建议与场景文档一致：

- `磁物类`
- `ICP类`
- `粒度类`
- `其他类`

### 1.4.2 模拟 Demo 可采用的降级规则（非业务最终口径）

在业务未提供完整映射表前，语义层或 mock 数据生成可用**关键词规则**做临时归类，便于跑通报告与图表：

| 类别 | 匹配规则（`dict_label` 或 `item_name` 包含） |
| --- | --- |
| 磁物类 | `磁`、`磁性` |
| ICP类 | `ICP`、`AAS`、元素相关命名（需业务后续校准） |
| 粒度类 | `粒度`、`筛分`、`D50`、`粒径` |
| 其他类 | 未命中上述规则的项目 |

**说明**：该规则仅用于 demo 与联调，**上线前必须以业务提供的映射表替换**。

## 1.5 模拟数据建议

生成模拟 `tqmtq_entrust_result` 时建议：

1. `item_code` / `item_name` 尽量从真实字典中抽取若干条，或按 `dict_code` + `dict_label` 造数。
2. 同时生成或引用一份 `item_code → item_category` 映射（可先按 1.4.2 关键词规则生成，再交给业务修订）。
3. `defect_item_breakdown` 聚合维度优先使用 `item_category`，明细下钻使用 `item_name`。

## 1.6 与 `metricKey` 的对应关系

- `defect_item_breakdown`：依赖本节映射，将检验项目行聚合到 `itemCategory`。
- 规则引擎分支（如磁物类走原料、ICP 走过程等）：同样依赖 `item_category`，不宜写死在模型里。

## 1.7 后续待办

- [ ] 确认 `tqmtq_entrust_result.item_code` 与字典表 `dict_code` / `dict_value` 的对应关系
- [ ] 业务提供或确认完整「项目 → 类别」映射表
- [ ] 用正式映射替换 demo 关键词降级规则
