import type { StructuredReport } from "@ce-demo/report-schema";

export function buildMockReport(
  traceId: string,
  input: Record<string, unknown>
): StructuredReport {
  const now = new Date();
  const fmt = (d: Date) => d.toISOString();

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - 6 + i);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  });

  const yieldTrend = [92.3, 91.1, 89.5, 87.8, 89.2, 88.4, 88.2];

  return {
    reportMeta: {
      reportId: `rpt-fpyr-${Date.now()}`,
      traceId,
      tenantId: (input.tenantId as string) ?? "tenant-demo",
      orgId: (input.orgId as string) ?? "org-demo",
      siteId: (input.siteId as string) ?? "site-A01",
      analysisType: "first_pass_yield_monitoring",
      generatedAt: fmt(now),
      reportTemplateVersion: "fpyr-demo-v1",
      playbookVersion: "quality-fpyr-v1",
    },
    summary: {
      title: "一次校验合格率管控分析报告",
      subtitle: `分析周期：${dates[0]} ~ ${dates[6]}  · A01 生产车间`,
      headline:
        "本周一次校验合格率为 88.2%，较上周下降 4.1 个百分点，磁物类不合格项目占比最高（45.5%），与原料批次 RAW-2026-0327 高度关联，建议优先排查该批次来料质量。",
      keyFindings: [
        "一次校验合格率本周累计 88.2%，环比下降 4.1pp，低于目标值 92%",
        "磁物类不合格项目本周占比 45.5%，较上周上升 12.3pp，为主要不合格类别",
        "原料批次 RAW-2026-0327 不合格率高达 18.6%，显著高于同期其他批次",
        "3 月 28 日设备保养后合格率短暂回升至 89.2%，但此后仍持续低于目标值，设备因素非主因",
      ],
    },
    sections: [
      {
        id: "section-overview",
        title: "总览",
        description: "本周一次校验合格率整体趋势与核心指标",
        blocks: [
          {
            id: "kpi-overview",
            type: "kpi_cards",
            title: "核心指标",
            items: [
              {
                key: "fpyr",
                label: "一次校验合格率",
                value: "88.2%",
                trend: "down",
              },
              {
                key: "defect_batches",
                label: "不合格批次数",
                value: 23,
                unit: "批",
                trend: "up",
              },
              {
                key: "defect_items",
                label: "检验项目异常数",
                value: 156,
                unit: "条",
                trend: "up",
              },
              {
                key: "vs_last_week",
                label: "环比上周",
                value: "-4.1pp",
                trend: "down",
              },
            ],
            source: "rule",
            sourceRefs: ["ref-fpyr-metric"],
          },
          {
            id: "chart-daily-trend",
            type: "chart",
            title: "日一次校验合格率趋势（%）",
            chartType: "line",
            data: dates.map((date, i) => ({
              date,
              yield: yieldTrend[i],
              target: 92,
            })),
            xField: "date",
            yField: "yield",
            metricDefinitions: ["fpyr_daily"],
            source: "rule",
            sourceRefs: ["ref-fpyr-metric"],
          },
        ],
      },
      {
        id: "section-defect-breakdown",
        title: "异常分布",
        description: "不合格检验项目分类统计与批次分布",
        blocks: [
          {
            id: "chart-defect-pie",
            type: "chart",
            title: "不合格检验项目类别分布",
            chartType: "pie",
            data: [
              { category: "磁物类", count: 71 },
              { category: "ICP类", count: 47 },
              { category: "粒度类", count: 38 },
            ],
            xField: "category",
            yField: "count",
            metricDefinitions: ["defect_category_count"],
            source: "rule",
            sourceRefs: ["ref-defect-metric"],
          },
          {
            id: "table-defect-breakdown",
            type: "table",
            title: "各类不合格项目明细",
            columns: [
              { key: "category", label: "不合格类别" },
              { key: "count", label: "本周不合格数" },
              { key: "ratio", label: "占比" },
              { key: "vsLastWeek", label: "较上周" },
              { key: "status", label: "状态" },
            ],
            rows: [
              {
                category: "磁物类",
                count: 71,
                ratio: "45.5%",
                vsLastWeek: "+12.3pp",
                status: "异常升高",
              },
              {
                category: "ICP类",
                count: 47,
                ratio: "30.1%",
                vsLastWeek: "-2.1pp",
                status: "基本稳定",
              },
              {
                category: "粒度类",
                count: 38,
                ratio: "24.4%",
                vsLastWeek: "-10.2pp",
                status: "好转",
              },
            ],
            source: "rule",
            sourceRefs: ["ref-defect-metric"],
          },
        ],
      },
      {
        id: "section-correlation",
        title: "关联分析",
        description: "原料批次、ICP 指标与设备维保事件的关联分析",
        blocks: [
          {
            id: "table-batch-correlation",
            type: "table",
            title: "原料批次与不合格率关联",
            columns: [
              { key: "batchId", label: "原料批次" },
              { key: "materialCode", label: "物料编码" },
              { key: "supplier", label: "供应商" },
              { key: "defectRate", label: "关联不合格率" },
              { key: "mainDefect", label: "主要不合格类别" },
              { key: "risk", label: "风险等级" },
            ],
            rows: [
              {
                batchId: "RAW-2026-0327",
                materialCode: "MAT-Fe-001",
                supplier: "供应商A",
                defectRate: "18.6%",
                mainDefect: "磁物类",
                risk: "高",
              },
              {
                batchId: "RAW-2026-0325",
                materialCode: "MAT-Fe-001",
                supplier: "供应商A",
                defectRate: "9.2%",
                mainDefect: "ICP类",
                risk: "中",
              },
              {
                batchId: "RAW-2026-0322",
                materialCode: "MAT-Fe-002",
                supplier: "供应商B",
                defectRate: "4.8%",
                mainDefect: "粒度类",
                risk: "低",
              },
              {
                batchId: "RAW-2026-0320",
                materialCode: "MAT-Fe-002",
                supplier: "供应商B",
                defectRate: "3.1%",
                mainDefect: "ICP类",
                risk: "低",
              },
            ],
            source: "hybrid",
            sourceRefs: ["ref-batch-metric", "ref-defect-metric"],
          },
          {
            id: "chart-equipment-bar",
            type: "chart",
            title: "日合格率与设备事件对照（%）",
            chartType: "bar",
            data: dates.map((date, i) => ({
              date,
              yield: yieldTrend[i],
              event:
                i === 3 ? "设备告警" : i === 4 ? "保养完成" : null,
            })),
            xField: "date",
            yField: "yield",
            metricDefinitions: ["fpyr_daily", "equipment_event"],
            source: "hybrid",
            sourceRefs: ["ref-fpyr-metric", "ref-equipment-metric"],
          },
        ],
      },
      {
        id: "section-conclusions",
        title: "结论与建议",
        description: "基于规则引擎的诊断结论与改进建议",
        blocks: [
          {
            id: "insights-main",
            type: "insight_list",
            title: "诊断结论",
            items: [
              {
                id: "insight-1",
                content:
                  "磁物类不合格率本周异常升高（占比 45.5%），与原料批次 RAW-2026-0327 高度关联（该批次关联不合格率 18.6%）。建议对该批次原料的磁物指标进行复检，并联系供应商A核查近期来料质量记录。",
                source: "rule",
                sourceRefs: ["ref-batch-metric", "ref-defect-metric"],
              },
              {
                id: "insight-2",
                content:
                  "3 月 28 日设备保养后合格率短暂回升至 89.2%，但此后仍持续低于目标值（92%），说明设备状态不是本次合格率持续下降的主因，原料质量问题为更可能的根因方向。",
                source: "rule",
                sourceRefs: ["ref-equipment-metric", "ref-fpyr-metric"],
              },
              {
                id: "insight-3",
                content:
                  "建议立即暂停使用批次 RAW-2026-0327 原料，待复检合格后再恢复投料，同时对已使用该批次原料生产的在制品进行抽检复核。",
                source: "hybrid",
                sourceRefs: ["ref-batch-metric"],
              },
              {
                id: "insight-4",
                content:
                  "ICP 类和粒度类不合格项目本周均有改善，建议保持当前工艺参数不变，重点聚焦磁物类问题排查。",
                source: "rule",
                sourceRefs: ["ref-defect-metric"],
              },
            ],
          },
          {
            id: "markdown-methodology",
            type: "markdown",
            title: "分析方法说明",
            markdown: `## 分析方法说明

本报告基于 **一次校验合格率管控 Playbook**（版本 \`quality-fpyr-v1\`）自动生成，分析步骤如下：

1. **数据采集**：从 MOM/MES 中抽取本周一次校验合格率数据及不合格批次明细
2. **异常识别**：与历史基线（92.3%）比较，触发预警阈值（下降 ≥ 2pp）
3. **不合格结构分析**：按检验项目类别统计不合格占比，识别主导类别（磁物类）
4. **根因关联**：针对磁物类主导异常，关联原料批次、供应商、磁物检测指标
5. **设备干扰排除**：关联设备维修保养事件，判断设备因素对本次波动的贡献
6. **结论生成**：规则引擎依据判断树给出定量结论，模型补充解释文字

> 本报告所有定量数字均来源于 MOM/MES 受控查询接口，可通过 \`queryAuditId\` 回溯到具体数据时间戳与查询记录。`,
          },
        ],
      },
    ],
    sourceRefs: [
      {
        refId: "ref-fpyr-metric",
        sourceType: "metric",
        label: "一次校验合格率 (FPYR)",
        traceId,
        queryAuditId: `audit-${traceId}-001`,
      },
      {
        refId: "ref-defect-metric",
        sourceType: "metric",
        label: "不合格检验项目统计",
        traceId,
        queryAuditId: `audit-${traceId}-002`,
      },
      {
        refId: "ref-batch-metric",
        sourceType: "metric",
        label: "原料批次关联查询",
        traceId,
        queryAuditId: `audit-${traceId}-003`,
      },
      {
        refId: "ref-equipment-metric",
        sourceType: "metric",
        label: "设备事件查询",
        traceId,
        queryAuditId: `audit-${traceId}-004`,
      },
    ],
    auditTrail: [
      {
        traceId,
        service: "BFF",
        action: "task_created",
        startedAt: fmt(now),
        finishedAt: fmt(now),
        status: "success",
        summary: "分析任务创建成功，已注入租户上下文与 traceId",
      },
      {
        traceId,
        service: "SemanticAPI",
        action: "query_fpyr_daily",
        startedAt: fmt(now),
        finishedAt: fmt(now),
        status: "success",
        summary: "一次校验合格率日数据查询完成，共 7 天数据，来源 MOM",
      },
      {
        traceId,
        service: "SemanticAPI",
        action: "query_defect_breakdown",
        startedAt: fmt(now),
        finishedAt: fmt(now),
        status: "success",
        summary: "不合格项目分布查询完成，共 156 条记录，来源 MES",
      },
      {
        traceId,
        service: "SemanticAPI",
        action: "query_batch_correlation",
        startedAt: fmt(now),
        finishedAt: fmt(now),
        status: "success",
        summary: "原料批次关联查询完成，共 4 批次，来源 MOM",
      },
      {
        traceId,
        service: "PlaybookEngine",
        action: "run_quality_fpyr_playbook",
        startedAt: fmt(now),
        finishedAt: fmt(now),
        status: "success",
        summary:
          "Playbook quality-fpyr-v1 执行完成，磁物类异常为主要根因，关联批次 RAW-2026-0327",
      },
      {
        traceId,
        service: "ReportService",
        action: "build_report",
        startedAt: fmt(now),
        finishedAt: fmt(now),
        status: "success",
        summary: "结构化报告生成完成，共 4 个章节、10 个区块",
      },
    ],
  };
}
