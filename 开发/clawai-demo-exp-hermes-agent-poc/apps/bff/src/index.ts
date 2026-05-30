import "./load-env";
import express from "express";
import cors from "cors";
import fs from "fs";
import os from "os";
import path from "path";
import { v4 as uuidv4 } from "uuid";
import type { MetricQuery, MetricQueryResult } from "@ce-demo/metric-contract";
import type { StructuredReport } from "@ce-demo/report-schema";
import {
  createTaskRecord,
  deleteAllDemoTasksAndReports,
  getReportByTaskId,
  getTaskRecord,
  insertTaskEvent,
  listRecentCompletedTasks,
  saveReport,
  type StepStatus,
  type TaskSnapshot as Task,
  updateTaskRecord,
} from "./task-store";
import { stableStringify, TtlCache } from "./cache";
import { ServiceConcurrencyGate, TaskDispatchQueue } from "./concurrency";

const app = express();
app.use(cors());
app.use(express.json());

const SEMANTIC_API_BASE_URL =
  process.env.SEMANTIC_API_BASE_URL ?? "http://localhost:3010";
const PLAYBOOK_ENGINE_BASE_URL =
  process.env.PLAYBOOK_ENGINE_BASE_URL ?? "http://localhost:3020";
const REPORT_SERVICE_BASE_URL =
  process.env.REPORT_SERVICE_BASE_URL ?? "http://localhost:3030";
const OPENCLAW_RUNTIME_BASE_URL =
  process.env.OPENCLAW_RUNTIME_BASE_URL ?? "http://localhost:3040";
const OPENCLAW_EXECUTE_URL = process.env.OPENCLAW_EXECUTE_URL?.trim();
const OPENCLAW_AUTH_TOKEN = process.env.OPENCLAW_AUTH_TOKEN?.trim();
const HERMES_EXECUTE_URL = process.env.HERMES_EXECUTE_URL?.trim();
const HERMES_AUTH_TOKEN = process.env.HERMES_AUTH_TOKEN?.trim();
const OPENCLAW_REQUEST_TIMEOUT_MS = Number(
  process.env.OPENCLAW_REQUEST_TIMEOUT_MS ?? 30000
);
const HERMES_REQUEST_TIMEOUT_MS = Number(
  process.env.HERMES_REQUEST_TIMEOUT_MS ?? 30000
);
const HERMES_RETRY_DELAY_MS = Number(process.env.HERMES_RETRY_DELAY_MS ?? 1200);
const HERMES_MAX_ATTEMPTS = Number(process.env.HERMES_MAX_ATTEMPTS ?? 2);
const OPENCLAW_COMPAT_TIMEOUT_MS = Number(
  process.env.OPENCLAW_COMPAT_TIMEOUT_MS ?? OPENCLAW_REQUEST_TIMEOUT_MS
);
const OPENCLAW_RUNTIME_TIMEOUT_MS = Number(
  process.env.OPENCLAW_RUNTIME_TIMEOUT_MS ?? OPENCLAW_REQUEST_TIMEOUT_MS
);
const OPENCLAW_RETRY_DELAY_MS = Number(
  process.env.OPENCLAW_RETRY_DELAY_MS ?? 1200
);
const OPENCLAW_MAX_ATTEMPTS = Number(process.env.OPENCLAW_MAX_ATTEMPTS ?? 2);
const OPENCLAW_COMPAT_MODE = (process.env.OPENCLAW_COMPAT_MODE ?? "auto").trim();
const USE_OPENCLAW_RUNTIME = toBoolean(process.env.USE_OPENCLAW_RUNTIME);
/** 主路径为 OpenClaw 编排失败时，是否自动回退直连 semantic/playbook/report */
const OPENCLAW_FALLBACK_TO_DIRECT = toBoolean(
  process.env.OPENCLAW_FALLBACK_TO_DIRECT ?? "true"
);
/** 可选：简报技能单独的执行 URL（不设则与全量技能同属 OPENCLAW_EXECUTE_URL 或默认 /skills/:skillKey/execute） */
const OPENCLAW_EXECUTE_URL_TREND_BRIEF =
  process.env.OPENCLAW_EXECUTE_URL_TREND_BRIEF?.trim();
const OPENCLAW_SESSION_POLICY =
  process.env.OPENCLAW_SESSION_POLICY?.trim() === "follow_up_session"
    ? "follow_up_session"
    : "task_isolated";
const TASK_QUEUE_MAX_SIZE = Number(process.env.TASK_QUEUE_MAX_SIZE ?? 100);
const TASK_WORKER_MAX_CONCURRENT = Number(
  process.env.TASK_WORKER_MAX_CONCURRENT ?? 2
);
const TASK_WORKER_MAX_CONCURRENT_PER_TENANT = Number(
  process.env.TASK_WORKER_MAX_CONCURRENT_PER_TENANT ?? 1
);
const TASK_EXECUTION_TIMEOUT_MS = Number(
  process.env.TASK_EXECUTION_TIMEOUT_MS ?? 120000
);
const REPORT_REUSE_LOOKBACK_LIMIT = Number(
  process.env.REPORT_REUSE_LOOKBACK_LIMIT ?? 20
);
const REPORT_CACHE_TTL_MS = Number(process.env.REPORT_CACHE_TTL_MS ?? 300000);
const FACT_CACHE_TTL_MS = Number(process.env.FACT_CACHE_TTL_MS ?? 120000);
const TREND_BRIEF_FACT_CACHE_TTL_MS = Number(
  process.env.TREND_BRIEF_FACT_CACHE_TTL_MS ?? 180000
);
const SEMANTIC_API_REQUEST_TIMEOUT_MS = Number(
  process.env.SEMANTIC_API_REQUEST_TIMEOUT_MS ?? 12000
);
const PLAYBOOK_ENGINE_REQUEST_TIMEOUT_MS = Number(
  process.env.PLAYBOOK_ENGINE_REQUEST_TIMEOUT_MS ?? 12000
);
const REPORT_SERVICE_REQUEST_TIMEOUT_MS = Number(
  process.env.REPORT_SERVICE_REQUEST_TIMEOUT_MS ?? 12000
);
const OPENCLAW_MAX_CONCURRENT = Number(process.env.OPENCLAW_MAX_CONCURRENT ?? 2);
const OPENCLAW_MAX_CONCURRENT_PER_TENANT = Number(
  process.env.OPENCLAW_MAX_CONCURRENT_PER_TENANT ?? 1
);
const SEMANTIC_API_MAX_CONCURRENT = Number(
  process.env.SEMANTIC_API_MAX_CONCURRENT ?? 6
);
const SEMANTIC_API_MAX_CONCURRENT_PER_TENANT = Number(
  process.env.SEMANTIC_API_MAX_CONCURRENT_PER_TENANT ?? 3
);
const PLAYBOOK_ENGINE_MAX_CONCURRENT = Number(
  process.env.PLAYBOOK_ENGINE_MAX_CONCURRENT ?? 4
);
const PLAYBOOK_ENGINE_MAX_CONCURRENT_PER_TENANT = Number(
  process.env.PLAYBOOK_ENGINE_MAX_CONCURRENT_PER_TENANT ?? 2
);
const REPORT_SERVICE_MAX_CONCURRENT = Number(
  process.env.REPORT_SERVICE_MAX_CONCURRENT ?? 4
);
const REPORT_SERVICE_MAX_CONCURRENT_PER_TENANT = Number(
  process.env.REPORT_SERVICE_MAX_CONCURRENT_PER_TENANT ?? 2
);
const DEFAULT_ORCHESTRATOR_MODE =
  process.env.ORCHESTRATOR_DEFAULT_MODE?.trim() === "hermes"
    ? "hermes"
    : "openclaw";

/** skillKey 与 analysisType 合法配对（BFF 白名单） */
const SKILL_ANALYSIS_PAIRS: Record<string, string> = {
  quality_first_pass_yield: "first_pass_yield_monitoring",
  quality_fpyr_trend_brief: "first_pass_yield_trend_brief",
};

type OrchestratorMode = "openclaw" | "hermes";

const STEPS: Array<{ key: string; label: string }> = [
  { key: "data_collection", label: "数据采集" },
  { key: "anomaly_detection", label: "异常识别" },
  { key: "correlation_analysis", label: "关联分析" },
  { key: "report_generation", label: "报告生成" },
];

const STEP_DURATIONS = [1500, 1200, 1800, 1000];
type ManagedTask = Task & {
  tenantId: string;
  requestFingerprint: string;
  processingStartedAt?: string;
};

