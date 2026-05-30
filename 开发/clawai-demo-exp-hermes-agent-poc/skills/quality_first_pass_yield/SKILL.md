---
name: quality-first-pass-yield
description: 面向品质专员的一次校验合格率全量监控与异常诊断技能，覆盖趋势、异常结构、设备线索和规则结论整合。
version: 1.1.0
metadata: {"openclaw":{"skillKey":"quality_first_pass_yield","analysisType":"first_pass_yield_monitoring","emoji":"📊"}}
---

# 制造质量 · 一次校验合格率深度诊断

## 适用问题

- 当前周期一次校验合格率是否低于目标阈值。
- 主导异常类别和重点异常项目是什么。
- 设备事件是否与异常周期存在辅助关联。
- 当前最值得优先执行的纠偏动作是什么。

## 目标读者

- 品质专员
- 品管部经理
- 生产异常晨会/周会的组织者

## 必要输入

- `traceId`
- `tenantId`、`orgId`、`siteId`
- `timeRange.startAt`、`timeRange.endAt`、`timeRange.timezone`
- `inputParams.productLine`
- 可选：`inputParams.batchRange`、`inputParams.analysisFocus`

如果缺少上述关键输入，不要自行猜测业务边界；应返回“输入不足，无法执行深度诊断”。

## 允许工具（顺序由编排与规则分支决定）

1. `query_fpyr_daily`
2. `query_defect_item_breakdown`
3. `query_equipment_event_timeline`（按主导异常类别可跳过）
4. `run_quality_playbook`
5. `build_quality_report`

## 标准执行流程

1. 先用 `query_fpyr_daily` 确认最新 FPY、环比变化、是否已触发阈值。
2. 再用 `query_defect_item_breakdown` 锁定主导异常类别与重点项目。
3. 根据事实选择线索路径：
   - 主导类别偏 `磁物类`：优先补充 `query_equipment_event_timeline`
   - 主导类别偏 `ICP类`：设备线索可后置或跳过
   - 其他类别：走平衡路径
4. 将事实交给 `run_quality_playbook` 输出可信判断、状态等级、核心建议。
5. 用 `build_quality_report` 生成结构化报告，不在 Skill 内直接拼 UI 逻辑。

## 决策与证据约束

- 仅使用注册指标与受控 HTTP 工具，禁止原始 SQL、禁止自造口径。
- 请求必须携带 `traceId`，并与下游工具调用保持一致。
- 核心数字、阈值判断、状态等级必须以 `SemanticAPI` 与 `PlaybookEngine` 返回为准。
- 若设备事件为空，应明确写成“当前未发现设备辅助线索”，而不是推断“设备无问题”。
- 若异常类别与设备线索矛盾，应优先保留规则引擎判断，再把矛盾点写入“下一步核查”。

## 产出要求

输出应帮助读者快速回答以下问题：

- 最新一次校验合格率是多少，较上一统计点如何变化。
- 主要异常类别/项目是什么。
- 当前是否存在设备辅助线索。
- 先做什么动作，谁来跟进，优先级如何。

若有模型增强内容，建议补充：

- `riskSignals`：2-3 条风险信号
- `recommendedActions`：2-4 条可执行动作
- `nextQuestions`：1-3 条下一步追问或取证方向

## 禁止事项

- 不得修改或重算 FPY、批次数、不合格项目数等核心数字。
- 不得跳过 `run_quality_playbook` 直接输出业务结论。
- 不得把“缺少证据”说成“已确认根因”。
- 不得调用未在白名单中的工具。

## 完成检查清单

- 是否已有 `traceId`。
- 是否已引用 FPY 趋势事实。
- 是否已识别主导异常类别。
- 若走设备路径，是否明确记录设备线索是否命中。
- 最终结论是否可回溯到规则/指标，而不是纯模型猜测。
