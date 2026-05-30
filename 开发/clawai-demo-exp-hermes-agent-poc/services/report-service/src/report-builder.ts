import type { MetricQueryResult } from "@ce-demo/metric-contract";
import type { StructuredReport } from "@ce-demo/report-schema";

export interface PlaybookResult {
  playbookVersion: string;
  statusLevel: "normal" | "warning" | "critical";
  headline: string;
  keyFindings: string[];
  insights: Array<{
    id: string;
    content: string;
    source: "rule" | "hybrid";
    sourceRefs: string[];
  }>;
  ruleSummary: {
    latestFpyr: number;
    fpyrDelta: number;
    totalDefectBatches: number;
    totalDefectItems: number;
    topDefectCategory?: string;
    topDefectItemName?: string;
    equipmentEventCount: number;
  };
}

export interface BuildReportArgs {
  traceId: string;
  input: Record<string, unknown>;
  fpyrDaily: MetricQueryResult;
  defectBreakdown: MetricQueryResult;
  equipmentTimeline: MetricQueryResult;
  playbookResult: PlaybookResult;
  /** 编排侧名称，用于来源标签（如 Hermes、OpenClaw） */
  orchestratorDisplayName?: string;
}

interface FpyrRow {
  date: string;
  totalBatchCount: number;
  qualifiedBatchCount: number;
  defectBatchCount: number;
  fpyr: number;
}

interface DefectRow {
  itemCategory: string;
  itemName: string;
  count: number;
  ratio: number;
}

interface EquipmentRow {
  eventTime: string;
  unit: string;
  eventType: string;
  faultDesc: string | null;
  faultGrade: string | null;
  repairStatus: string | null;
}

const ORCHESTRATOR_LLM_REFS = ["ref-orchestrator-llm", "ref-openclaw-llm"];
const ORCHESTRATOR_STATUS_REFS = [
  "ref-orchestrator-status",
  "ref-openclaw-status",
];