type AnalysisData = Awaited<ReturnType<typeof fetchDirectAnalysisData>>;

type CachedReportEntry = {
  report: StructuredReport;
  sourceTaskId?: string;
  executionRoute?: Task["executionRoute"];
};

/** 降级直连生成的结果不应被复用，否则编排恢复后仍会命中旧报告 */
function isNonReusableFallbackEntry(entry: CachedReportEntry) {
  return entry.executionRoute === "direct_fallback";
}

const reportReuseCache = new TtlCache<CachedReportEntry>(REPORT_CACHE_TTL_MS);
const semanticFactCache = new TtlCache<MetricQueryResult>(FACT_CACHE_TTL_MS);

const openclawGate = new ServiceConcurrencyGate({
  name: "openclaw",
  maxConcurrent: OPENCLAW_MAX_CONCURRENT,
  maxConcurrentPerTenant: OPENCLAW_MAX_CONCURRENT_PER_TENANT,
});
const semanticApiGate = new ServiceConcurrencyGate({
  name: "semantic_api",
  maxConcurrent: SEMANTIC_API_MAX_CONCURRENT,
  maxConcurrentPerTenant: SEMANTIC_API_MAX_CONCURRENT_PER_TENANT,
});
const playbookGate = new ServiceConcurrencyGate({
  name: "playbook_engine",
  maxConcurrent: PLAYBOOK_ENGINE_MAX_CONCURRENT,
  maxConcurrentPerTenant: PLAYBOOK_ENGINE_MAX_CONCURRENT_PER_TENANT,
});
const reportGate = new ServiceConcurrencyGate({
  name: "report_service",
  maxConcurrent: REPORT_SERVICE_MAX_CONCURRENT,
  maxConcurrentPerTenant: REPORT_SERVICE_MAX_CONCURRENT_PER_TENANT,
});
const taskQueue = new TaskDispatchQueue<ManagedTask>({
  maxConcurrent: TASK_WORKER_MAX_CONCURRENT,
  maxConcurrentPerTenant: TASK_WORKER_MAX_CONCURRENT_PER_TENANT,
  maxQueueSize: TASK_QUEUE_MAX_SIZE,
  worker: executeQueuedTask,
  onQueueChanged: syncQueuedTaskPositions,
});

app.post("/api/tasks", async (req, res) => {
  let normalizedInput: Record<string, unknown>;
  try {
    normalizedInput = normalizeTaskPayload(req.body ?? {});
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "任务参数无效";
    return res.status(400).json({ error: message });
  }

  const tenantId = asString(normalizedInput.tenantId, "tenant-demo");
  const requestFingerprint = createRequestFingerprint(normalizedInput);
  const reusableReport = await safeFindReusableReport(
    normalizedInput,
    tenantId,
    requestFingerprint
  );
  if (!reusableReport && !taskQueue.canAccept()) {
    return res.status(429).json({
      error:
        "当前分析任务排队已满，请稍后重试。系统已启用并发保护，避免高峰期整体超时。",
    });
  }

  const taskId = uuidv4();
  const traceId = `trace-${uuidv4().slice(0, 8)}`;

  const task: ManagedTask = {
    taskId,
    traceId,
    tenantId,
    requestFingerprint,
    status: "accepted",
    progress: 0,
    steps: STEPS.map((s) => ({ ...s, status: "pending" })),
    createdAt: new Date().toISOString(),
    queueMessage: reusableReport
      ? "命中最近结果复用，正在生成复用报告。"
      : "任务已进入队列，等待可用 worker。",
    resultSource: reusableReport ? "report_cache" : "fresh",
    reusedFromTaskId: reusableReport?.sourceTaskId,
    sessionPolicy: OPENCLAW_SESSION_POLICY,
    input: normalizedInput,
  };

  try {
    await createTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "task_accepted", {
      status: task.status,
      orchestratorMode: resolveOrchestratorMode(task.input),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "任务落库失败";
    console.error("[bff] createTaskRecord failed", error);
    return res.status(503).json({
      error: `数据库不可用或表未初始化：${message}。请检查 DB_HOST、APP_DB_NAME 及是否已执行 scripts/sql/mysql 初始化。`,
    });
  }

  if (reusableReport) {
    void completeTaskFromCache(task, reusableReport);
  } else {
    await taskQueue.enqueue(task);
    await insertTaskEvent(task.taskId, task.traceId, "task_queued", {
      queuePosition: taskQueue.getQueuePosition(task.taskId),
      queueMessage: task.queueMessage,
    });
  }

  res.json({ taskId, traceId, status: "accepted" });
});

app.get("/api/tasks/:taskId", async (req, res) => {
  try {
    const task = await getTaskRecord(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }
    res.json(task);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "查询任务失败";
    console.error("[bff] getTaskRecord", error);
    return res.status(503).json({
      error: `数据库不可用：${message}。请检查 .env 是否在仓库根目录且 DB_* 正确。`,
    });
  }
});

app.get("/api/reports/:taskId", async (req, res) => {
  try {
    const task = await getTaskRecord(req.params.taskId);
    if (!task) {
      return res.status(404).json({ error: "Task not found" });
    }

    if (task.status !== "completed") {
      return res.status(202).json({ message: "Report not ready" });
    }

    const report = await getReportByTaskId(req.params.taskId);
    res.json(report);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "查询报告失败";
    console.error("[bff] getReportByTaskId", error);
    return res.status(503).json({
      error: `数据库不可用：${message}。请检查 .env 是否在仓库根目录且 DB_* 正确。`,
    });
  }
});

/** Demo：清空库内全部任务与报告，并清除 BFF 内存复用缓存；需 BFF 任务队列空闲（无排队/执行中） */
app.post("/api/demo/clear-reports", async (req, res) => {
  const confirm = (req.body as { confirm?: string })?.confirm;
  if (confirm !== "DELETE_ALL_DEMO_REPORTS") {
    return res.status(400).json({
      error:
        "请求体需包含 confirm: \"DELETE_ALL_DEMO_REPORTS\" 以确认不可逆清空。",
    });
  }
  if (!taskQueue.isIdle()) {
    return res.status(409).json({
      error: "仍有任务在 BFF 队列或执行中，请等待结束后再清空。",
    });
  }
  try {
    await deleteAllDemoTasksAndReports();
    reportReuseCache.clear();
    semanticFactCache.clear();
    res.json({
      ok: true,
      message: "已清空分析任务、结构化报告及 BFF 报告/语义事实缓存。",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "清空失败";
    console.error("[bff] demo/clear-reports", error);
    return res.status(503).json({
      error: `数据库操作失败：${message}`,
    });
  }
});

async function syncQueuedTaskPositions(queuedTasks: ManagedTask[]) {
  await Promise.all(
    queuedTasks.map(async (queuedTask, index) => {
      const nextPosition = index + 1;
      const nextMessage = `任务排队中，前方还有 ${index} 个任务等待执行。`;
      if (
        queuedTask.queuePosition === nextPosition &&
        queuedTask.queueMessage === nextMessage
      ) {
        return;
      }
      queuedTask.queuePosition = nextPosition;
      queuedTask.queueMessage = nextMessage;
      await updateTaskRecord(queuedTask);
    })
  );
}

async function executeQueuedTask(task: ManagedTask) {
  await processTask(task);
}

async function completeTaskFromCache(
  task: ManagedTask,
  cached: CachedReportEntry
) {
  try {
    const report = cloneStructuredReportForTask(
      cached.report,
      task,
      cached.sourceTaskId
    );
    task.status = "completed";
    task.progress = 100;
    task.completedAt = new Date().toISOString();
    task.reportId = report.reportMeta.reportId;
    task.queuePosition = undefined;
    task.queueMessage = "命中最近相同条件结果，已直接复用。";
    task.executionRoute = cached.executionRoute;
    task.steps = task.steps.map((step) => ({ ...step, status: "completed" }));
    await saveReport(
      task,
      report,
      report.reportMeta.reportId,
      asString(task.input.reportTemplateVersion, "fpyr-demo-v1")
    );
    await updateTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "report_reused", {
      sourceTaskId: cached.sourceTaskId,
      resultSource: "report_cache",
    });
    await insertTaskEvent(task.taskId, task.traceId, "report_generated", {
      reportId: report.reportMeta.reportId,
      resultSource: "report_cache",
    });
  } catch (error) {
    task.status = "failed";
    task.errorMessage =
      error instanceof Error ? error.message : "缓存结果复用失败";
    task.completedAt = new Date().toISOString();
    await updateTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "task_failed", {
      errorMessage: task.errorMessage,
    });
  }
}

async function safeFindReusableReport(
  input: Record<string, unknown>,
  tenantId: string,
  requestFingerprint: string
) {
  const memoryHit = reportReuseCache.get(requestFingerprint);
  if (memoryHit) {
    if (isNonReusableFallbackEntry(memoryHit)) {
      reportReuseCache.delete(requestFingerprint);
    } else {
      return memoryHit;
    }
  }
  try {
    const candidates = await listRecentCompletedTasks(
      tenantId,
      asString(input.analysisType, "first_pass_yield_monitoring"),
      REPORT_REUSE_LOOKBACK_LIMIT
    );
    const matched = candidates.find(
      (candidate) =>
        createRequestFingerprint(candidate.input) === requestFingerprint &&
        candidate.executionRoute !== "direct_fallback"
    );
    if (!matched) {
      return undefined;
    }
    const report = (await getReportByTaskId(matched.taskId)) as StructuredReport | null;
    if (!report) {
      return undefined;
    }
    const cachedEntry: CachedReportEntry = {
      report,
      sourceTaskId: matched.taskId,
      executionRoute: matched.executionRoute,
    };
    reportReuseCache.set(requestFingerprint, cachedEntry);
    return cachedEntry;
  } catch (error) {
    console.warn("[bff] reusable report lookup skipped", error);
    return undefined;
  }
}

async function processTask(task: ManagedTask) {
  try {
    task.queuePosition = undefined;
    task.queueMessage = undefined;
    task.processingStartedAt = new Date().toISOString();
    task.status = "running";
    setStepStatus(task, 0, "running");
    await updateTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "task_dispatched", {
      workerType: "in_process_worker",
      queueWaitMs: Math.max(0, Date.now() - Date.parse(task.createdAt)),
      sessionPolicy: task.sessionPolicy,
    });
    await insertTaskEvent(task.taskId, task.traceId, "task_started", {
      currentStep: task.steps[0].key,
    });

    const orchestratorMode = resolveOrchestratorMode(task.input);
    const report =
      orchestratorMode === "hermes"
        ? await processTaskViaHermes(task)
        : USE_OPENCLAW_RUNTIME
          ? await processTaskViaOpenClaw(task)
          : await processTaskDirect(task);

    await delay(STEP_DURATIONS[3]);

    task.status = "completed";
    task.progress = 100;
    task.completedAt = new Date().toISOString();
    task.reportId = (report as { reportMeta: { reportId: string } }).reportMeta
      .reportId;
    task.steps[3].status = "completed";

    await saveReport(
      task,
      report,
      task.reportId,
      asString(task.input.reportTemplateVersion, "fpyr-demo-v1")
    );
    if (task.executionRoute !== "direct_fallback") {
      reportReuseCache.set(task.requestFingerprint, {
        report,
        sourceTaskId: task.taskId,
        executionRoute: task.executionRoute,
      });
    }
    await updateTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "report_generated", {
      reportId: task.reportId,
    });
  } catch (error) {
    task.status = "failed";
    task.errorMessage = error instanceof Error ? error.message : "任务执行失败";
    task.completedAt = new Date().toISOString();
    const runningStepIndex = task.steps.findIndex(
      (step) => step.status === "running"
    );
    if (runningStepIndex >= 0) {
      task.steps[runningStepIndex].status = "failed";
    }
    await updateTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "task_failed", {
      errorMessage: task.errorMessage,
    });
  }
}

