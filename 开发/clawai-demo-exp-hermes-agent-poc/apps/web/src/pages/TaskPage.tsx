import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getTask, type TaskStatus } from "../api";

const STEP_ICONS: Record<string, string> = {
  data_collection: "📥",
  anomaly_detection: "🔍",
  correlation_analysis: "🔗",
  report_generation: "📄",
};

function resolveSkillMeta(task: TaskStatus) {
  const raw = task.input?.skillKey;
  const skillKey =
    typeof raw === "string" && raw.trim().length > 0
      ? raw
      : "quality_first_pass_yield";
  const skillLabel =
    skillKey === "quality_fpyr_trend_brief"
      ? "趋势简报智能体"
      : "全量监控诊断智能体";
  return { skillKey, skillLabel };
}

function ExecutionRouteBadge({ task }: { task: TaskStatus }) {
  const route = task.executionRoute;
  const label =
    route === "openclaw_external"
      ? "外部 OpenClaw"
      : route === "hermes_external"
      ? "Hermes Agent"
      : route === "openclaw_local"
      ? "本地 OpenClaw"
      : route === "direct_fallback"
      ? "直连链路（降级）"
      : route === "direct"
      ? "直连链路"
      : "链路待识别";
  const className =
    route === "openclaw_external"
      ? "bg-emerald-100 text-emerald-700"
      : route === "hermes_external"
      ? "bg-violet-100 text-violet-700"
      : route === "openclaw_local"
      ? "bg-blue-100 text-blue-700"
      : route === "direct_fallback"
      ? "bg-amber-100 text-amber-800"
      : "bg-slate-100 text-slate-600";
  return (
    <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${className}`}>
      {label}
    </span>
  );
}

function StepRow({
  step,
  isLast,
}: {
  step: TaskStatus["steps"][0];
  isLast: boolean;
}) {
  const { status } = step;
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div
          className={`w-9 h-9 rounded-full flex items-center justify-center text-base shrink-0 transition-all ${
            status === "completed"
              ? "bg-green-100 text-green-600"
              : status === "running"
              ? "bg-blue-100 text-blue-600 ring-2 ring-blue-300 ring-offset-1"
              : "bg-slate-100 text-slate-400"
          }`}
        >
          {status === "running" ? (
            <span className="inline-block w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          ) : status === "completed" ? (
            "✓"
          ) : (
            STEP_ICONS[step.key] ?? "·"
          )}
        </div>
        {!isLast && (
          <div
            className={`w-0.5 h-8 mt-1 ${
              status === "completed" ? "bg-green-300" : "bg-slate-200"
            }`}
          />
        )}
      </div>
      <div className="pb-8">
        <p
          className={`font-medium text-sm ${
            status === "completed"
              ? "text-green-700"
              : status === "running"
              ? "text-blue-700"
              : "text-slate-400"
          }`}
        >
          {step.label}
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          {status === "completed"
            ? "完成"
            : status === "running"
            ? "处理中..."
            : "等待中"}
        </p>
      </div>
    </div>
  );
}

export default function TaskPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskStatus | null>(null);
  const [error, setError] = useState("");
  const skillMeta = task ? resolveSkillMeta(task) : null;

  useEffect(() => {
    if (!taskId) return;

    let stopped = false;

    async function poll() {
      if (stopped || !taskId) return;
      try {
        const t = await getTask(taskId);
        setTask(t);
        if (t.status === "completed") {
          setTimeout(() => navigate(`/reports/${taskId}`), 800);
          return;
        }
        if (t.status === "failed") {
          setError(t.errorMessage ?? "分析任务失败，请重新发起");
          return;
        }
        setTimeout(poll, 1000);
      } catch {
        setError("无法连接到服务，请检查 BFF 是否启动");
      }
    }

    poll();
    return () => {
      stopped = true;
    };
  }, [taskId, navigate]);

  return (
    <div className="max-w-lg mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-800">正在分析</h1>
        <p className="mt-1 text-sm text-slate-500">
          {task?.status === "accepted"
            ? "任务已进入调度队列，系统会按租户与全局并发限制自动拉起 worker。"
            : "在线一次校验合格率管控 · 全景数据分析师正在处理数据"}
        </p>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        {task?.executionDegraded && task.degradedNotice ? (
          <div
            className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900"
            role="alert"
          >
            <p className="font-semibold text-amber-800">已切换备用分析链路</p>
            <p className="mt-1 leading-relaxed">{task.degradedNotice}</p>
            {task.degradedDetail ? (
              <details className="mt-2 text-xs text-amber-800/90">
                <summary className="cursor-pointer select-none hover:underline">
                  技术详情
                </summary>
                <p className="mt-1 font-mono break-all text-amber-900/80">
                  {task.degradedDetail}
                </p>
              </details>
            ) : null}
          </div>
        ) : null}
        {error ? (
          <div className="text-center py-8">
            <p className="text-red-500 font-medium">{error}</p>
            <button
              onClick={() => navigate("/wizard")}
              className="mt-4 text-sm text-blue-600 hover:underline"
            >
              返回重新发起
            </button>
          </div>
        ) : task ? (
          <>
            {task.queueMessage ? (
              <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                <p className="font-medium text-slate-800">
                  {task.status === "accepted" ? "任务排队中" : "运行状态"}
                </p>
                <p className="mt-1 leading-relaxed">{task.queueMessage}</p>
                {typeof task.queuePosition === "number" ? (
                  <p className="mt-1 text-xs text-slate-500">
                    当前队列位置：第 {task.queuePosition} 位
                  </p>
                ) : null}
              </div>
            ) : null}
            {task.resultSource === "report_cache" ? (
              <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                <p className="font-medium">命中相同条件结果复用</p>
                <p className="mt-1 leading-relaxed">
                  本次任务复用了近期相同条件的结构化结果，避免重复调用 OpenClaw 与下游服务。
                  {task.reusedFromTaskId
                    ? ` 来源任务：${task.reusedFromTaskId}`
                    : ""}
                </p>
              </div>
            ) : null}
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs text-slate-500 font-mono">
                  traceId: {task.traceId}
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  智能体: {skillMeta?.skillLabel} ({skillMeta?.skillKey})
                </p>
              </div>
              <div className="flex items-center gap-2">
                <ExecutionRouteBadge task={task} />
                <span
                  className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                    task.status === "completed"
                      ? "bg-green-100 text-green-700"
                      : task.status === "running"
                      ? "bg-blue-100 text-blue-700"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {task.status === "completed"
                    ? "已完成"
                    : task.status === "running"
                    ? "处理中"
                    : "排队中"}
                </span>
              </div>
            </div>

            <div className="mb-5">
              <div className="flex justify-between text-xs text-slate-500 mb-1">
                <span>整体进度</span>
                <span>{task.progress}%</span>
              </div>
              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-500 rounded-full transition-all duration-500"
                  style={{ width: `${task.progress}%` }}
                />
              </div>
            </div>

            <div className="mt-6">
              {task.steps.map((step, i) => (
                <StepRow
                  key={step.key}
                  step={step}
                  isLast={i === task.steps.length - 1}
                />
              ))}
            </div>

            {task.status === "completed" && (
              <div className="text-center text-sm text-green-600 font-medium animate-pulse">
                报告已生成，正在跳转...
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-12 text-slate-400">
            <div className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mb-3" />
            <p className="text-sm">正在连接...</p>
          </div>
        )}
      </div>
    </div>
  );
}
