const BASE = import.meta.env.VITE_API_BASE_URL ?? "/api";

export interface TaskAccepted {
  taskId: string;
  traceId: string;
  status: "accepted";
}

export interface StepStatus {
  key: string;
  label: string;
  status: "pending" | "running" | "completed" | "failed";
}

export interface TaskStatus {
  taskId: string;
  traceId: string;
  status: "accepted" | "running" | "completed" | "failed";
  progress: number;
  steps: StepStatus[];
  input?: Record<string, unknown>;
  reportId?: string;
  createdAt: string;
  completedAt?: string;
  errorMessage?: string;
  /** OpenClaw 主路径失败且已改用备路径时为 true */
  executionDegraded?: boolean;
  /** 用户可见的降级说明 */
  degradedNotice?: string;
  /** 可选：供展开的简要技术原因 */
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
}

export async function createTask(
  params: Record<string, unknown>
): Promise<TaskAccepted> {
  let res: Response;
  try {
    res = await fetch(`${BASE}/tasks`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
    });
  } catch {
    throw new Error(
      "网络请求失败（常见：未启动 BFF、端口不是 3001，或 VITE_API_BASE_URL 配置错误）"
    );
  }

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }

  if (!res.ok) {
    const errMsg =
      body &&
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${res.status} ${res.statusText || "创建任务失败"}`;
    throw new Error(errMsg);
  }

  return body as TaskAccepted;
}

export async function getTask(taskId: string): Promise<TaskStatus> {
  const res = await fetch(`${BASE}/tasks/${taskId}`);
  if (!res.ok) throw new Error("Task not found");
  return res.json();
}

export async function getReport(taskId: string): Promise<unknown> {
  const res = await fetch(`${BASE}/reports/${taskId}`);
  if (!res.ok) throw new Error("Report not ready");
  return res.json();
}

const CLEAR_CONFIRM = "DELETE_ALL_DEMO_REPORTS";

/** Demo：清空库内全部任务与报告及 BFF 复用缓存（需无进行中任务） */
export async function clearDemoReports(): Promise<{ ok: boolean; message: string }> {
  const res = await fetch(`${BASE}/demo/clear-reports`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: CLEAR_CONFIRM }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!res.ok) {
    const errMsg =
      body &&
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `${res.status} 清空失败`;
    throw new Error(errMsg);
  }
  return body as { ok: boolean; message: string };
}
