# 1. 首个 Demo 来源表与字段映射草案

## 1.1 目标

整理“在线一次校验合格率管控”场景当前已识别的来源表、核心字段和用途，作为语义层设计和后续字段映射的基础文档。

## 1.2 说明

- 本文档基于当前截图信息整理，属于草案版。
- 个别表名、字段名和字段含义仍需后续用数据库或原始表结构文本再次确认。
- 本文档重点回答“从哪些表取数、字段大概干什么、在场景里怎么用”。

## 1.3 主表与关联表概览

### 1.3.1 主表：`tsh_pro_stock_record`

- 中文理解：成品库出入库履历
- 在本场景中的作用：
  - 作为一次校验合格率计算的主统计表
  - 提供批次、库存变更时间和统计范围入口
- 当前识别字段：
  - `mat_kind`：物料种类
  - `stock_oper_order`：库操作指示
  - `mat_code`：物料编码
  - `mat_act_wt`：材料实际数量
  - `stock_chng_time`：库存变更时刻
  - `mat_no`：批次号
- 备注：
  - 当前已确认 `stock_oper_order = "ZKI"` 为主统计过滤条件
  - 当前默认 `stock_chng_time` 作为一次校验合格率的统计时间字段
  - 当前已确认 `mat_no` 为批次唯一关联键

### 1.3.2 辅助表：`tqmtj_deal_mat_info`

- 中文理解：处置后物料信息
- 在本场景中的作用：
  - 辅助识别某批次是否存在混料
  - 提供混料重量，用于异常解释和原料/批次关联分析
- 当前识别字段：
  - `mat_no_to`：处置后批次号
  - `mix_wt`：混料重量
- 关联理解：
  - `mat_no_to` 与主表中的 `mat_no` 匹配时，可判定该批次涉及混料

### 1.3.3 设备关联表：`teq_repair_manage`

- 中文理解：设备检修管理
- 在本场景中的作用：
  - 用于把合格率波动与设备故障、维修、保养事件做时间关联
- 当前识别字段：
  - `affiliated_unit`：所属机组
  - `fault_desc`：故障描述
  - `fault_time`：故障发生时间
  - `repair_status`：工单状态
  - `fault_grade`：故障等级

### 1.3.4 工序产出表组

- 当前识别表：
  - `tap_mixing_output`
  - `tap_sinter_output`
  - `tap_powder_output`
  - `tap_combined_output`
  - `tap_package_output`
- 在本场景中的作用：
  - 追踪某批次在不同工序的产出记录
  - 为后续回溯“异常批次经过了哪些工序”提供依据
- 当前识别公共字段：
  - `mat_code`：物料编码
  - `seq_no`：作业计划号
  - `mat_no`：产出批次号
  - `unit_code`：机组编码
  - `mat_wt`：产出重量
  - `prod_time`：生产时间

### 1.3.5 工序投入表组

- 当前识别表：
  - `tap_mixing_input`
  - `tap_sinter_input`
  - `tap_powder_input`
  - `tap_combined_input`
  - `tap_package_input`
- 在本场景中的作用：
  - 追踪某个产出批次对应投入了哪些原料或半成品
  - 为原料批次追溯和异常归因提供依据
- 当前识别公共字段：
  - `seq_no`：作业计划号
  - `mat_code`：物料编码
  - `qdc`：质量锥
  - `real_mat_no`：实际批次号
  - `mat_wt`：重量
  - `feed_time`：投料时间

### 1.3.6 判定主档表：`tdmmm`

- 中文理解：物料主档表
- 在本场景中的作用：
  - 提供批次对应的质量判定结果
  - 是判断“某批次是否合格”的关键判定表
- 当前识别字段：
  - `mat_code`：物料编码
  - `qdc`：质量锥
  - `mat_no`：物料批号
  - `entr_no`：委托号
  - `surf_judge_code`：表面判定结果
  - `pch_judge_code`：性能判定结果
  - `complex_judge_code`：综合判定结果
  - `hold_flag`：封锁标记