async function processTaskViaOpenClaw(task: Task): Promise<StructuredReport> {
  const sk = resolveSkillKeyFromInput(task.input);
  task.executionRoute = isOpenClawCompatEndpoint(sk)
    ? "openclaw_external"
    : "openclaw_local";
  await delay(STEP_DURATIONS[0]);
  setStepStatus(task, 0, "completed");
  setStepStatus(task, 1, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "data_collection",
    currentStep: "anomaly_detection",
    mode: "openclaw",
  });

  await delay(STEP_DURATIONS[1]);
  setStepStatus(task, 1, "completed");
  setStepStatus(task, 2, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "anomaly_detection",
    currentStep: "correlation_analysis",
    mode: "openclaw",
  });

  await delay(STEP_DURATIONS[2]);
  setStepStatus(task, 2, "completed");
  setStepStatus(task, 3, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "correlation_analysis",
    currentStep: "report_generation",
    mode: "openclaw",
  });

  try {
    const report = await executeOpenClawSkill(task);
    await insertTaskEvent(
      task.taskId,
      task.traceId,
      "openclaw_runtime_completed",
      {
        openclawRuntimeBaseUrl: OPENCLAW_RUNTIME_BASE_URL,
        skillKey: resolveSkillKeyFromInput(task.input),
      }
    );
    return report;
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "OpenClaw Runtime 调用失败";
    if (error instanceof OpenClawSkillUnavailableError) {
      throw error;
    }
    if (!OPENCLAW_FALLBACK_TO_DIRECT) {
      throw error;
    }
    task.executionDegraded = true;
    task.executionRoute = "direct_fallback";
    task.degradedNotice =
      "智能编排服务（OpenClaw Runtime）当前不可用，已自动切换为直连分析链路生成报告。报告结论仍来自语义层与规则引擎，未发现业务口径被改写。";
    task.degradedDetail = detail;
    await updateTaskRecord(task);
    await insertTaskEvent(task.taskId, task.traceId, "openclaw_fallback_to_direct", {
      reason: detail,
      openclawRuntimeBaseUrl: OPENCLAW_RUNTIME_BASE_URL,
    });
    const data = await fetchDirectAnalysisData(task);
    return buildReport(task, {
      traceId: task.traceId,
      input: task.input,
      ...data,
    });
  }
}

async function processTaskViaHermes(task: Task): Promise<StructuredReport> {
  task.executionRoute = "hermes_external";
  await delay(STEP_DURATIONS[0]);
  setStepStatus(task, 0, "completed");
  setStepStatus(task, 1, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "data_collection",
    currentStep: "anomaly_detection",
    mode: "hermes",
  });

  await delay(STEP_DURATIONS[1]);
  setStepStatus(task, 1, "completed");
  setStepStatus(task, 2, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "anomaly_detection",
    currentStep: "correlation_analysis",
    mode: "hermes",
  });

  await delay(STEP_DURATIONS[2]);
  setStepStatus(task, 2, "completed");
  setStepStatus(task, 3, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "correlation_analysis",
    currentStep: "report_generation",
    mode: "hermes",
  });

  return executeHermesOrchestration(task);
}

async function processTaskDirect(task: Task): Promise<StructuredReport> {
  task.executionRoute = "direct";
  assertTaskWithinExecutionBudget(task, "direct_analysis_start");
  const data = await fetchDirectAnalysisData(task);

  setStepStatus(task, 0, "completed");
  setStepStatus(task, 1, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "data_collection",
    currentStep: "anomaly_detection",
    mode: "direct",
  });

  await delay(STEP_DURATIONS[1]);
  setStepStatus(task, 1, "completed");
  setStepStatus(task, 2, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "anomaly_detection",
    currentStep: "correlation_analysis",
    mode: "direct",
  });

  await delay(STEP_DURATIONS[2]);
  setStepStatus(task, 2, "completed");
  setStepStatus(task, 3, "running");
  await updateTaskRecord(task);
  await insertTaskEvent(task.taskId, task.traceId, "step_transition", {
    completedStep: "correlation_analysis",
    currentStep: "report_generation",
    mode: "direct",
  });

  return buildReport(task, {
    traceId: task.traceId,
    input: task.input,
    ...data,
  });
}

async function fetchDirectAnalysisData(task: Task) {
  assertTaskWithinExecutionBudget(task, "fetch_direct_analysis_data");
  const queries = buildMetricQueries(task);
  if (isTrendBriefTask(task.input)) {
    const fpyrDaily = await querySemanticApi(task, queries.fpyrDaily);
    const defectBreakdown = emptySkippedMetricResult("trend-brief-defect");
    const equipmentTimeline = emptySkippedMetricResult("trend-brief-equipment");
    const playbookResult = await runPlaybook(task, {
      fpyrDaily,
      defectBreakdown,
      equipmentTimeline,
    });
    return { fpyrDaily, defectBreakdown, equipmentTimeline, playbookResult };
  }

  const [fpyrDaily, defectBreakdown, equipmentTimeline] = await Promise.all([
    querySemanticApi(task, queries.fpyrDaily),
    querySemanticApi(task, queries.defectBreakdown),
    querySemanticApi(task, queries.equipmentTimeline),
  ]);
  const playbookResult = await runPlaybook(task, {
    fpyrDaily,
    defectBreakdown,
    equipmentTimeline,
  });
  return { fpyrDaily, defectBreakdown, equipmentTimeline, playbookResult };
}

