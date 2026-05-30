import type {
  InsightListBlock as InsightListBlockType,
  SourceRef,
} from "@ce-demo/report-schema";
import ReactMarkdown from "react-markdown";

const SOURCE_BADGE: Record<string, { label: string; style: string }> = {
  rule: { label: "规则", style: "bg-blue-100 text-blue-700" },
  model: { label: "模型", style: "bg-violet-100 text-violet-700" },
  hybrid: { label: "综合", style: "bg-teal-100 text-teal-700" },
};

function formatInsightSourceLabels(refIds: string[], catalog: SourceRef[]) {
  return refIds
    .map((refId) => {
      const hit = catalog.find((r) => r.refId === refId);
      if (hit?.label) return hit.label;
      if (refId === "ref-openclaw-llm") return "OpenClaw 模型补充结论";
      if (refId === "ref-openclaw-status") return "OpenClaw 执行与数据状态";
      if (refId === "ref-orchestrator-llm") return "编排模型补充结论";
      if (refId === "ref-orchestrator-status") return "编排执行与数据状态";
      return refId;
    })
    .join("，");
}

export default function InsightListBlock({
  block,
  sourceRefs,
}: {
  block: InsightListBlockType;
  sourceRefs: SourceRef[];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-3">{block.title}</h3>
      <div className="space-y-3">
        {block.items.map((item, i) => {
          const badge = SOURCE_BADGE[item.source] ?? SOURCE_BADGE.rule;
          return (
            <div
              key={item.id}
              className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex gap-4"
            >
              <div className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm text-slate-700 leading-relaxed prose prose-sm prose-slate max-w-none">
                  <ReactMarkdown>{item.content}</ReactMarkdown>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.style}`}
                  >
                    {badge.label}结论
                  </span>
                  {item.sourceRefs.length > 0 && (
                    <span className="text-xs text-slate-400">
                      来源: {formatInsightSourceLabels(item.sourceRefs, sourceRefs)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
