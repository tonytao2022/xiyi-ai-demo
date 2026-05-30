---
name: quality-fpyr-trend-brief
description: 面向管理层与晨会场景的一次校验合格率趋势简报技能，只关注趋势、阈值状态与行动提示。
version: 1.1.0
metadata: {"openclaw":{"skillKey":"quality_fpyr_trend_brief","analysisType":"first_pass_yield_trend_brief","emoji":"📈"}}
---

# 制造质量 · 合格率趋势简报

## 适用问题

- 最近一段时间一次校验合格率走势如何。
- 当前是否进入预警或严重预警。
- 晨会/管理简报应该先强调什么风险。
- 若需要深挖，下一步应切换到哪类分析。

## 目标读者

- 工厂负责人
- 品管经理
- 质量晨会/周会参会人

## 必要输入

- `traceId`
- `tenantId`、`orgId`、`siteId`
- `timeRange.startAt`、`timeRange.endAt`
- 可选：`inputParams.productLine`

## 边界

- 只回答“趋势是否正常 / 预警级别 / 当前建议动作”，不做根因下钻。
- 禁止调用未列出的工具；禁止为“更好看”改写 KPI 与规则结论。
- 如果读者问到“为什么异常”，应建议发起 `quality_first_pass_yield` 深度诊断任务。

## 允许工具

1. `query_fpyr_daily`
2. `run_quality_playbook`（`analysisType` 须为 `first_pass_yield_trend_brief`）
3. `build_quality_report`

## 标准执行流程

1. 用 `query_fpyr_daily` 获取时间序列，确认最新值、环比变化、样本周期。
2. 用 `run_quality_playbook` 基于阈值输出状态等级与简报化结论。
3. 用 `build_quality_report` 输出精简结构化报告，只保留总览与结论建议。

## 表达要求

- 标题与摘要应适合管理层快速浏览，避免过长。
- 关键发现优先回答“是否异常、变化幅度、需不需要关注”。
- 建议动作要可执行，例如“今日班后复核原料批次交接记录”而不是泛泛而谈。
- 下一步追问应聚焦“要不要切到深度诊断、优先看哪条线索”。

## 建议补充字段

- `keyFindings`：3-5 条关键发现
- `riskSignals`：2-3 条风险信号
- `recommendedActions`：2-4 条管理动作
- `nextQuestions`：1-3 条下一步追问

## 禁止

- 不得调用 `query_defect_item_breakdown`、`query_equipment_event_timeline`。
- 不得把“未下钻”描述成“已确认无异常原因”。
- 不得伪造检验项、设备、原料层面的细节。

## 完成检查清单

- 是否明确了当前状态等级。
- 是否说明了与上一统计点相比的变化。
- 是否给出可执行的下一步动作。
- 是否明确提示“若需根因，请切换深度诊断”。