export function buildReportFromMetrics({
  traceId,
  input,
  fpyrDaily,
  defectBreakdown,
  equipmentTimeline,
  playbookResult,
  orchestratorDisplayName: orchestratorDisplayNameRaw,
}: BuildReportArgs): StructuredReport {
  const orchestratorDisplayName =
    typeof orchestratorDisplayNameRaw === "string" &&
    orchestratorDisplayNameRaw.trim().length > 0
      ? orchestratorDisplayNameRaw.trim()
      : "编排";
  const now = new Date().toISOString();
  const fpyrRows = fpyrDaily.rows as unknown as FpyrRow[];
  const defectRows = defectBreakdown.rows as unknown as DefectRow[];
  const equipmentRows = equipmentTimeline.rows as unknown as EquipmentRow[];

  const analysisType = asString(
    input.analysisType,
    "first_pass_yield_monitoring"
  );
  const isBrief = analysisType === "first_pass_yield_trend_brief";

  const latestFpyr = playbookResult.ruleSummary.latestFpyr;
  const fpyrDelta = playbookResult.ruleSummary.fpyrDelta;
  const totalDefectBatches = playbookResult.ruleSummary.totalDefectBatches;
  const totalDefectItems = playbookResult.ruleSummary.totalDefectItems;
  const reportId = `rpt-fpyr-${Date.now()}`;
  const siteId = asString(input.siteId, "site-A01");
  const orgId = asString(input.orgId, "org-demo");
  const tenantId = asString(input.tenantId, "tenant-demo");
  const timeRange = input.timeRange as
    | { startAt?: string; endAt?: string; timezone?: string }
    | undefined;
  const subtitle = buildSubtitle(timeRange?.startAt, timeRange?.endAt, siteId);

  const overviewBlocks = buildOverviewBlocks(
    fpyrRows,
    latestFpyr,
    fpyrDelta,
    totalDefectBatches,
    totalDefectItems,
    isBrief
  );

  const defectSection = {
    id: "section-defect-breakdown",
    title: "异常分布",
    description: "不合格项目结构与占比",
    blocks: [
      {
        id: "chart-defect-pie",
        type: "chart" as const,
        title: "不合格项目类别分布",
        chartType: "pie" as const,
        data: aggregateDefectCategoryRows(defectRows),
        xField: "category",
        yField: "count",
        metricDefinitions: ["defect_item_breakdown"],
        source: "rule" as const,
        sourceRefs: ["ref-defect-metric"],
      },
      {
        id: "table-defect-breakdown",
        type: "table" as const,
        title: "不合格项目明细",
        columns: [
          { key: "itemCategory", label: "项目类别" },
          { key: "itemName", label: "项目名称" },
          { key: "count", label: "异常次数" },
          { key: "ratio", label: "占比（%）" },
        ],
        rows: defectRows.map((row) => ({
          itemCategory: row.itemCategory,
          itemName: row.itemName,
          count: row.count,
          ratio: row.ratio,
        })),
        source: "rule" as const,
        sourceRefs: ["ref-defect-metric"],
      },
    ],
  };

  const equipmentSection = {
    id: "section-correlation",
    title: "关联分析",
    description: "设备事件辅助线索",
    blocks: [
      {
        id: "table-equipment-events",
        type: "table" as const,
        title: "设备事件时间线",
        columns: [
          { key: "eventTime", label: "事件时间" },
          { key: "unit", label: "机组" },
          { key: "eventType", label: "事件类型" },
          { key: "faultDesc", label: "说明" },
          { key: "faultGrade", label: "等级" },
          { key: "repairStatus", label: "状态" },
        ],
        rows: equipmentRows,
        source: "hybrid" as const,
        sourceRefs: ["ref-equipment-metric"],
      },
    ],
  };

  const conclusionSection = {
    id: "section-conclusions",
    title: "结论与建议",
    description: "基于规则引擎与模型补充信息生成的业务结论",
    blocks: [
      {
        id: "insights-main",
        type: "insight_list" as const,
        title: "诊断结论",
        items: playbookResult.insights.filter(
          (item) =>
            !item.sourceRefs.some((ref) => ORCHESTRATOR_STATUS_REFS.includes(ref))
        ),
      },
    ],
  };

  const executionStatusItems = playbookResult.insights.filter((item) =>
    item.sourceRefs.some((ref) => ORCHESTRATOR_STATUS_REFS.includes(ref))
  );
  const executionStatusSection =
    executionStatusItems.length > 0
      ? {
          id: "section-execution-status",
          title: "执行与数据状态",
          description: "说明本轮外部编排服务执行情况与数据完备性",
          blocks: [
            {
              id: "insights-execution-status",
              type: "insight_list" as const,
              title: "状态说明",
              items: executionStatusItems,
            },
          ],
        }
      : null;

  const sections = isBrief
    ? [
        {
          id: "section-overview",
          title: "总览",
          description: "一次校验合格率趋势与核心指标（简报）",
          blocks: overviewBlocks,
        },
        ...(executionStatusSection ? [executionStatusSection] : []),
        conclusionSection,
      ]
    : [
        {
          id: "section-overview",
          title: "总览",
          description: "一次校验合格率趋势与核心指标",
          blocks: overviewBlocks,
        },
        ...(executionStatusSection ? [executionStatusSection] : []),
        defectSection,
        equipmentSection,
        conclusionSection,
      ];

  const sourceRefs: StructuredReport["sourceRefs"] = isBrief
    ? [
        {
          refId: "ref-fpyr-metric",
          sourceType: "metric" as const,
          label: "一次校验合格率趋势",
          traceId,
          queryAuditId: fpyrDaily.queryAuditId,
        },
      ]
    : [
        {
          refId: "ref-fpyr-metric",
          sourceType: "metric" as const,
          label: "一次校验合格率趋势",
          traceId,
          queryAuditId: fpyrDaily.queryAuditId,
        },
        {
          refId: "ref-defect-metric",
          sourceType: "metric" as const,
          label: "不合格项目结构分布",
          traceId,
          queryAuditId: defectBreakdown.queryAuditId,
        },
        {
          refId: "ref-equipment-metric",
          sourceType: "metric" as const,
          label: "设备事件时间线",
          traceId,
          queryAuditId: equipmentTimeline.queryAuditId,
        },
      ];
  const hasOrchestratorLlmRefs = playbookResult.insights.some((insight) =>
    insight.sourceRefs.some((ref) => ORCHESTRATOR_LLM_REFS.includes(ref))
  );
  if (hasOrchestratorLlmRefs) {
    sourceRefs.push({
      refId: "ref-orchestrator-llm",
      sourceType: "document",
      label: `${orchestratorDisplayName} 模型补充结论`,
      traceId,
    });
  }
  const hasOrchestratorStatusRefs = playbookResult.insights.some((insight) =>
    insight.sourceRefs.some((ref) => ORCHESTRATOR_STATUS_REFS.includes(ref))
  );
  if (hasOrchestratorStatusRefs) {
    sourceRefs.push({
      refId: "ref-orchestrator-status",
      sourceType: "document",
      label: `${orchestratorDisplayName} 执行与数据状态`,
      traceId,
    });
  }

  const auditTrail = isBrief
    ? [
        {
          traceId,
          service: "BFF",
          action: "task_created",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: "分析任务创建成功",
        },
        {
          traceId,
          service: "SemanticAPI",
          action: "query_fpyr_daily",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: `简报模式：合格率趋势查询完成，共 ${fpyrRows.length} 个时间点`,
        },
        {
          traceId,
          service: "ReportService",
          action: "build_report",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: "简报结构化报告生成完成",
        },
        {
          traceId,
          service: "PlaybookEngine",
          action: "run_quality_playbook",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: `Playbook（简报）输出完成，状态等级 ${playbookResult.statusLevel}`,
        },
      ]
    : [
        {
          traceId,
          service: "BFF",
          action: "task_created",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: "分析任务创建成功",
        },
        {
          traceId,
          service: "SemanticAPI",
          action: "query_fpyr_daily",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: `合格率趋势查询完成，共 ${fpyrRows.length} 个时间点`,
        },
        {
          traceId,
          service: "SemanticAPI",
          action: "query_defect_item_breakdown",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: `不合格项目结构查询完成，共 ${defectRows.length} 条记录`,
        },
        {
          traceId,
          service: "SemanticAPI",
          action: "query_equipment_event_timeline",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: `设备事件查询完成，共 ${equipmentRows.length} 条记录`,
        },
        {
          traceId,
          service: "ReportService",
          action: "build_report",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: "结构化报告生成完成",
        },
        {
          traceId,
          service: "PlaybookEngine",
          action: "run_quality_playbook",
          startedAt: now,
          finishedAt: now,
          status: "success" as const,
          summary: `Playbook 输出完成，状态等级 ${playbookResult.statusLevel}`,
        },
      ];

  return {
    reportMeta: {
      reportId,
      traceId,
      tenantId,
      orgId,
      siteId,
      analysisType,
      generatedAt: now,
      reportTemplateVersion: asString(
        input.reportTemplateVersion,
        isBrief ? "fpyr-demo-brief-v1" : "fpyr-demo-v1"
      ),
      playbookVersion: playbookResult.playbookVersion,
    },
    summary: {
      title: isBrief
        ? "一次校验合格率趋势简报"
        : "一次校验合格率管控分析报告",
      subtitle,
      headline: playbookResult.headline,
      keyFindings: playbookResult.keyFindings,
    },
    sections: sections as StructuredReport["sections"],
    sourceRefs,
    auditTrail,
  };
}