function buildMetricQueries(task: Task) {
  const timeRange = normalizeTimeRange(task.input.timeRange);
  const baseAuditContext = {
    traceId: task.traceId,
    tenantId: asString(task.input.tenantId, "tenant-demo"),
    actorId: "user-001",
    skillKey: resolveSkillKeyFromInput(task.input),
  };
  const siteId = asString(task.input.siteId, "site-A01");
  const lineCode = extractLineCode(task.input);

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
      queryReason: "BFF 生成报告时查询一次校验合格率趋势",
      auditContext: baseAuditContext,
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
      queryReason: "BFF 生成报告时查询不合格项目结构",
      auditContext: baseAuditContext,
    } satisfies MetricQuery,
    equipmentTimeline: {
      metricKey: "equipment_event_timeline",
      dimensions: ["unit", "eventTime"],
      filters: [{ field: "unit", operator: "eq", value: lineCode }],
      grain: "day",
      timeRange,
      queryReason: "BFF 生成报告时查询设备事件时间线",
      auditContext: baseAuditContext,
    } satisfies MetricQuery,
  };
}

async function querySemanticApi(
  task: Task,
  query: MetricQuery
): Promise<MetricQueryResult> {
  const cacheKey = createMetricQueryCacheKey(query);
  const cacheTtlMs = isTrendBriefTask(task.input)
    ? TREND_BRIEF_FACT_CACHE_TTL_MS
    : FACT_CACHE_TTL_MS;
  const cached = semanticFactCache.get(cacheKey);
  if (cached) {
    await insertTaskEvent(task.taskId, task.traceId, "semantic_api_cache_hit", {
      metricKey: query.metricKey,
    });
    return cached;
  }

  const response = await withServiceGate(task, semanticApiGate, async () =>
    fetchWithTimeout(
      task,
      "semantic_api",
      `${SEMANTIC_API_BASE_URL}/metrics/query`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      },
      SEMANTIC_API_REQUEST_TIMEOUT_MS
    )
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `Semantic API 请求失败: ${response.status}`
    );
  }

  const result = (await response.json()) as MetricQueryResult;
  semanticFactCache.set(cacheKey, result, cacheTtlMs);
  return result;
}

async function runPlaybook(
  task: Task,
  facts: {
    fpyrDaily: MetricQueryResult;
    defectBreakdown: MetricQueryResult;
    equipmentTimeline: MetricQueryResult;
  }
) {
  const response = await withServiceGate(task, playbookGate, async () =>
    fetchWithTimeout(
      task,
      "playbook_engine",
      `${PLAYBOOK_ENGINE_BASE_URL}/playbooks/execute`,
      {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        traceId: task.traceId,
        analysisType: asString(task.input.analysisType, "first_pass_yield_monitoring"),
        input: task.input,
        facts,
      }),
      },
      PLAYBOOK_ENGINE_REQUEST_TIMEOUT_MS
    )
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `Playbook Engine 请求失败: ${response.status}`
    );
  }

  return response.json() as Promise<{
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
  }>;
}

function orchestratorDisplayNameFromTask(task: Task): string {
  const r = task.executionRoute;
  if (r === "hermes_external") return "Hermes";
  if (r === "openclaw_external") return "OpenClaw";
  if (r === "openclaw_local") return "OpenClaw（本地）";
  return "直连";
}

async function buildReport(
  task: Task,
  payload: {
    traceId: string;
    input: Record<string, unknown>;
    orchestratorDisplayName?: string;
    fpyrDaily: MetricQueryResult;
    defectBreakdown: MetricQueryResult;
    equipmentTimeline: MetricQueryResult;
    playbookResult: {
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
    };
  }
): Promise<StructuredReport> {
  const response = await withServiceGate(task, reportGate, async () =>
    fetchWithTimeout(
      task,
      "report_service",
      `${REPORT_SERVICE_BASE_URL}/reports/build`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          orchestratorDisplayName:
            payload.orchestratorDisplayName ?? orchestratorDisplayNameFromTask(task),
        }),
      },
      REPORT_SERVICE_REQUEST_TIMEOUT_MS
    )
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `Report Service 请求失败: ${response.status}`
    );
  }

  await insertTaskEvent(task.taskId, task.traceId, "report_service_completed", {
    reportServiceBaseUrl: REPORT_SERVICE_BASE_URL,
  });

  return response.json() as Promise<StructuredReport>;
}

async function executeOpenClawSkill(task: Task) {
  assertTaskWithinExecutionBudget(task, "openclaw_execution");
  const skillKey = resolveSkillKeyFromInput(task.input);
  ensureOpenClawSkillAvailable(skillKey);
  if (isOpenClawCompatEndpoint(skillKey)) {
    const data = await fetchDirectAnalysisData(task);
    const openclawResult = await executeOpenClawCompat(task, data);
    const mergedPlaybookResult = mergePlaybookWithLlmSummary(
      data.playbookResult,
      openclawResult
    );
    return buildReport(task, {
      traceId: task.traceId,
      input: task.input,
      ...data,
      playbookResult: mergedPlaybookResult,
    });
  }

  const endpoint = getOpenClawExecuteEndpoint(skillKey);
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-trace-id": task.traceId,
    "x-openclaw-agent-id": "main",
  };
  if (OPENCLAW_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${OPENCLAW_AUTH_TOKEN}`;
  }
  const analysisType = asString(task.input.analysisType, "first_pass_yield_monitoring");
  const response = await withServiceGate(task, openclawGate, async () =>
    fetchWithTimeout(
      task,
      "openclaw_runtime",
      endpoint,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          traceId: task.traceId,
          skillKey,
          analysisType,
          input: task.input,
          metadata: {
            sessionPolicy: task.sessionPolicy ?? OPENCLAW_SESSION_POLICY,
          },
        }),
      },
      OPENCLAW_RUNTIME_TIMEOUT_MS
    )
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: string }
      | undefined;
    throw new Error(
      errorPayload?.error ?? `OpenClaw Runtime 请求失败: ${response.status}`
    );
  }

  const payload = (await response.json()) as {
    report: StructuredReport;
  };

  return payload.report;
}

async function executeHermesOrchestration(task: Task): Promise<StructuredReport> {
  if (!HERMES_EXECUTE_URL) {
    throw new Error(
      "hermes_external: 未配置 HERMES_EXECUTE_URL，无法走 Hermes 编排链路"
    );
  }
  const data = await fetchDirectAnalysisData(task);
  const endpoint = HERMES_EXECUTE_URL;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-trace-id": task.traceId,
    "x-orchestrator": "hermes",
  };
  if (HERMES_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${HERMES_AUTH_TOKEN}`;
  }
  const response = await withServiceGate(task, openclawGate, async () =>
    fetchHermesWithRetry(task, endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "hermes",
        stream: false,
        input: buildOpenClawCompatPrompt(task, data),
        metadata: {
          traceId: task.traceId,
          analysisType: asString(task.input.analysisType, "first_pass_yield_monitoring"),
          sessionPolicy: task.sessionPolicy ?? OPENCLAW_SESSION_POLICY,
        },
      }),
    })
  );
  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    const detail =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : errorPayload?.error?.message ?? errorPayload?.message;
    throw new Error(detail ?? `Hermes 请求失败: ${response.status}`);
  }

  const payload = (await response.json()) as { id?: string; status?: string };
  const llmRawText = extractResponsesOutputText(payload);
  const llmSummary = parseLlmStructuredSummary(llmRawText);
  const executionStatus = buildOpenClawExecutionStatus(llmRawText, llmSummary);
  await insertTaskEvent(task.taskId, task.traceId, "hermes_external_completed", {
    hermesExecuteUrl: endpoint,
    responseId: payload.id,
    responseStatus: payload.status,
    llmSummaryPreview: (
      llmSummary?.headline ??
      executionStatus?.summary ??
      llmRawText
    )?.slice(0, 120),
  });

  const mergedPlaybookResult = mergePlaybookWithLlmSummary(data.playbookResult, {
    rawText: llmRawText,
    llmSummary,
    executionStatus,
  });
  return buildReport(task, {
    traceId: task.traceId,
    input: task.input,
    ...data,
    playbookResult: mergedPlaybookResult,
  });
}

