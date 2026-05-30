import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { getReport, getTask, type TaskStatus } from "../api";
import type { StructuredReport, ReportSection } from "@ce-demo/report-schema";
import ReportRenderer from "../features/reporting/components/ReportRenderer";

function resolveSkillMeta(
  task: TaskStatus | null,
  report: StructuredReport | null
) {
  const fallbackByAnalysisType =
    report?.reportMeta.analysisType === "first_pass_yield_trend_brief"
      ? "quality_fpyr_trend_brief"
      : "quality_first_pass_yield";
  const skillKeyRaw = task?.input?.skillKey;
  const skillKey =
    typeof skillKeyRaw === "string" && skillKeyRaw.trim().length > 0
      ? skillKeyRaw
      : fallbackByAnalysisType;
  const skillLabel =
    skillKey === "quality_fpyr_trend_brief"
      ? "趋势简报智能体"
      : "全量监控诊断智能体";
  return { skillKey, skillLabel };
}

function ExecutionRouteBadge({
  route,
}: {
  route?:
    | "openclaw_external"
    | "openclaw_local"
    | "hermes_external"
    | "direct"
    | "direct_fallback";
}) {
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

function SectionNav({
  sections,
  activeId,
  onSelect,
}: {
  sections: ReportSection[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  return (
    <nav className="space-y-1">
      {sections.map((s) => (
        <button
          key={s.id}
          onClick={() => onSelect(s.id)}
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors ${
            activeId === s.id
              ? "bg-blue-50 text-blue-700 font-medium"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          {s.title}
        </button>
      ))}
    </nav>
  );
}

export default function ReportPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const navigate = useNavigate();
  const [report, setReport] = useState<StructuredReport | null>(null);
  const [taskMeta, setTaskMeta] = useState<TaskStatus | null>(null);
  const [activeSection, setActiveSection] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!taskId) return;
    Promise.all([getReport(taskId), getTask(taskId)])
      .then(([r, task]) => {
        const rep = r as StructuredReport;
        setReport(rep);
        setTaskMeta(task);
        if (rep.sections.length > 0) setActiveSection(rep.sections[0].id);
      })
      .catch(() => setError("无法加载报告，请返回重试"));
  }, [taskId]);

  if (error) {
    return (
      <div className="text-center py-20 text-slate-500">
        <p className="text-red-500">{error}</p>
        <button
          onClick={() => navigate("/wizard")}
          className="mt-4 text-sm text-blue-600 hover:underline"
        >
          返回向导
        </button>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="text-center py-20">
        <div className="inline-block w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const currentSection = report.sections.find((s) => s.id === activeSection);
  const skillMeta = resolveSkillMeta(taskMeta, report);
  const hasOpenClawLlmSummary = report.sourceRefs.some(
    (ref) =>
      ref.refId === "ref-openclaw-llm" || ref.refId === "ref-orchestrator-llm"
  );
  const hasOpenClawStatus = report.sourceRefs.some(
    (ref) =>
      ref.refId === "ref-openclaw-status" || ref.refId === "ref-orchestrator-status"
  );
  const showOpenClawSummaryNotice =
    taskMeta?.executionRoute === "openclaw_external" && !hasOpenClawLlmSummary;

  return (
    <div className="space-y-4">
      {taskMeta?.executionDegraded && taskMeta.degradedNotice ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
          role="alert"
        >
          <p className="font-semibold text-amber-800">已切换备用分析链路</p>
          <p className="mt-1 leading-relaxed">{taskMeta.degradedNotice}</p>
          {taskMeta.degradedDetail ? (
            <details className="mt-2 text-xs text-amber-800/90">
              <summary className="cursor-pointer select-none hover:underline">
                技术详情
              </summary>
              <p className="mt-1 font-mono break-all text-amber-900/80">
                {taskMeta.degradedDetail}
              </p>
            </details>
          ) : null}
        </div>
      ) : null}
      {showOpenClawSummaryNotice ? (
        <div
          className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900 shadow-sm"
          role="alert"
        >
          <p className="font-semibold text-amber-800">模型补充总结未生成</p>
          <p className="mt-1 leading-relaxed">
            本轮已走外部 OpenClaw，但模型总结未在时限内返回或未能解析，当前页面仅展示规则与指标结果。
            {hasOpenClawStatus ? " 可在“执行与数据状态”章节查看说明。" : ""}
          </p>
        </div>
      ) : null}
      {taskMeta?.resultSource === "report_cache" ? (
        <div
          className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-900 shadow-sm"
          role="status"
        >
          <p className="font-semibold text-emerald-800">已复用最近相同条件结果</p>
          <p className="mt-1 leading-relaxed">
            本次报告未重复调用完整分析链路，而是复用了近期相同条件的结构化结果。
            {taskMeta.reusedFromTaskId ? ` 来源任务：${taskMeta.reusedFromTaskId}` : ""}
          </p>
        </div>
      ) : null}
      {/* Report header */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-slate-800">
              {report.summary.title}
            </h1>
            {report.summary.subtitle && (
              <p className="text-sm text-slate-500 mt-0.5">
                {report.summary.subtitle}
              </p>
            )}
            <div className="mt-3 text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none">
              <ReactMarkdown>{report.summary.headline}</ReactMarkdown>
            </div>
          </div>
          <button
            onClick={() => navigate("/wizard")}
            className="shrink-0 text-sm text-blue-600 hover:underline"
          >
            发起新分析
          </button>
        </div>

        {/* Key findings */}
        <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="text-xs font-semibold text-amber-700 mb-2 uppercase tracking-wide">
            关键发现
          </p>
          <ul className="space-y-1.5">
            {report.summary.keyFindings.map((f, i) => (
              <li key={i} className="flex gap-2 text-sm text-amber-800">
                <span className="text-amber-500 shrink-0 mt-0.5">•</span>
                <div className="prose prose-sm prose-amber max-w-none">
                  <ReactMarkdown>{f}</ReactMarkdown>
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Meta */}
        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>traceId: {report.reportMeta.traceId}</span>
          <ExecutionRouteBadge route={taskMeta?.executionRoute} />
          <span>
            智能体: {skillMeta.skillLabel} ({skillMeta.skillKey})
          </span>
          <span>Playbook: {report.reportMeta.playbookVersion}</span>
          <span>
            生成时间:{" "}
            {new Date(report.reportMeta.generatedAt).toLocaleString("zh-CN")}
          </span>
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-5 items-start">
        {/* Sidebar */}
        <div className="w-44 shrink-0">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-3 sticky top-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-3 mb-2">
              章节
            </p>
            <SectionNav
              sections={report.sections}
              activeId={activeSection}
              onSelect={setActiveSection}
            />
          </div>
        </div>

        {/* Section content */}
        <div className="flex-1 min-w-0 space-y-4">
          {currentSection && (
            <ReportRenderer
              section={currentSection}
              sourceRefs={report.sourceRefs}
            />
          )}

          {/* Audit trail */}
          <details className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <summary className="px-5 py-3 text-sm font-medium text-slate-600 cursor-pointer hover:bg-slate-50 rounded-xl">
              审计轨迹（{report.auditTrail.length} 条）
            </summary>
            <div className="px-5 pb-4 space-y-2">
              {report.auditTrail.map((entry, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 text-xs text-slate-500 py-2 border-t border-slate-100"
                >
                  <span
                    className={`shrink-0 mt-0.5 font-medium ${
                      entry.status === "success"
                        ? "text-green-600"
                        : "text-red-500"
                    }`}
                  >
                    {entry.status === "success" ? "✓" : "✗"}
                  </span>
                  <span className="font-medium text-slate-600 w-28 shrink-0">
                    [{entry.service}]
                  </span>
                  <span>{entry.summary}</span>
                </div>
              ))}
            </div>
          </details>
        </div>
      </div>
    </div>
  );
}
