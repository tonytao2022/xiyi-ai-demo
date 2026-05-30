import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearDemoReports, createTask } from "../api";

const ANALYSIS_FOCUSES = [
  { value: "yield_overview", label: "合格率总览" },
  { value: "defect_breakdown", label: "不合格结构分析" },
  { value: "raw_material_correlation", label: "原料批次关联" },
  { value: "equipment_correlation", label: "设备维保关联" },
];

/** 演示库在基础种子外还通过 `13-mes-demo-expand-dates.sql` 扩到了 +7 / +14 天 */
const DEMO_DATE_START = "2026-03-27";
const DEMO_DATE_END = "2026-04-13";

function getDefaultDateRange() {
  return { start: DEMO_DATE_START, end: DEMO_DATE_END };
}

export default function WizardPage() {
  const navigate = useNavigate();
  const defaultRange = getDefaultDateRange();

  const [form, setForm] = useState({
    orchestratorMode: "openclaw" as "openclaw" | "hermes",
    /** 深度诊断 = Skill A；趋势简报 = Skill B（仅 FPY 趋势 + 阈值结论） */
    analysisMode: "diagnostic" as "diagnostic" | "trend_brief",
    orgId: "org-A",
    siteId: "site-A01",
    /** 与演示库中设备事件 `unit` 一致，便于一次跑出设备关联数据 */
    productLine: "line-A",
    batchRange: "",
    startDate: defaultRange.start,
    endDate: defaultRange.end,
    analysisFocus: [
      "yield_overview",
      "defect_breakdown",
      "equipment_correlation",
    ],
  });
  const [loading, setLoading] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [error, setError] = useState("");
  const [clearFeedback, setClearFeedback] = useState<{
    type: "ok" | "error";
    text: string;
  } | null>(null);

  function toggleFocus(value: string) {
    setForm((prev) => ({
      ...prev,
      analysisFocus: prev.analysisFocus.includes(value)
        ? prev.analysisFocus.filter((v) => v !== value)
        : [...prev.analysisFocus, value],
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.analysisMode === "diagnostic" && form.analysisFocus.length === 0) {
      setError("请至少选择一个分析关注点");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const isBrief = form.analysisMode === "trend_brief";
      const task = await createTask({
        orchestratorMode: form.orchestratorMode,
        ...(isBrief
          ? {
              skillKey: "quality_fpyr_trend_brief",
              analysisType: "first_pass_yield_trend_brief",
              reportTemplateVersion: "fpyr-demo-brief-v1",
            }
          : {
              skillKey: "quality_first_pass_yield",
              analysisType: "first_pass_yield_monitoring",
              reportTemplateVersion: "fpyr-demo-v1",
            }),
        tenantId: "tenant-demo",
        orgId: form.orgId,
        siteId: form.siteId,
        timeRange: { startAt: form.startDate, endAt: form.endDate, timezone: "Asia/Shanghai" },
        inputParams: {
          productLine: form.productLine,
          batchRange: form.batchRange || undefined,
          analysisFocus: isBrief ? ["yield_overview"] : form.analysisFocus,
        },
        playbookVersion: "quality-fpyr-v1",
      });
      navigate(`/tasks/${task.taskId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "提交失败";
      setError(msg);
      setLoading(false);
    }
  }

  async function handleClearReports() {
    setClearFeedback(null);
    if (
      !window.confirm(
        "将删除数据库中全部历史分析任务与结构化报告，并清除 BFF 上的报告复用缓存。此操作不可恢复。是否继续？"
      )
    ) {
      return;
    }
    if (
      !window.confirm(
        "请再次确认：BFF 上当前没有任务在队列或执行中（若有，接口会拒绝）。"
      )
    ) {
      return;
    }
    setClearing(true);
    try {
      const r = await clearDemoReports();
      setClearFeedback({ type: "ok", text: r.message });
    } catch (e) {
      setClearFeedback({
        type: "error",
        text: e instanceof Error ? e.message : "清空失败",
      });
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-slate-800">发起分析任务</h1>
          <p className="mt-1 text-sm text-slate-500">
            场景：在线一次校验合格率管控（双技能：深度诊断 / 趋势简报）
          </p>
        </div>
        <div className="shrink-0 w-full sm:w-auto sm:max-w-xs rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 space-y-2">
          <p className="text-xs font-medium text-slate-600">Demo 维护</p>
          <button
            type="button"
            onClick={handleClearReports}
            disabled={clearing || loading}
            className="text-sm text-slate-700 border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-50 rounded-lg px-4 py-2 w-full sm:w-auto"
          >
            {clearing ? "正在清空…" : "清空历史报告与任务"}
          </button>
          {clearFeedback ? (
            <p
              className={
                clearFeedback.type === "ok"
                  ? "text-xs text-emerald-700"
                  : "text-xs text-amber-800"
              }
            >
              {clearFeedback.text}
            </p>
          ) : null}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
            编排引擎
          </h2>
          <p className="text-xs text-slate-500">
            OpenClaw 为现有基线链路；Hermes 用于对比实验。二者都只做编排，业务口径仍由语义层与规则引擎保证。
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                form.orchestratorMode === "openclaw"
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="orchestratorMode"
                checked={form.orchestratorMode === "openclaw"}
                onChange={() => setForm({ ...form, orchestratorMode: "openclaw" })}
                className="accent-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-800">OpenClaw</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  现有主编排链路，支持本地/外部 OpenClaw 执行模式。
                </div>
              </div>
            </label>
            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                form.orchestratorMode === "hermes"
                  ? "border-violet-500 bg-violet-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="orchestratorMode"
                checked={form.orchestratorMode === "hermes"}
                onChange={() => setForm({ ...form, orchestratorMode: "hermes" })}
                className="accent-violet-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-800">Hermes Agent</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  走 Hermes API Server（/v1/responses）做编排增强实验。
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-3">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
            分析模式
          </h2>
          <p className="text-xs text-slate-500">
            对应 OpenClaw 两个 Skill：<code className="text-slate-600">quality_first_pass_yield</code>{" "}
            与 <code className="text-slate-600">quality_fpyr_trend_brief</code>。
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                form.analysisMode === "diagnostic"
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="analysisMode"
                checked={form.analysisMode === "diagnostic"}
                onChange={() => setForm({ ...form, analysisMode: "diagnostic" })}
                className="accent-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-800">深度诊断</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  全量链路：趋势、不合格结构、设备关联与分支编排
                </div>
              </div>
            </label>
            <label
              className={`flex-1 flex items-center gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                form.analysisMode === "trend_brief"
                  ? "border-blue-500 bg-blue-50"
                  : "border-slate-200 hover:border-slate-300"
              }`}
            >
              <input
                type="radio"
                name="analysisMode"
                checked={form.analysisMode === "trend_brief"}
                onChange={() => setForm({ ...form, analysisMode: "trend_brief" })}
                className="accent-blue-600"
              />
              <div>
                <div className="text-sm font-medium text-slate-800">趋势简报</div>
                <div className="text-xs text-slate-500 mt-0.5">
                  仅合格率趋势与规则层预警，不查询检验项明细与设备时间线
                </div>
              </div>
            </label>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-5">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
            分析范围
          </h2>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                组织 / 工厂
              </label>
              <select
                value={form.orgId}
                onChange={(e) => setForm({ ...form, orgId: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="org-A">工厂 A</option>
                <option value="org-B">工厂 B</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                车间 / 产线
              </label>
              <select
                value={form.siteId}
                onChange={(e) => setForm({ ...form, siteId: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="site-A01">A01 一车间</option>
                <option value="site-A02">A02 二车间</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                开始日期
              </label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                结束日期
              </label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <p className="text-xs text-slate-500">
            默认起止日覆盖当前仓库 MES 演示数据扩展区间（{DEMO_DATE_START}～
            {DEMO_DATE_END}），打开页面即可直接发起联调并观察更长时间趋势。
          </p>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              产线 / 批次范围（选填）
            </label>
            <input
              type="text"
              value={form.batchRange}
              onChange={(e) => setForm({ ...form, batchRange: e.target.value })}
              placeholder="例如 RAW-2026-03，留空则分析全部批次"
              className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
          <h2 className="font-semibold text-slate-700 text-sm uppercase tracking-wide">
            分析关注点
          </h2>
          {form.analysisMode === "trend_brief" && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              趋势简报模式下关注点固定为「合格率总览」，不触发检验项/设备下钻查询。
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            {ANALYSIS_FOCUSES.map((f) => (
              <label
                key={f.value}
                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  form.analysisFocus.includes(f.value)
                    ? "border-blue-500 bg-blue-50"
                    : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <input
                  type="checkbox"
                  disabled={form.analysisMode === "trend_brief"}
                  checked={form.analysisFocus.includes(f.value)}
                  onChange={() => toggleFocus(f.value)}
                  className="accent-blue-600 disabled:opacity-50"
                />
                <span className="text-sm font-medium text-slate-700">
                  {f.label}
                </span>
              </label>
            ))}
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <span className="text-blue-500 mt-0.5">ℹ️</span>
          <div className="text-sm text-blue-700">
            <p className="font-medium">数据来源：MOM / MES</p>
            <p className="mt-0.5 text-blue-600">
              分析结果将基于一次校验合格率、不合格批次、原料批次、ICP、粒度、设备维保等数据自动生成结构化报告。
            </p>
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-semibold rounded-xl px-6 py-3 transition-colors flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              正在提交...
            </>
          ) : (
            "发起分析"
          )}
        </button>
      </form>
    </div>
  );
}