function getOpenClawExecuteEndpoint(skillKey: string) {
  if (OPENCLAW_EXECUTE_URL) {
    return OPENCLAW_EXECUTE_URL;
  }
  if (
    skillKey === "quality_fpyr_trend_brief" &&
    OPENCLAW_EXECUTE_URL_TREND_BRIEF
  ) {
    return OPENCLAW_EXECUTE_URL_TREND_BRIEF;
  }
  return `${OPENCLAW_RUNTIME_BASE_URL}/skills/${encodeURIComponent(skillKey)}/execute`;
}

function isOpenClawCompatEndpoint(skillKey: string) {
  if (OPENCLAW_COMPAT_MODE === "responses") return true;
  if (OPENCLAW_COMPAT_MODE === "runtime") return false;
  const endpoint = getOpenClawExecuteEndpoint(skillKey);
  return endpoint.includes("/v1/responses") || endpoint.includes("/v1/chat/completions");
}

async function executeOpenClawCompat(
  task: Task,
  factsContext: Awaited<ReturnType<typeof fetchDirectAnalysisData>>
): Promise<OpenClawCompatResult> {
  const endpoint = getOpenClawExecuteEndpoint(resolveSkillKeyFromInput(task.input));
  if (endpoint.includes("/v1/chat/completions")) {
    return callOpenClawChatCompletions(task, endpoint, factsContext);
  }
  return callOpenClawResponses(task, endpoint, factsContext);
}

