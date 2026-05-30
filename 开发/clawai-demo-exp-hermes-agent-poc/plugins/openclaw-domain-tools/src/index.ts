import type { MetricQuery, MetricQueryResult } from "@ce-demo/metric-contract";
import type { StructuredReport } from "@ce-demo/report-schema";

export type SkillKey =
  | "quality_first_pass_yield"
  | "quality_fpyr_trend_brief";

export interface RuntimeRequest {
  traceId: string;
  skillKey: SkillKey;
  analysisType: string;
  input: Record<string, unknown>;
}

export interface RuntimeResponse {
  traceId: string;
  skillKey: SkillKey;
  analysisType: string;
  routingDecision: RoutingDecision;
  toolExecutions: ToolExecution[];
  report: StructuredReport;
}

export interface ToolExecution {
  toolKey: string;
  targetService: string;
  status: "success";
  startedAt: string;
  finishedAt: string;
}

export interface SkillDefinition {
  skillKey: SkillKey;
  analysisType: string;
  toolWhitelist: string[];
}

export interface ServiceEndpoints {
  semanticApiBaseUrl: string;
  playbookEngineBaseUrl: string;
  reportServiceBaseUrl: string;
}

export interface RoutingDecision {
  strategy: "equipment_first" | "material_process_first" | "balanced_general";
  primaryDefectCategory: string;
  reason: string;
  prioritizedToolPath: string[];
  /** 与 `rule_config.openclaw_branch_routing` 对齐时的规则版本，内置降级时为空 */
  branchRuleVersion?: string;
}

interface OrderedBranchRow {
  strategy: string;
  categorySubstrings: string[];
  reason: string;
  skipEquipmentTimeline: boolean;
}

const DEFAULT_BRANCH_ROUTING: {
  ruleVersion: string;
  orderedBranches: OrderedBranchRow[];
} = {
  ruleVersion: "embedded-default",
  orderedBranches: [
    {
      strategy: "equipment_first",
      categorySubstrings: ["磁物"],
      reason: "磁物类异常通常需要优先结合设备事件时间线排查",
      skipEquipmentTimeline: false,
    },
    {
      strategy: "material_process_first",
      categorySubstrings: ["ICP"],
      reason: "ICP类异常优先从来料/工艺方向排查，设备线索可后置",
      skipEquipmentTimeline: true,
    },
    {
      strategy: "balanced_general",
      categorySubstrings: [],
      reason: "未命中特定类别策略，采用通用平衡路径",
      skipEquipmentTimeline: false,
    },
  ],
};