- 备注：
  - 当前已确认使用 `pch_judge_code` 作为主判定字段
  - 判定值含义已确认：
    - `N`：未判定
    - `S`：合格
    - `F`：不合格
    - `A`：内控合，规格不合
    - `B`：内控不合，规格合
  - 当前已确认 `A/B/F` 均按不合格处理
  - 当前已确认 `N` 从一次校验合格率统计分母中排除

### 1.3.7 检验结果表：`tqmtq_entrust_result`

- 中文理解：委托结果表
- 在本场景中的作用：
  - 提供具体检验项目结果
  - 用于识别到底是哪几个检验项目导致不合格
- 当前识别字段：
  - `entr_no`：检验委托号
  - `sample_no`：试样号
  - `item_code`：检验项目编码
  - `item_name`：检验项目名称
  - `act_result_value`：实际结果值

### 1.3.8 检验项目字典表（`dict_type = qm_test_type`）

- 中文理解：系统字典中的检验项目主数据（常见为若依风格 `sys_dict_data` 一类表，具体表名以库为准）
- 在本场景中的作用：
  - 定义全量检验项目清单（`dict_code`、`dict_label`、`dict_value` 等）
  - 与 `tqmtq_entrust_result` 的 `item_code` / `item_name` 对齐后，用于展示项目名称与编码一致性
- 当前识别字段（与截图一致）：
  - `dict_code`：项目编码
  - `dict_label`：项目中文名称
  - `dict_value`：内部值（如 `LAB01`）
  - `dict_type`：固定 `qm_test_type`
  - `dict_sort`：排序号（存在重复，**不作为业务分组依据**）
- 重要说明：
  - 字典表**不含**「磁物类 / ICP类 / 粒度类」等业务分类列
  - 分类映射见 `docs/data/06-首个demo-检验项目字典与分类映射.md`

## 1.4 当前可识别的关键关联关系

### 1.4.1 批次主链路

- `tsh_pro_stock_record.mat_no`
- `tdmmm.mat_no`
- `tqmtj_deal_mat_info.mat_no_to`

这条链路主要用于：
- 识别批次
- 获取该批次判定结果
- 判断该批次是否涉及混料

当前默认理解：

- `tsh_pro_stock_record` 是一次校验合格率统计主表
- `tdmmm` 是批次判定主表
- `tqmtj_deal_mat_info` 是混料辅助表

### 1.4.2 委托结果链路

- `tdmmm.entr_no`
- `tqmtq_entrust_result.entr_no`

可选扩展链路（待确认字段对应关系）：

- `tqmtq_entrust_result.item_code` ↔ 检验项目字典表 `dict_code` 或 `dict_value`

这条链路主要用于：
- 从批次判定结果追到具体检验项目结果
- 输出不合格项目结构分布

### 1.4.3 工序追溯链路

- 工序产出表中的 `mat_no`
- 工序投入表中的 `real_mat_no`
- 工序公共字段 `seq_no`

这条链路主要用于：
- 追溯某个异常批次经历的工序
- 找到该批次对应投入过哪些原料和半成品

### 1.4.4 设备时间链路

- `teq_repair_manage.fault_time`
- 主表中的 `stock_chng_time`
- 工序表中的 `prod_time` / `feed_time`

这条链路主要用于：
- 把合格率波动、不合格批次和设备事件放到同一时间线上分析

## 1.5 当前已确认业务事实

- 一次校验合格率按批次数统计，不按重量统计。
- 主统计表默认采用 `tsh_pro_stock_record`。
- 主统计过滤条件固定为 `stock_oper_order = "ZKI"`。
- 主统计时间字段当前默认采用 `stock_chng_time`。
- `mat_no` 作为批次唯一关联键。
- `pch_judge_code` 作为当前主判定字段。
- 判定值处理中：
  - `S` 视为合格
  - `A/B/F` 视为不合格
  - `N` 从分母中排除

## 1.6 建议后续补充

- 补充每张表的正式表名确认结果
- 补充字段类型、主键、索引和是否可为空
- 补充明确的主外键关系
- 补充每张表在语义层中的查询模板编号或用途编号