async function callOpenClawResponses(
  task: Task,
  endpoint: string,
  factsContext: Awaited<ReturnType<typeof fetchDirectAnalysisData>>
): Promise<OpenClawCompatResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-trace-id": task.traceId,
    "x-openclaw-agent-id": "main",
  };
  if (OPENCLAW_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${OPENCLAW_AUTH_TOKEN}`;
  }

  const response = await withServiceGate(task, openclawGate, async () =>
    fetchOpenClawWithRetry(task, endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openclaw",
        stream: false,
        input: buildOpenClawCompatPrompt(task, factsContext),
        metadata: {
          traceId: task.traceId,
          analysisType: asString(task.input.analysisType, "first_pass_yield_monitoring"),
          sessionPolicy: task.sessionPolicy ?? OPENCLAW_SESSION_POLICY,
        },
      }),
    })
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    const detail =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : errorPayload?.error?.message ?? errorPayload?.message;
    throw new Error(detail ?? `OpenClaw Responses 请求失败: ${response.status}`);
  }

  const payload = (await response.json()) as { id?: string; status?: string };
  const llmRawText = extractResponsesOutputText(payload);
  const llmSummary = parseLlmStructuredSummary(llmRawText);
  const executionStatus = buildOpenClawExecutionStatus(llmRawText, llmSummary);
  await insertTaskEvent(task.taskId, task.traceId, "openclaw_external_completed", {
    openclawExecuteUrl: endpoint,
    mode: "responses",
    responseId: payload.id,
    responseStatus: payload.status,
    llmSummaryPreview: (
      llmSummary?.headline ??
      executionStatus?.summary ??
      llmRawText
    )?.slice(0, 120),
  });
  return {
    rawText: llmRawText,
    llmSummary,
    executionStatus,
  };
}

async function callOpenClawChatCompletions(
  task: Task,
  endpoint: string,
  factsContext: Awaited<ReturnType<typeof fetchDirectAnalysisData>>
): Promise<OpenClawCompatResult> {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "x-trace-id": task.traceId,
    "x-openclaw-agent-id": "main",
  };
  if (OPENCLAW_AUTH_TOKEN) {
    headers.Authorization = `Bearer ${OPENCLAW_AUTH_TOKEN}`;
  }

  const response = await withServiceGate(task, openclawGate, async () =>
    fetchOpenClawWithRetry(task, endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "openclaw",
        stream: false,
        messages: [
          {
            role: "user",
            content: buildOpenClawCompatPrompt(task, factsContext),
          },
        ],
        user: task.traceId,
        metadata: {
          sessionPolicy: task.sessionPolicy ?? OPENCLAW_SESSION_POLICY,
        },
      }),
    })
  );

  if (!response.ok) {
    const errorPayload = (await safeParseJson(response)) as
      | { error?: { message?: string } | string; message?: string }
      | undefined;
    const detail =
      typeof errorPayload?.error === "string"
        ? errorPayload.error
        : errorPayload?.error?.message ?? errorPayload?.message;
    throw new Error(detail ?? `OpenClaw ChatCompletions 请求失败: ${response.status}`);
  }

  const payload = (await response.json()) as { id?: string };
  const llmRawText = extractChatCompletionsText(payload);
  const llmSummary = parseLlmStructuredSummary(llmRawText);
  const executionStatus = buildOpenClawExecutionStatus(llmRawText, llmSummary);
  await insertTaskEvent(task.taskId, task.traceId, "openclaw_external_completed", {
    openclawExecuteUrl: endpoint,
    mode: "chat_completions",
    responseId: payload.id,
    llmSummaryPreview: (
      llmSummary?.headline ??
      executionStatus?.summary ??
      llmRawText
    )?.slice(0, 120),
  });
  return {
    rawText: llmRawText,
    llmSummary,
    executionStatus,
  };
}

function buildOpenClawCompatPrompt(
  task: Task,
  factsContext: Awaited<ReturnType<typeof fetchDirectAnalysisData>>
) {
  const isBrief = isTrendBriefTask(task.input);
  return JSON.stringify(
    {
      instruction:
        isBrief
          ? "你是制造咨询场景编排助手。当前任务是管理层趋势简报，请严格基于已提供的可信事实输出简报化结论，不做根因下钻，不改写业务指标与规则口径。"
          : "你是制造咨询场景编排助手。请严格基于已提供的可信事实生成结构化结论，禁止改写业务指标与规则口径。",
      outputContract: {
        format: "json",
        schema: {
          headline: "string，1-2句摘要，可含 Markdown",
          keyFindings: "string[]，3-5条关键发现，每条1句",
          riskSignals: "string[]，2-3条风险信号/异常征兆",
          recommendedActions: "string[]，2-4条可执行动作，面向制造现场",
          nextQuestions: "string[]，1-3条下一步追问或取证建议",
          insight: "string，1条总建议（兼容旧版）",
        },
        constraints: [
          "只输出 JSON，不要输出代码块或额外说明",
          "不要输出与指标计算口径冲突的内容",
          "避免重复句子",
          "建议动作需可执行，尽量包含对象、时点或责任角色",
          "如果 factsSummary 已包含真实数据，则不要声称“缺少数据”“未提供实际数据”“无法评估”",
          "只有在 factsSummary 明确标记 skipped=true 或 rows=0 时，才能说明该项未执行或无数据",
          ...(isBrief
            ? [
                "当前任务是趋势简报；对 intentionallySkippedMetrics 中的数据，只能说明“本简报未下钻”，不能写成“数据缺失”",
                "当前任务只应围绕趋势、阈值状态、管理动作展开；如需根因，请在 nextQuestions 中建议切换到 quality_first_pass_yield",
              ]
            : []),
        ],
      },
      traceId: task.traceId,
      analysisType: asString(task.input.analysisType, "first_pass_yield_monitoring"),
      input: task.input,
      factsSummary: buildOpenClawFactsSummary(task, factsContext),
    },
    null,
    2
  );
}

async function fetchOpenClawWithRetry(
  task: Task,
  endpoint: string,
  init: RequestInit
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OPENCLAW_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), OPENCLAW_COMPAT_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal,
      });
      if (
        response.ok ||
        attempt === OPENCLAW_MAX_ATTEMPTS ||
        !isRetryableOpenClawStatus(response.status)
      ) {
        return response;
      }
      await insertTaskEvent(task.taskId, task.traceId, "openclaw_external_retry", {
        openclawExecuteUrl: endpoint,
        attempt,
        reason: `HTTP ${response.status}`,
      });
    } catch (error) {
      lastError = error;
      if (attempt === OPENCLAW_MAX_ATTEMPTS || !isRetryableOpenClawError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`openclaw_external: ${msg}`);
      }
      await insertTaskEvent(task.taskId, task.traceId, "openclaw_external_retry", {
        openclawExecuteUrl: endpoint,
        attempt,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
    await delay(OPENCLAW_RETRY_DELAY_MS);
  }
  if (lastError instanceof Error) {
    throw new Error(`openclaw_external: ${lastError.message}`);
  }
  throw new Error("openclaw_external: OpenClaw 请求失败");
}

async function fetchHermesWithRetry(
  task: Task,
  endpoint: string,
  init: RequestInit
) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= HERMES_MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HERMES_REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(endpoint, {
        ...init,
        signal: controller.signal,
      });
      if (
        response.ok ||
        attempt === HERMES_MAX_ATTEMPTS ||
        !isRetryableOpenClawStatus(response.status)
      ) {
        return response;
      }
      await insertTaskEvent(task.taskId, task.traceId, "hermes_external_retry", {
        hermesExecuteUrl: endpoint,
        attempt,
        reason: `HTTP ${response.status}`,
      });
    } catch (error) {
      lastError = error;
      if (attempt === HERMES_MAX_ATTEMPTS || !isRetryableOpenClawError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        throw new Error(`hermes_external: ${msg}`);
      }
      await insertTaskEvent(task.taskId, task.traceId, "hermes_external_retry", {
        hermesExecuteUrl: endpoint,
        attempt,
        reason: error instanceof Error ? error.message : String(error),
      });
    } finally {
      clearTimeout(timer);
    }
    await delay(HERMES_RETRY_DELAY_MS);
  }
  if (lastError instanceof Error) {
    throw new Error(`hermes_external: ${lastError.message}`);
  }
  throw new Error("hermes_external: Hermes 请求失败");
}

function isRetryableOpenClawStatus(status: number) {
  return status === 408 || status === 429 || status >= 500;
}

function isRetryableOpenClawError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "AbortError" ||
    /fetch failed/i.test(error.message) ||
    /ECONNRESET/i.test(error.message) ||
    /ECONNREFUSED/i.test(error.message) ||
    /ETIMEDOUT/i.test(error.message)
  );
}

function buildOpenClawFactsSummary(
  task: Task,
  factsContext: Awaited<ReturnType<typeof fetchDirectAnalysisData>>
) {
  const fpyrRows = factsContext.fpyrDaily.rows;
  const defectRows = factsContext.defectBreakdown.rows;
  const equipmentRows = factsContext.equipmentTimeline.rows;
  const latestFpyr = fpyrRows.at(-1);
  const previousFpyr = fpyrRows.at(-2);
  const ruleSummary = factsContext.playbookResult.ruleSummary;

  return {
    traceId: task.traceId,
    skillKey: resolveSkillKeyFromInput(task.input),
    analysisScope: buildOpenClawAnalysisScope(task),
    factAvailability: {
      fpyrDaily: {
        skipped: isSkippedMetricResult(factsContext.fpyrDaily),
        rows: fpyrRows.length,
      },
      defectBreakdown: {
        skipped: isSkippedMetricResult(factsContext.defectBreakdown),
        rows: defectRows.length,
      },
      equipmentTimeline: {
        skipped: isSkippedMetricResult(factsContext.equipmentTimeline),
        rows: equipmentRows.length,
      },
    },
    fpyrDaily: {
      latest: latestFpyr ?? null,
      previous: previousFpyr ?? null,
      firstThreeRows: fpyrRows.slice(0, 3),
      lastThreeRows: fpyrRows.slice(-3),
    },
    defectBreakdown: {
      topRows: defectRows.slice(0, 5),
      totalRows: defectRows.length,
    },
    equipmentTimeline: {
      recentRows: equipmentRows.slice(0, 5),
      totalRows: equipmentRows.length,
    },
    playbookResult: {
      headline: factsContext.playbookResult.headline,
      statusLevel: factsContext.playbookResult.statusLevel,
      keyFindings: factsContext.playbookResult.keyFindings,
      ruleSummary: {
        latestFpyr: ruleSummary.latestFpyr,
        fpyrDelta: ruleSummary.fpyrDelta,
        totalDefectBatches: ruleSummary.totalDefectBatches,
        totalDefectItems: ruleSummary.totalDefectItems,
        topDefectCategory: ruleSummary.topDefectCategory ?? null,
        topDefectItemName: ruleSummary.topDefectItemName ?? null,
        equipmentEventCount: ruleSummary.equipmentEventCount,
      },
    },
  };
}

function buildOpenClawAnalysisScope(task: Task) {
  const briefMode = isTrendBriefTask(task.input);
  return {
    mode: briefMode ? "trend_brief" : "full_diagnosis",
    intentionallySkippedMetrics: briefMode
      ? ["defectBreakdown", "equipmentTimeline"]
      : [],
    focus: briefMode
      ? ["fpyr_trend", "threshold_status", "management_actions"]
      : ["fpyr_trend", "defect_breakdown", "equipment_correlation", "root_cause_clues"],
  };
}

function isSkippedMetricResult(result: MetricQueryResult) {
  return String(result.queryAuditId).startsWith("skipped-");
}

function extractResponsesOutputText(payload: unknown): string | undefined {
  const output = (payload as { output?: Array<{ type?: string; content?: Array<{ text?: string }> }> })
    ?.output;
  if (!Array.isArray(output)) return undefined;
  const text = output
    .flatMap((item) => (Array.isArray(item.content) ? item.content : []))
    .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

function extractChatCompletionsText(payload: unknown): string | undefined {
  const choices = (payload as { choices?: Array<{ message?: { content?: string } }> })?.choices;
  const text = choices
    ?.map((c) => c.message?.content?.trim() ?? "")
    .filter(Boolean)
    .join("\n");
  return text || undefined;
}

function mergePlaybookWithLlmSummary(
  playbookResult: {
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
  },
  openclawResult?: OpenClawCompatResult
) {
  if (!openclawResult) return playbookResult;
  const llmSummary = stripExecutionStatusFromLlmSummary(
    openclawResult.llmSummary
  );
  const executionStatus = openclawResult.executionStatus;
  if (!llmSummary && !executionStatus) {
    return playbookResult;
  }

  const enrichedKeyFindings = dedupeStrings([
    ...(executionStatus?.summary ? [executionStatus.summary] : []),
    ...(llmSummary?.keyFindings ?? []),
    ...(llmSummary?.riskSignals ?? []),
    ...playbookResult.keyFindings,
  ]).slice(0, 8);

  const llmInsights = llmSummary
    ? [
        {
          id: "insight-orchestrator-llm-summary",
          content: llmSummary.insight,
          source: "hybrid" as const,
          sourceRefs: ["ref-orchestrator-llm"],
        },
        {
          id: "insight-orchestrator-llm-risks",
          content: formatInsightMarkdown("风险信号", llmSummary.riskSignals),
          source: "hybrid" as const,
          sourceRefs: ["ref-orchestrator-llm"],
        },
        {
          id: "insight-orchestrator-llm-actions",
          content: formatInsightMarkdown("建议动作", llmSummary.recommendedActions),
          source: "hybrid" as const,
          sourceRefs: ["ref-orchestrator-llm"],
        },
        {
          id: "insight-orchestrator-llm-questions",
          content: formatInsightMarkdown("下一步追问", llmSummary.nextQuestions),
          source: "hybrid" as const,
          sourceRefs: ["ref-orchestrator-llm"],
        },
      ].filter((item) => removeMarkdownMarkers(item.content).length > 0)
    : [];

  const executionInsights = executionStatus
    ? [
        {
          id: "insight-orchestrator-status-summary",
          content: executionStatus.summary,
          source: "hybrid" as const,
          sourceRefs: ["ref-orchestrator-status"],
        },
        {
          id: "insight-orchestrator-status-details",
          content: formatInsightMarkdown("执行与数据状态", executionStatus.details),
          source: "hybrid" as const,
          sourceRefs: ["ref-orchestrator-status"],
        },
      ].filter((item) => removeMarkdownMarkers(item.content).length > 0)
    : [];

  return {
    ...playbookResult,
    headline: llmSummary?.headline || playbookResult.headline,
    keyFindings: enrichedKeyFindings,
    insights: [...executionInsights, ...llmInsights, ...playbookResult.insights],
  };
}

type LlmStructuredSummary = {
  headline: string;
  keyFindings: string[];
  insight: string;
  riskSignals: string[];
  recommendedActions: string[];
  nextQuestions: string[];
};

type OpenClawExecutionStatus = {
  summary: string;
  details: string[];
};

type OpenClawCompatResult = {
  rawText?: string;
  llmSummary?: LlmStructuredSummary;
  executionStatus?: OpenClawExecutionStatus;
};

async function withServiceGate<T>(
  task: Task,
  gate: ServiceConcurrencyGate,
  fn: () => Promise<T>
) {
  const waitedMs = await gate.acquire(asString(task.input.tenantId, "tenant-demo"));
  if (waitedMs > 0) {
    await insertTaskEvent(task.taskId, task.traceId, "service_concurrency_wait", {
      service: gate.name,
      waitedMs,
    });
  }
  try {
    assertTaskWithinExecutionBudget(task, `${gate.name}_acquired`);
    return await fn();
  } finally {
    gate.release(asString(task.input.tenantId, "tenant-demo"));
  }
}

async function fetchWithTimeout(
  task: Task,
  serviceName: string,
  url: string,
  init: RequestInit,
  timeoutMs: number
) {
  assertTaskWithinExecutionBudget(task, `${serviceName}_request_start`);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      await insertTaskEvent(task.taskId, task.traceId, "service_timeout", {
        service: serviceName,
        timeoutMs,
      });
      throw new Error(`${serviceName} 请求超时（${timeoutMs}ms）`);
    }
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`${serviceName}: ${msg}`);
  } finally {
    clearTimeout(timer);
  }
}

function assertTaskWithinExecutionBudget(task: Task, stage: string) {
  const startedAt = "processingStartedAt" in task ? task.processingStartedAt : undefined;
  if (typeof startedAt !== "string" || startedAt.length === 0) {
    return;
  }
  const elapsedMs = Date.now() - Date.parse(startedAt);
  if (elapsedMs > TASK_EXECUTION_TIMEOUT_MS) {
    throw new Error(
      `任务执行超时：已超过 ${TASK_EXECUTION_TIMEOUT_MS}ms（stage=${stage}）`
    );
  }
}

function createRequestFingerprint(input: Record<string, unknown>) {
  return stableStringify({
    fingerprintVersion: "v2-orchestrator-refs",
    tenantId: asString(input.tenantId, "tenant-demo"),
    orgId: asString(input.orgId, "org-demo"),
    siteId: asString(input.siteId, "site-A01"),
    orchestratorMode: resolveOrchestratorMode(input),
    skillKey: resolveSkillKeyFromInput(input),
    analysisType: asString(input.analysisType, "first_pass_yield_monitoring"),
    playbookVersion: asString(input.playbookVersion, "quality-fpyr-v1"),
    reportTemplateVersion: asString(input.reportTemplateVersion, "fpyr-demo-v1"),
    timeRange: normalizeTimeRange(input.timeRange),
    inputParams:
      input.inputParams && typeof input.inputParams === "object"
        ? input.inputParams
        : {},
  });
}

function resolveOrchestratorMode(input: Record<string, unknown>): OrchestratorMode {
  const raw = input.orchestratorMode;
  if (raw === "openclaw" || raw === "hermes") {
    return raw;
  }
  return DEFAULT_ORCHESTRATOR_MODE;
}

function createMetricQueryCacheKey(query: MetricQuery) {
  return stableStringify({
    ...query,
    auditContext:
      query.auditContext && typeof query.auditContext === "object"
        ? {
            ...query.auditContext,
            traceId: undefined,
            actorId: undefined,
          }
        : undefined,
    queryReason: undefined,
  });
}

function cloneStructuredReportForTask(
  report: StructuredReport,
  task: Task,
  reusedFromTaskId?: string
) {
  const cloned = JSON.parse(JSON.stringify(report)) as StructuredReport & {
    reportMeta: Record<string, unknown>;
    sourceRefs: Array<Record<string, unknown>>;
    auditTrail: Array<Record<string, unknown>>;
  };
  const now = new Date().toISOString();
  const reportId = `rpt-fpyr-${Date.now()}`;
  cloned.reportMeta = {
    ...cloned.reportMeta,
    traceId: task.traceId,
    reportId,
    generatedAt: now,
    tenantId: asString(task.input.tenantId, "tenant-demo"),
    orgId: asString(task.input.orgId, "org-demo"),
    siteId: asString(task.input.siteId, "site-A01"),
    analysisType: asString(task.input.analysisType, "first_pass_yield_monitoring"),
    reportTemplateVersion: asString(task.input.reportTemplateVersion, "fpyr-demo-v1"),
    playbookVersion: asString(task.input.playbookVersion, "quality-fpyr-v1"),
  };
  cloned.sourceRefs = cloned.sourceRefs.map((ref) => ({
    ...ref,
    traceId: task.traceId,
  }));
  cloned.auditTrail = [
    {
      traceId: task.traceId,
      service: "BFF",
      action: "report_reused",
      startedAt: now,
      finishedAt: now,
      status: "success",
      summary: reusedFromTaskId
        ? `复用最近一次相同条件任务 ${reusedFromTaskId} 的结构化结果`
        : "复用最近一次相同条件任务的结构化结果",
    },
    ...cloned.auditTrail.map((entry) => ({
      ...entry,
      traceId: task.traceId,
    })),
  ];
  return cloned as StructuredReport;
}

function dedupeStrings(items: string[]) {
  return Array.from(new Set(items));
}

function truncateText(text: string, maxLen: number) {
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen - 1)}...`;
}