function buildOverviewBlocks(
  fpyrRows: FpyrRow[],
  latestFpyr: number,
  fpyrDelta: number,
  totalDefectBatches: number,
  totalDefectItems: number,
  isBrief: boolean
) {
  const kpiItems = isBrief
    ? [
        {
          key: "fpyr",
          label: "最新一次校验合格率",
          value: latestFpyr,
          unit: "%",
          trend: getTrend(fpyrDelta, true),
        },
        {
          key: "fpyr_delta",
          label: "较上一统计点",
          value: `${fpyrDelta >= 0 ? "+" : ""}${fpyrDelta}pp`,
          trend: getTrend(fpyrDelta, true),
        },
      ]
    : [
      {
        key: "fpyr",
        label: "最新一次校验合格率",
        value: latestFpyr,
        unit: "%",
        trend: getTrend(fpyrDelta, true),
      },
      {
        key: "defect_batches",
        label: "不合格批次数",
        value: totalDefectBatches,
        unit: "批",
        trend: totalDefectBatches > 0 ? "up" : "flat",
      },
      {
        key: "defect_items",
        label: "不合格项目数",
        value: totalDefectItems,
        unit: "条",
        trend: totalDefectItems > 0 ? "up" : "flat",
      },
      {
        key: "fpyr_delta",
        label: "较上一统计点",
        value: `${fpyrDelta >= 0 ? "+" : ""}${fpyrDelta}pp`,
        trend: getTrend(fpyrDelta, true),
      },
    ];

  return [
    {
      id: "kpi-overview",
      type: "kpi_cards" as const,
      title: "核心指标",
      items: kpiItems,
      source: "rule" as const,
      sourceRefs: ["ref-fpyr-metric"],
    },
    {
      id: "chart-daily-trend",
      type: "chart" as const,
      title: "日一次校验合格率趋势（%）",
      chartType: "line" as const,
      data: fpyrRows.map((row) => ({
        date: row.date,
        fpyr: row.fpyr,
        target: 92,
      })),
      xField: "date",
      yField: "fpyr",
      metricDefinitions: ["fpyr_daily"],
      source: "rule" as const,
      sourceRefs: ["ref-fpyr-metric"],
    },
  ];
}

function aggregateDefectCategoryRows(defectRows: DefectRow[]) {
  const categoryMap = new Map<string, number>();
  for (const row of defectRows) {
    categoryMap.set(
      row.itemCategory,
      (categoryMap.get(row.itemCategory) ?? 0) + row.count
    );
  }

  return Array.from(categoryMap.entries()).map(([category, count]) => ({
    category,
    count,
  }));
}

function buildSubtitle(
  startAt: string | undefined,
  endAt: string | undefined,
  siteId: string
) {
  if (!startAt || !endAt) {
    return `站点：${siteId}`;
  }

  return `分析周期：${startAt} ~ ${endAt} · 站点：${siteId}`;
}

function getTrend(delta: number, inverse = false) {
  if (delta === 0) {
    return "flat";
  }

  if (inverse) {
    return delta > 0 ? "up" : "down";
  }

  return delta > 0 ? "down" : "up";
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}
