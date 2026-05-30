import "./load-env";
import mysql from "mysql2/promise";

export interface StepStatus {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface TaskSnapshot {
  taskId: string;
  traceId: string;
  status: "accepted" | "running" | "completed" | "failed";
  progress: number;
  steps: StepStatus[];
  reportId?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  /** 主路径（如 OpenClaw 编排）失败并已改用备路径时为 true */
  executionDegraded?: boolean;
  /** 给终端用户看的明确说明 */
  degradedNotice?: string;
  /** 可选：供排查的简要错误信息 */
  degradedDetail?: string;
  /** 执行链路来源标识 */
  executionRoute?:
    | "openclaw_external"
    | "openclaw_local"
    | "hermes_external"
    | "direct"
    | "direct_fallback";
  queuePosition?: number;
  queueMessage?: string;
  resultSource?: "fresh" | "report_cache";
  reusedFromTaskId?: string;
  sessionPolicy?: "task_isolated" | "follow_up_session";
  input: Record<string, unknown>;
}

const pool = mysql.createPool({
  host: process.env.DB_HOST ?? "127.0.0.1",
  port: Number(process.env.DB_PORT ?? 3306),
  user: process.env.DB_USER ?? "root",
  password: process.env.DB_PASSWORD ?? "",
  database: process.env.APP_DB_NAME ?? "ce_agent_demo",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  charset: "utf8mb4",
  dateStrings: true,
});

export async function createTaskRecord(task: TaskSnapshot) {
  await pool.execute(
    `
      INSERT INTO analysis_task (
        task_id,
        trace_id,
        analysis_type,
        status,
        current_step,
        progress,
        input_payload,
        context_payload,
        error_message,
        requested_by,
        tenant_id,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3))
    `,
    [
      task.taskId,
      task.traceId,
      asString(task.input.analysisType, "first_pass_yield_monitoring"),
      task.status,
      getCurrentStep(task.steps),
      task.progress,
      JSON.stringify(task.input),
      JSON.stringify(buildContextPayload(task)),
      task.errorMessage ?? null,
      "user-001",
      asString(task.input.tenantId, "tenant-demo"),
      toMysqlDateTime(task.createdAt),
    ]
  );
}

export async function updateTaskRecord(task: TaskSnapshot) {
  await pool.execute(
    `
      UPDATE analysis_task
      SET
        status = ?,
        current_step = ?,
        progress = ?,
        context_payload = ?,
        error_message = ?,
        started_at = CASE
          WHEN ? = 'running' AND started_at IS NULL THEN NOW(3)
          ELSE started_at
        END,
        completed_at = CASE
          WHEN ? IN ('completed', 'failed') THEN ?
          ELSE completed_at
        END,
        updated_at = NOW(3)
      WHERE task_id = ?
    `,
    [
      task.status,
      getCurrentStep(task.steps),
      task.progress,
      JSON.stringify(buildContextPayload(task)),
      task.errorMessage ?? null,
      task.status,
      task.status,
      task.completedAt ? toMysqlDateTime(task.completedAt) : null,
      task.taskId,
    ]
  );
}

export async function insertTaskEvent(
  taskId: string,
  traceId: string,
  eventType: string,
  eventPayload: Record<string, unknown>
) {
  await pool.execute(
    `
      INSERT INTO analysis_task_event (
        task_id,
        trace_id,
        event_type,
        event_payload,
        created_at
      ) VALUES (?, ?, ?, ?, NOW(3))
    `,
    [taskId, traceId, eventType, JSON.stringify(eventPayload)]
  );
}

export async function saveReport(
  task: TaskSnapshot,
  report: unknown,
  reportId: string,
  templateVersion: string
) {
  await pool.execute(
    `
      INSERT INTO structured_report (
        report_id,
        task_id,
        trace_id,
        analysis_type,
        template_version,
        report_payload,
        source_refs,
        audit_trail,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))
      ON DUPLICATE KEY UPDATE
        report_payload = VALUES(report_payload),
        source_refs = VALUES(source_refs),
        audit_trail = VALUES(audit_trail),
        updated_at = NOW(3)
    `,
    [
      reportId,
      task.taskId,
      task.traceId,
      asString(task.input.analysisType, "first_pass_yield_monitoring"),
      templateVersion,
      JSON.stringify(report),
      JSON.stringify((report as { sourceRefs?: unknown }).sourceRefs ?? []),
      JSON.stringify((report as { auditTrail?: unknown }).auditTrail ?? []),
    ]
  );
}

export async function getTaskRecord(taskId: string): Promise<TaskSnapshot | null> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        task_id,
        trace_id,
        status,
        progress,
        context_payload,
        input_payload,
        error_message,
        created_at,
        completed_at
      FROM analysis_task
      WHERE task_id = ?
      LIMIT 1
    `,
    [taskId]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  const contextPayload = parseJson<Record<string, unknown>>(row.context_payload, {});
  const inputPayload = parseJson<Record<string, unknown>>(row.input_payload, {});

  return {
    taskId: String(row.task_id),
    traceId: String(row.trace_id),
    status: row.status as TaskSnapshot["status"],
    progress: Number(row.progress ?? 0),
    steps: (contextPayload.steps as StepStatus[] | undefined) ?? [],
    reportId:
      typeof contextPayload.reportId === "string"
        ? contextPayload.reportId
        : undefined,
    createdAt: new Date(String(row.created_at)).toISOString(),
    completedAt: row.completed_at
      ? new Date(String(row.completed_at)).toISOString()
      : undefined,
    errorMessage:
      typeof row.error_message === "string" ? row.error_message : undefined,
    executionDegraded: contextPayload.executionDegraded === true,
    degradedNotice:
      typeof contextPayload.degradedNotice === "string"
        ? contextPayload.degradedNotice
        : undefined,
    degradedDetail:
      typeof contextPayload.degradedDetail === "string"
        ? contextPayload.degradedDetail
        : undefined,
    executionRoute:
      contextPayload.executionRoute === "openclaw_external" ||
      contextPayload.executionRoute === "openclaw_local" ||
      contextPayload.executionRoute === "hermes_external" ||
      contextPayload.executionRoute === "direct" ||
      contextPayload.executionRoute === "direct_fallback"
        ? contextPayload.executionRoute
        : undefined,
    queuePosition:
      typeof contextPayload.queuePosition === "number"
        ? contextPayload.queuePosition
        : undefined,
    queueMessage:
      typeof contextPayload.queueMessage === "string"
        ? contextPayload.queueMessage
        : undefined,
    resultSource:
      contextPayload.resultSource === "fresh" ||
      contextPayload.resultSource === "report_cache"
        ? contextPayload.resultSource
        : undefined,
    reusedFromTaskId:
      typeof contextPayload.reusedFromTaskId === "string"
        ? contextPayload.reusedFromTaskId
        : undefined,
    sessionPolicy:
      contextPayload.sessionPolicy === "follow_up_session"
        ? "follow_up_session"
        : contextPayload.sessionPolicy === "task_isolated"
          ? "task_isolated"
          : undefined,
    input: inputPayload,
  };
}

export async function getReportByTaskId(taskId: string) {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT report_payload
      FROM structured_report
      WHERE task_id = ?
      LIMIT 1
    `,
    [taskId]
  );

  const row = rows[0];
  if (!row) {
    return null;
  }

  return parseJson<unknown>(row.report_payload, null);
}