function formatInsightMarkdown(title: string, items: string[]) {
  const cleaned = dedupeStrings(
    items
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => !isMarkdownHeadingLine(v))
  ).slice(0, 4);
  if (cleaned.length === 0) {
    return "";
  }
  return `**${title}**\n${cleaned.map((line) => `- ${line}`).join("\n")}`;
}

function buildOpenClawExecutionStatus(
  rawText?: string,
  llmSummary?: LlmStructuredSummary
): OpenClawExecutionStatus | undefined {
  const details = dedupeStrings([
    ...extractExecutionStatusLinesFromSummary(llmSummary),
    ...extractExecutionStatusLinesFromRaw(rawText),
  ]).slice(0, 8);

  if (details.length === 0) {
    return undefined;
  }

  const summary =
    rawText?.includes("No response from OpenClaw.") ||
    /request timed out|timed out before a response was generated/i.test(
      rawText ?? ""
    )
      ? "外部 OpenClaw 本轮未在时限内返回可解析总结，当前报告仅展示规则与指标结果。"
      : details.some((line) => /未调用|未完整执行|失败|failed|timed out/i.test(line))
      ? "本轮外部 OpenClaw 工具链未完整执行，以下为执行与数据状态说明。"
      : "本轮外部 OpenClaw 返回了执行过程或数据完备性说明，以下内容仅用于解释执行状态。";

  return { summary, details };
}

function extractExecutionStatusLinesFromSummary(
  llmSummary?: LlmStructuredSummary
) {
  if (!llmSummary) {
    return [];
  }

  return [
    llmSummary.headline,
    llmSummary.insight,
    ...llmSummary.keyFindings,
    ...llmSummary.riskSignals,
    ...llmSummary.recommendedActions,
    ...llmSummary.nextQuestions,
  ]
    .filter(Boolean)
    .map((line) => line.trim())
    .filter(looksLikeExecutionStatusLine)
    .map((line) => truncateText(line, 180));
}

function extractExecutionStatusLinesFromRaw(rawText?: string) {
  if (!rawText) {
    return [];
  }

  if (rawText.includes("No response from OpenClaw.")) {
    return ["外部 OpenClaw 未返回可解析总结文本。"];
  }
  if (
    /request timed out|timed out before a response was generated/i.test(rawText)
  ) {
    return ["外部 OpenClaw 模型总结超时，本轮仅保留规则与指标结果。"];
  }

  return rawText
    .split(/\n+/)
    .map((line) => line.replace(/^[*-]\s*/, "").trim())
    .filter(Boolean)
    .filter(
      (line) =>
        looksLikeExecutionStatusLine(line) || looksLikeProcessNarrationLine(line)
    )
    .map((line) => truncateText(line, 180));
}

function isMarkdownHeadingLine(line: string) {
  const plain = removeMarkdownMarkers(line);
  return /：$|:$/.test(plain) && plain.length <= 20;
}

function looksLikeExecutionStatusLine(line: string) {
  const plain = removeMarkdownMarkers(line).toLowerCase();
  return /(未调用|无法评估|待查询|未获取|未返回|未完整执行|缺少可用|功能问题|演示调用|工具链|接入|failed|no response from openclaw|request timed out|timed out before a response was generated|超时|待确认|输入参数已接收|执行状态|数据完备|稳定回传|查询失败|未成功)/i.test(
    plain
  );
}

function looksLikeProcessNarrationLine(line: string) {
  const plain = removeMarkdownMarkers(line);
  return /(执行.*任务|并行查询|运行 playbook|生成诊断|数据已返回|现在运行)/i.test(
    plain
  );
}