interface PlaybookResult {
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

const QUALITY_FIRST_PASS_YIELD_SKILL: SkillDefinition = {
  skillKey: "quality_first_pass_yield",
  analysisType: "first_pass_yield_monitoring",
  toolWhitelist: [
    "query_fpyr_daily",
    "query_defect_item_breakdown",
    "query_equipment_event_timeline",
    "run_quality_playbook",
    "build_quality_report",
  ],
};

const QUALITY_FPYR_TREND_BRIEF_SKILL: SkillDefinition = {
  skillKey: "quality_fpyr_trend_brief",
  analysisType: "first_pass_yield_trend_brief",
  toolWhitelist: [
    "query_fpyr_daily",
    "run_quality_playbook",
    "build_quality_report",
  ],
};

export function listSkillDefinitions(): SkillDefinition[] {
  return [QUALITY_FIRST_PASS_YIELD_SKILL, QUALITY_FPYR_TREND_BRIEF_SKILL];
}

const SKILL_ANALYSIS_PAIRS: Record<SkillKey, string> = {
  quality_first_pass_yield: "first_pass_yield_monitoring",
  quality_fpyr_trend_brief: "first_pass_yield_trend_brief",
};

export function validateRuntimeRequest(
  request: RuntimeRequest
): asserts request is RuntimeRequest {
  if (!request?.traceId) {
    throw new TypeError("traceId 必填");
  }

  if (!(request.skillKey in SKILL_ANALYSIS_PAIRS)) {
    throw new TypeError(`未知技能: ${String(request.skillKey)}`);
  }

  const expected = SKILL_ANALYSIS_PAIRS[request.skillKey];
  if (request.analysisType !== expected) {
    throw new TypeError(
      `技能 ${request.skillKey} 必须与 analysisType=${expected} 配对`
    );
  }

  if (!request.input || typeof request.input !== "object") {
    throw new TypeError("input 必填");
  }
}

export async function executeSkill(
  request: RuntimeRequest,
  services: ServiceEndpoints
): Promise<RuntimeResponse> {
  if (request.skillKey === "quality_fpyr_trend_brief") {
    return executeQualityFpyrTrendBrief(request, services);
  }

  return executeQualityFirstPassYield(request, services);
}

async function executeQualityFirstPassYield(
  request: RuntimeRequest,
  services: ServiceEndpoints
): Promise<RuntimeResponse> {
  const toolExecutions: ToolExecution[] = [];
  const queries = buildMetricQueries(
    request.traceId,
    request.input,
    request.skillKey
  );

  const [fpyrDaily, defectBreakdown] = await Promise.all([
    runTool(toolExecutions, "query_fpyr_daily", "SemanticAPI", () =>
      querySemanticApi(services.semanticApiBaseUrl, queries.fpyrDaily)
    ),
    runTool(toolExecutions, "query_defect_item_breakdown", "SemanticAPI", () =>
      querySemanticApi(services.semanticApiBaseUrl, queries.defectBreakdown)
    ),
  ]);

  const routingConfig = await fetchBranchRoutingConfig(
    services.playbookEngineBaseUrl,
    request.analysisType
  );
  const routingDecision = buildRoutingDecision(
    defectBreakdown.rows,
    routingConfig
  );
  const equipmentTimeline =
    routingDecision.strategy === "material_process_first"
      ? buildEmptyEquipmentTimelineMetricResult()
      : await runTool(
          toolExecutions,
          "query_equipment_event_timeline",
          "SemanticAPI",
          () =>
            querySemanticApi(
              services.semanticApiBaseUrl,
              queries.equipmentTimeline
            )
        );

  if (routingDecision.strategy === "material_process_first") {
    toolExecutions.push({
      toolKey: "skip_equipment_event_timeline",
      targetService: "OpenClawRuntime",
      status: "success",
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    });
  }

  const playbookResult = await runTool(
    toolExecutions,
    "run_quality_playbook",
    "PlaybookEngine",
    () =>
      runPlaybook(services.playbookEngineBaseUrl, {
        traceId: request.traceId,
        analysisType: request.analysisType,
        input: request.input,
        facts: {
          fpyrDaily,
          defectBreakdown,
          equipmentTimeline,
        },
      })
  );

  const report = await runTool(
    toolExecutions,
    "build_quality_report",
    "ReportService",
    () =>
      buildReport(services.reportServiceBaseUrl, {
        traceId: request.traceId,
        input: { ...request.input, analysisType: request.analysisType },
        fpyrDaily,
        defectBreakdown,
        equipmentTimeline,
        playbookResult,
      })
  );

  report.auditTrail.push(
    {
      traceId: request.traceId,
      service: "OpenClawRuntime",
      action: "route_branch",
      startedAt: toolExecutions[0]?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      summary: `分支策略：${routingDecision.strategy}，主导异常类别：${routingDecision.primaryDefectCategory}，原因：${routingDecision.reason}（规则版本：${routingDecision.branchRuleVersion ?? "embedded-default"}）`,
    },
    {
      traceId: request.traceId,
      service: "OpenClawRuntime",
      action: "execute_skill",
      startedAt: toolExecutions[0]?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      summary:
        "固定技能 quality_first_pass_yield 已通过白名单工具完成编排执行",
    }
  );

  return {
    traceId: request.traceId,
    skillKey: request.skillKey,
    analysisType: request.analysisType,
    routingDecision,
    toolExecutions,
    report,
  };
}

async function executeQualityFpyrTrendBrief(
  request: RuntimeRequest,
  services: ServiceEndpoints
): Promise<RuntimeResponse> {
  const toolExecutions: ToolExecution[] = [];
  const queries = buildMetricQueries(
    request.traceId,
    request.input,
    request.skillKey
  );
  const fpyrDaily = await runTool(
    toolExecutions,
    "query_fpyr_daily",
    "SemanticAPI",
    () => querySemanticApi(services.semanticApiBaseUrl, queries.fpyrDaily)
  );
  const defectBreakdown = buildSkippedMetricResult("trend-brief-defect");
  const equipmentTimeline = buildSkippedMetricResult("trend-brief-equipment");

  const routingDecision: RoutingDecision = {
    strategy: "balanced_general",
    primaryDefectCategory: "简报未分项",
    reason: "first_pass_yield_trend_brief 不进行主导检验项分支编排",
    prioritizedToolPath: [
      "query_fpyr_daily",
      "run_quality_playbook",
      "build_quality_report",
    ],
  };

  const playbookResult = await runTool(
    toolExecutions,
    "run_quality_playbook",
    "PlaybookEngine",
    () =>
      runPlaybook(services.playbookEngineBaseUrl, {
        traceId: request.traceId,
        analysisType: request.analysisType,
        input: request.input,
        facts: {
          fpyrDaily,
          defectBreakdown,
          equipmentTimeline,
        },
      })
  );

  const report = await runTool(
    toolExecutions,
    "build_quality_report",
    "ReportService",
    () =>
      buildReport(services.reportServiceBaseUrl, {
        traceId: request.traceId,
        input: { ...request.input, analysisType: request.analysisType },
        fpyrDaily,
        defectBreakdown,
        equipmentTimeline,
        playbookResult,
      })
  );

  report.auditTrail.push(
    {
      traceId: request.traceId,
      service: "OpenClawRuntime",
      action: "route_branch",
      startedAt: toolExecutions[0]?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      summary: `趋势简报：固定路径（无检验项/设备下钻），策略说明：${routingDecision.reason}`,
    },
    {
      traceId: request.traceId,
      service: "OpenClawRuntime",
      action: "execute_skill",
      startedAt: toolExecutions[0]?.startedAt ?? new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      status: "success",
      summary:
        "固定技能 quality_fpyr_trend_brief 已通过白名单工具完成编排执行",
    }
  );

  return {
    traceId: request.traceId,
    skillKey: request.skillKey,
    analysisType: request.analysisType,
    routingDecision,
    toolExecutions,
    report,
  };
}

function buildSkippedMetricResult(suffix: string): MetricQueryResult {
  const now = new Date().toISOString();
  return {
    queryAuditId: `audit-skipped-${suffix}`,
    requestedAt: now,
    sourceSystem: "openclaw-runtime",
    dataTimestamp: now,
    metricDefinitions: [],
    rows: [],
  };
}

function buildMetricQueries(
  traceId: string,
  input: Record<string, unknown>,
  skillKey: SkillKey
) {
  const timeRange = normalizeTimeRange(input.timeRange);
  const siteId = asString(input.siteId, "site-A01");
  const tenantId = asString(input.tenantId, "tenant-demo");
  const lineCode = extractLineCode(input);
  const auditContext = {
    traceId,
    tenantId,
    actorId: "openclaw-runtime",
    skillKey,
  };

  return {
    fpyrDaily: {
      metricKey: "fpyr_daily",
      dimensions: ["date"],
      filters: [
        { field: "siteId", operator: "eq", value: siteId },
        { field: "stock_oper_order", operator: "eq", value: "ZKI" },
      ],
      grain: "day",
      timeRange,
      queryReason: "OpenClaw Runtime 执行技能时查询一次校验合格率趋势",
      auditContext,
    } satisfies MetricQuery,
    defectBreakdown: {
      metricKey: "defect_item_breakdown",
      dimensions: ["itemCategory", "itemName"],
      filters: [
        { field: "siteId", operator: "eq", value: siteId },
        { field: "judgeCode", operator: "in", value: ["A", "B", "F"] },
      ],
      grain: "day",
      timeRange,
      queryReason: "OpenClaw Runtime 执行技能时查询不合格项目结构",
      auditContext,
    } satisfies MetricQuery,
    equipmentTimeline: {
      metricKey: "equipment_event_timeline",
      dimensions: ["unit", "eventTime"],
      filters: [{ field: "unit", operator: "eq", value: lineCode }],
      grain: "day",
      timeRange,
      queryReason: "OpenClaw Runtime 执行技能时查询设备事件时间线",
      auditContext,
    } satisfies MetricQuery,
  };
}

async function querySemanticApi(
  semanticApiBaseUrl: string,
  query: MetricQuery
): Promise<MetricQueryResult> {
  const response = await fetch(`${semanticApiBaseUrl}/metrics/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(query),
  });

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `Semantic API 请求失败: ${response.status}`
    );
  }

  return (await response.json()) as MetricQueryResult;
}

async function runPlaybook(
  playbookEngineBaseUrl: string,
  payload: {
    traceId: string;
    analysisType: string;
    input: Record<string, unknown>;
    facts: {
      fpyrDaily: MetricQueryResult;
      defectBreakdown: MetricQueryResult;
      equipmentTimeline: MetricQueryResult;
    };
  }
) {
  const response = await fetch(
    `${playbookEngineBaseUrl}/playbooks/execute`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `Playbook Engine 请求失败: ${response.status}`
    );
  }

  return response.json() as Promise<PlaybookResult>;
}

async function buildReport(
  reportServiceBaseUrl: string,
  payload: {
    traceId: string;
    input: Record<string, unknown>;
    fpyrDaily: MetricQueryResult;
    defectBreakdown: MetricQueryResult;
    equipmentTimeline: MetricQueryResult;
    playbookResult: PlaybookResult;
  }
) {
  const response = await fetch(`${reportServiceBaseUrl}/reports/build`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `Report Service 请求失败: ${response.status}`
    );
  }

  return response.json() as Promise<StructuredReport>;
}

async function runTool<T>(
  toolExecutions: ToolExecution[],
  toolKey: string,
  targetService: string,
  executor: () => Promise<T>
) {
  const startedAt = new Date().toISOString();
  const result = await executor();
  toolExecutions.push({
    toolKey,
    targetService,
    status: "success",
    startedAt,
    finishedAt: new Date().toISOString(),
  });
  return result;
}

async function fetchBranchRoutingConfig(
  playbookEngineBaseUrl: string,
  analysisType: string
): Promise<{ ruleVersion: string; orderedBranches: OrderedBranchRow[] }> {
  try {
    const url = `${playbookEngineBaseUrl}/rules/branch-routing?analysisType=${encodeURIComponent(analysisType)}`;
    const response = await fetch(url);
    if (!response.ok) {
      return DEFAULT_BRANCH_ROUTING;
    }
    const payload = (await response.json()) as {
      ruleVersion?: string;
      orderedBranches?: unknown;
    };
    if (!Array.isArray(payload.orderedBranches)) {
      return DEFAULT_BRANCH_ROUTING;
    }
    const orderedBranches = payload.orderedBranches
      .map(normalizeOrderedBranch)
      .filter((b): b is OrderedBranchRow => b !== null);
    if (orderedBranches.length === 0) {
      return DEFAULT_BRANCH_ROUTING;
    }
    return {
      ruleVersion: String(payload.ruleVersion ?? "v1"),
      orderedBranches,
    };
  } catch {
    return DEFAULT_BRANCH_ROUTING;
  }
}

function normalizeOrderedBranch(raw: unknown): OrderedBranchRow | null {
  if (!raw || typeof raw !== "object") {
    return null;
  }
  const row = raw as Record<string, unknown>;
  const strategy = typeof row.strategy === "string" ? row.strategy : "";
  const reason = typeof row.reason === "string" ? row.reason : "";
  const skipEquipmentTimeline = row.skipEquipmentTimeline === true;
  const subsRaw = row.categorySubstrings;
  const categorySubstrings = Array.isArray(subsRaw)
    ? subsRaw.filter((s): s is string => typeof s === "string")
    : [];
  if (!strategy || !reason) {
    return null;
  }
  if (
    strategy !== "equipment_first" &&
    strategy !== "material_process_first" &&
    strategy !== "balanced_general"
  ) {
    return null;
  }
  return {
    strategy,
    categorySubstrings,
    reason,
    skipEquipmentTimeline,
  };
}

function pickOrderedBranch(
  primaryDefectCategory: string,
  branches: OrderedBranchRow[]
): OrderedBranchRow {
  for (const branch of branches) {
    if (branch.categorySubstrings.some((s) => primaryDefectCategory.includes(s))) {
      return branch;
    }
  }
  const fallback = branches.find((b) => b.categorySubstrings.length === 0);
  return fallback ?? branches[branches.length - 1]!;
}

function buildPrioritizedToolPath(skipEquipmentTimeline: boolean): string[] {
  const path = [
    "query_fpyr_daily",
    "query_defect_item_breakdown",
  ];
  if (!skipEquipmentTimeline) {
    path.push("query_equipment_event_timeline");
  }
  path.push("run_quality_playbook", "build_quality_report");
  return path;
}

function buildRoutingDecision(
  rows: Array<Record<string, string | number | boolean | null>>,
  config: { ruleVersion: string; orderedBranches: OrderedBranchRow[] }
): RoutingDecision {
  const primaryDefectCategory = asString(rows[0]?.itemCategory, "未识别");
  const branch = pickOrderedBranch(primaryDefectCategory, config.orderedBranches);
  const strategy = branch.strategy as RoutingDecision["strategy"];
  return {
    strategy,
    primaryDefectCategory,
    reason: branch.reason,
    prioritizedToolPath: buildPrioritizedToolPath(branch.skipEquipmentTimeline),
    branchRuleVersion:
      config.ruleVersion === "embedded-default" ? undefined : config.ruleVersion,
  };
}

function buildEmptyEquipmentTimelineMetricResult(): MetricQueryResult {
  const now = new Date().toISOString();
  return {
    queryAuditId: "audit-skipped-equipment",
    requestedAt: now,
    sourceSystem: "openclaw-runtime",
    dataTimestamp: now,
    metricDefinitions: [],
    rows: [],
  };
}

function normalizeTimeRange(input: unknown) {
  const raw =
    (input as { startAt?: string; endAt?: string; timezone?: string } | undefined) ??
    {};
  return {
    startAt: appendDayBoundary(raw.startAt, false),
    endAt: appendDayBoundary(raw.endAt, true),
    timezone: raw.timezone ?? "Asia/Shanghai",
  };
}

function appendDayBoundary(value: string | undefined, isEnd: boolean) {
  if (!value) {
    return isEnd
      ? "2026-03-30T23:59:59+08:00"
      : "2026-03-27T00:00:00+08:00";
  }

  if (value.includes("T")) {
    return value;
  }

  return `${value}T${isEnd ? "23:59:59" : "00:00:00"}+08:00`;
}

function extractLineCode(input: Record<string, unknown>) {
  const inputParams =
    (input.inputParams as { productLine?: string } | undefined) ?? {};
  const productLine = inputParams.productLine;
  return typeof productLine === "string" && productLine.length > 0
    ? productLine
    : "line-A";
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}