export interface ReusableTaskCandidate {
  taskId: string;
  traceId: string;
  input: Record<string, unknown>;
  completedAt?: string;
  executionRoute?:
    | "openclaw_external"
    | "openclaw_local"
    | "hermes_external"
    | "direct"
    | "direct_fallback";
}

export async function listRecentCompletedTasks(
  tenantId: string,
  analysisType: string,
  limit: number
): Promise<ReusableTaskCandidate[]> {
  const [rows] = await pool.query<mysql.RowDataPacket[]>(
    `
      SELECT
        task_id,
        trace_id,
        input_payload,
        context_payload,
        completed_at
      FROM analysis_task
      WHERE tenant_id = ?
        AND analysis_type = ?
        AND status = 'completed'
      ORDER BY completed_at DESC
      LIMIT ?
    `,
    [tenantId, analysisType, limit]
  );

  return rows.map((row) => {
    const contextPayload = parseJson<Record<string, unknown>>(row.context_payload, {});
    const executionRoute =
      contextPayload.executionRoute === "openclaw_external" ||
      contextPayload.executionRoute === "openclaw_local" ||
      contextPayload.executionRoute === "hermes_external" ||
      contextPayload.executionRoute === "direct" ||
      contextPayload.executionRoute === "direct_fallback"
        ? (contextPayload.executionRoute as ReusableTaskCandidate["executionRoute"])
        : undefined;
    return {
      taskId: String(row.task_id),
      traceId: String(row.trace_id),
      input: parseJson<Record<string, unknown>>(row.input_payload, {}),
      completedAt: row.completed_at
        ? new Date(String(row.completed_at)).toISOString()
        : undefined,
      executionRoute,
    };
  });
}

function buildContextPayload(task: TaskSnapshot) {
  return {
    steps: task.steps,
    reportId: task.reportId ?? null,
    executionDegraded: task.executionDegraded ?? false,
    degradedNotice: task.degradedNotice ?? null,
    degradedDetail: task.degradedDetail ?? null,
    executionRoute: task.executionRoute ?? null,
    queuePosition: task.queuePosition ?? null,
    queueMessage: task.queueMessage ?? null,
    resultSource: task.resultSource ?? "fresh",
    reusedFromTaskId: task.reusedFromTaskId ?? null,
    sessionPolicy: task.sessionPolicy ?? "task_isolated",
  };
}

function getCurrentStep(steps: StepStatus[]) {
  const runningStep = steps.find((step) => step.status === "running");
  if (runningStep) {
    return runningStep.key;
  }

  const failedStep = steps.find((step) => step.status === "failed");
  if (failedStep) {
    return failedStep.key;
  }

  const completedSteps = steps.filter((step) => step.status === "completed");
  return completedSteps.at(-1)?.key ?? null;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (value && typeof value === "object") {
    return value as T;
  }

  if (typeof value !== "string") {
    return fallback;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function asString(value: unknown, fallback: string) {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function toMysqlDateTime(value: string) {
  return value.replace("T", " ").replace("Z", "").slice(0, 23);
}

/**
 * Demo：按外键顺序删除全部结构化报告、任务事件与分析任务。
 * `metric_query_audit` 等对 `task_id` 为 ON DELETE SET NULL，无需先删。
 */
export async function deleteAllDemoTasksAndReports() {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM structured_report");
    await conn.execute("DELETE FROM analysis_task_event");
    await conn.execute("DELETE FROM analysis_task");
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}