function removeMarkdownMarkers(line: string) {
  return line
    .replace(/[*_`#>-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseLlmStructuredSummary(raw?: string): LlmStructuredSummary | undefined {
  if (!raw) return undefined;
  const candidate = extractJsonObject(raw);
  if (!candidate) return undefined;
  try {
    const parsed = JSON.parse(candidate) as {
      headline?: unknown;
      keyFindings?: unknown;
      insight?: unknown;
      riskSignals?: unknown;
      recommendedActions?: unknown;
      nextQuestions?: unknown;
    };
    const headline =
      typeof parsed.headline === "string" ? parsed.headline.trim() : "";
    const rawInsight =
      typeof parsed.insight === "string" ? parsed.insight.trim() : "";
    const keyFindings = toCleanStringArray(parsed.keyFindings);
    const riskSignals = toCleanStringArray(parsed.riskSignals);
    const recommendedActions = toCleanStringArray(parsed.recommendedActions);
    const nextQuestions = toCleanStringArray(parsed.nextQuestions);
    const filteredKeyFindings = keyFindings.filter(
      (v) => removeMarkdownMarkers(v) !== removeMarkdownMarkers(headline)
    );
    const insightCandidates = [
      rawInsight,
      recommendedActions[0],
      riskSignals[0],
      filteredKeyFindings.find((v) => /建议|应|可|优先|需要/.test(v)),
      filteredKeyFindings[0],
      headline,
    ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);
    const insight = insightCandidates[0] ?? headline;
    if (!headline || filteredKeyFindings.length === 0) {
      return undefined;
    }
    return {
      headline,
      keyFindings: filteredKeyFindings.slice(0, 5),
      insight,
      riskSignals: riskSignals.slice(0, 3),
      recommendedActions: recommendedActions.slice(0, 4),
      nextQuestions: nextQuestions.slice(0, 3),
    };
  } catch {
    return undefined;
  }
}

function stripExecutionStatusFromLlmSummary(
  llmSummary?: LlmStructuredSummary
): LlmStructuredSummary | undefined {
  if (!llmSummary) {
    return undefined;
  }

  const headline = looksLikeExecutionStatusLine(llmSummary.headline)
    ? ""
    : llmSummary.headline;
  const keyFindings = llmSummary.keyFindings.filter(
    (line) => !looksLikeExecutionStatusLine(line)
  );
  const riskSignals = llmSummary.riskSignals.filter(
    (line) => !looksLikeExecutionStatusLine(line)
  );
  const recommendedActions = llmSummary.recommendedActions.filter(
    (line) => !looksLikeExecutionStatusLine(line)
  );
  const nextQuestions = llmSummary.nextQuestions.filter(
    (line) => !looksLikeExecutionStatusLine(line)
  );
  const insightCandidates = [
    llmSummary.insight,
    recommendedActions[0],
    riskSignals[0],
    keyFindings.find((v) => /建议|应|可|优先|需要/.test(v)),
    keyFindings[0],
    headline,
  ].filter((v): v is string => typeof v === "string" && v.trim().length > 0);

  if (
    !headline &&
    keyFindings.length === 0 &&
    riskSignals.length === 0 &&
    recommendedActions.length === 0 &&
    nextQuestions.length === 0
  ) {
    return undefined;
  }

  return {
    headline,
    keyFindings,
    insight: insightCandidates[0] ?? headline,
    riskSignals,
    recommendedActions,
    nextQuestions,
  };
}

function toCleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return dedupeStrings(
    value
      .filter((v): v is string => typeof v === "string")
      .map((v) => v.trim())
      .filter(Boolean)
      .filter((v) => !isMarkdownHeadingLine(v))
      .map((v) => truncateText(v, 180))
  );
}

function extractJsonObject(text: string): string | undefined {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)?.[1];
  if (fenced) {
    return fenced.trim();
  }
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return text.slice(start, end + 1).trim();
  }
  return undefined;
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

function setStepStatus(
  task: Task,
  stepIndex: number,
  status: StepStatus["status"]
) {
  task.steps[stepIndex].status = status;
  task.progress = Math.round(
    (task.steps.filter((step) => step.status === "completed").length /
      STEPS.length) *
      100
  );
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toDisplayString(value: unknown) {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === "string") {
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return Object.prototype.toString.call(value);
  }
}

function toBoolean(value: string | undefined) {
  return value === "true" || value === "1";
}

async function safeParseJson(response: Response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class OpenClawSkillUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenClawSkillUnavailableError";
  }
}

function ensureOpenClawSkillAvailable(skillKey: string) {
  const workspaceDir = resolveOpenClawWorkspaceDir();
  const skillFile = path.join(workspaceDir, "skills", skillKey, "SKILL.md");
  if (!fs.existsSync(skillFile)) {
    throw new OpenClawSkillUnavailableError(
      `OpenClaw Skill 不存在：${skillKey}。期望路径：${skillFile}`
    );
  }

  const config = readOpenClawConfig();
  const entry = config?.skills?.entries?.[skillKey];
  if (entry?.enabled === false) {
    throw new OpenClawSkillUnavailableError(
      `OpenClaw Skill 已被禁用：${skillKey}。请检查 ~/.openclaw/openclaw.json 的 skills.entries.${skillKey}.enabled`
    );
  }

  const defaultSkills = config?.agents?.defaults?.skills;
  if (
    Array.isArray(defaultSkills) &&
    defaultSkills.length > 0 &&
    !defaultSkills.includes(skillKey)
  ) {
    throw new OpenClawSkillUnavailableError(
      `OpenClaw agent 默认技能白名单未包含：${skillKey}`
    );
  }
}

function resolveOpenClawWorkspaceDir() {
  const fromEnv = process.env.OPENCLAW_WORKSPACE_DIR?.trim();
  if (fromEnv) {
    return fromEnv;
  }
  const config = readOpenClawConfig();
  const configured = config?.agents?.defaults?.workspace;
  if (typeof configured === "string" && configured.trim().length > 0) {
    return configured;
  }
  return path.join(os.homedir(), ".openclaw", "workspace");
}

function readOpenClawConfig():
  | {
      skills?: { entries?: Record<string, { enabled?: boolean }> };
      agents?: { defaults?: { workspace?: string; skills?: string[] } };
    }
  | undefined {
  const configPath = path.join(os.homedir(), ".openclaw", "openclaw.json");
  try {
    if (!fs.existsSync(configPath)) {
      return undefined;
    }
    return JSON.parse(fs.readFileSync(configPath, "utf8")) as {
      skills?: { entries?: Record<string, { enabled?: boolean }> };
      agents?: { defaults?: { workspace?: string; skills?: string[] } };
    };
  } catch {
    return undefined;
  }
}

function resolveSkillKeyFromInput(input: Record<string, unknown>): string {
  const raw = input.skillKey;
  if (typeof raw === "string" && raw.trim().length > 0) {
    return raw.trim();
  }
  const at = asString(input.analysisType, "first_pass_yield_monitoring");
  if (at === "first_pass_yield_trend_brief") {
    return "quality_fpyr_trend_brief";
  }
  return "quality_first_pass_yield";
}

function normalizeTaskPayload(body: Record<string, unknown>): Record<string, unknown> {
  const orchestratorMode = resolveOrchestratorMode(body);
  if (
    body.orchestratorMode !== undefined &&
    body.orchestratorMode !== "openclaw" &&
    body.orchestratorMode !== "hermes"
  ) {
    const modeText = toDisplayString(body.orchestratorMode);
    throw new Error(
      `orchestratorMode 仅支持「openclaw | hermes」，当前为「${modeText}」`
    );
  }
  const skillKey = resolveSkillKeyFromInput(body);
  const expectedAnalysis = SKILL_ANALYSIS_PAIRS[skillKey];
  if (!expectedAnalysis) {
    throw new Error(`未知 skillKey: ${skillKey}`);
  }
  const analysisType = asString(body.analysisType, expectedAnalysis);
  if (analysisType !== expectedAnalysis) {
    throw new Error(
      `skillKey「${skillKey}」须配合 analysisType「${expectedAnalysis}」，当前为「${analysisType}」`
    );
  }
  return { ...body, skillKey, analysisType, orchestratorMode };
}

function isTrendBriefTask(input: Record<string, unknown>) {
  return (
    asString(input.analysisType, "") === "first_pass_yield_trend_brief"
  );
}

function emptySkippedMetricResult(suffix: string): MetricQueryResult {
  const now = new Date().toISOString();
  return {
    queryAuditId: `audit-skipped-${suffix}`,
    requestedAt: now,
    sourceSystem: "bff",
    dataTimestamp: now,
    metricDefinitions: [],
    rows: [],
  };
}

const PORT = process.env.PORT ?? 3001;
app.listen(PORT, () => {
  console.log(`BFF running on http://localhost:${PORT}`);
});
