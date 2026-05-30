# 1. 首个 Demo 语义层指标草案

## 1.1 目标

沉淀“在线一次校验合格率管控”场景第一批语义层指标定义，用于统一 `metricKey`、业务含义、可能来源表、输出字段和使用方式。

## 1.2 说明

- 本文档是首版草案，依据当前场景设计和提供的数据库表截图整理。
- 这里的 `metricKey` 不是数据库表名，而是语义层对外暴露的标准业务查询能力标识。
- 上层系统只应使用 `metricKey` 发起查询，不直接依赖底层表名和字段名。

## 1.3 首批指标清单

### 1.3.1 `fpyr_daily`

- 中文名称：日一次校验合格率
- 业务含义：按日统计一次校验合格率趋势，作为总览和异常识别的核心指标。
- 主要用途：
  - 展示日/周趋势
  - 判断是否触发异常
  - 作为后续归因分析入口
- 可能来源表：
  - `tsh_pro_stock_record`
  - `tdmmm`（物料主档表，名称待确认）
- 关键字段：
  - `tsh_pro_stock_record.mat_no`
  - `tsh_pro_stock_record.stock_chng_time`
  - `tdmmm.pch_judge_code`
- 主要过滤条件：
  - `stock_oper_order = "ZKI"`
  - 时间范围
  - 组织 / 工厂 / 车间
- 输出字段建议：
  - `date`
  - `totalBatchCount`
  - `qualifiedBatchCount`
  - `defectBatchCount`
  - `fpyr`
- 单位/口径说明：
  - 以批次口径计算，不按重量口径计算
  - `pch_judge_code = S` 视为合格
  - `pch_judge_code in (A, B, F)` 视为不合格
  - `pch_judge_code = N` 从分母中排除

### 1.3.2 `defect_batch_count`

- 中文名称：不合格批次数
- 业务含义：统计指定时间范围内不合格批次的数量，可按日或周期聚合。
- 主要用途：
  - 判断异常规模
  - 与合格率趋势交叉验证
  - 支撑 KPI 卡片展示
- 可能来源表：
  - `tsh_pro_stock_record`
  - `tdmmm`
- 关键字段：
  - `tsh_pro_stock_record.mat_no`
  - `tsh_pro_stock_record.stock_chng_time`
  - `tdmmm.pch_judge_code`
- 主要过滤条件：
  - `stock_oper_order = "ZKI"`
  - 时间范围
  - 工厂 / 车间
  - 不合格判定值
- 输出字段建议：
  - `date`
  - `defectBatchCount`
- 单位/口径说明：
  - 以批次为单位，不是重量口径

### 1.3.3 `defect_item_breakdown`

- 中文名称：不合格项目结构分布
- 业务含义：按检验项目或检验项目类别统计不合格分布。
- 主要用途：
  - 识别主导异常类别
  - 决定后续走哪条分析路径
  - 支撑饼图、表格和结论区块
- 可能来源表：
  - `tqmtq_entrust_result`（委托结果表，名称待确认）
  - `tdmmm`
- 关键字段：
  - `entr_no`
  - `sample_no`
  - `item_code`
  - `item_name`
  - `act_result_value`
- 主要过滤条件：
  - 时间范围
  - 委托号 / 批次号
  - 不合格项目判定条件
- 输出字段建议：
  - `itemCategory`
  - `itemName`
  - `count`
  - `ratio`
- 单位/口径说明：
  - 可按项目明细或项目类别两种粒度输出

### 1.3.4 `mix_weight_by_batch`

- 中文名称：批次混料重量
- 业务含义：统计某批次对应的混料重量，用于异常解释和原料/批次关联分析。
- 主要用途：
  - 判断混料是否影响批次结果
  - 支撑原料/批次关联分析
- 可能来源表：
  - `tqmtj_deal_mat_info`
  - `tsh_pro_stock_record`
- 关键字段：
  - `tqmtj_deal_mat_info.mat_no_to`
  - `tqmtj_deal_mat_info.mix_wt`
  - `tsh_pro_stock_record.mat_no`
- 主要过滤条件：
  - 批次号
  - 时间范围
- 输出字段建议：
  - `batchId`
  - `mixWeight`
- 单位/口径说明：
  - 混料重量为空时按 `0` 处理
  - 当前默认不直接参与一次校验合格率主公式

### 1.3.5 `equipment_event_timeline`

- 中文名称：设备事件时间线
- 业务含义：输出与合格率分析相关的设备故障、维修、保养事件时间序列。
- 主要用途：
  - 判断设备是否可能是异常原因
  - 支撑时间对照分析
  - 形成关联分析区块
- 可能来源表：
  - `teq_repair_manage`
- 关键字段：
  - `affiliated_unit`
  - `fault_desc`
  - `fault_time`
  - `repair_status`
  - `fault_grade`
- 主要过滤条件：
  - 时间范围
  - 所属机组 / 车间
- 输出字段建议：
  - `eventTime`
  - `unit`
  - `eventType`
  - `faultDesc`
  - `faultGrade`
  - `repairStatus`
- 单位/口径说明：
  - 输出时间线事实，不直接给出原因判断

## 1.4 指标与后续模块关系

- `SemanticAPI`：负责实现这些 `metricKey` 的受控查询。
- `PlaybookEngine`：消费这些指标结果，形成结构化结论。
- `OpenClaw`：调用对应工具并决定下一步分析路径。
- `ReportService`：把指标结果组织进 `StructuredReport`。
- `Web`：只消费报告，不直接调用这些底层指标。

## 1.5 当前已确认业务口径

- 一次校验合格率按批次数统计，不按重量统计。
- `mat_no` 作为批次唯一关联键。
- `stock_oper_order` 过滤条件固定为 `ZKI`。
- 判定值含义：
  - `N`：未判定
  - `S`：合格
  - `F`：不合格
  - `A`：内控合，规格不合
  - `B`：内控不合，规格合
- `A/B/F` 均按不合格处理。
- `N` 从一次校验合格率统计分母中排除。

## 1.6 后续补充建议

- 补充每个 `metricKey` 的正式 SQL/查询模板来源。
- 补充字段映射表，把业务字段映射到底层数据库字段。
- 补充输出样例 JSON，方便前后端和规则引擎联调。
- 待表名和字段名完全确认后，再从“草案”升级为正式指标字典。
