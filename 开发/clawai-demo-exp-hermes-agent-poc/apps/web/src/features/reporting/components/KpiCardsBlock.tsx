import type { KpiCardsBlock as KpiCardsBlockType } from "@ce-demo/report-schema";

const TREND_STYLE = {
  up: { arrow: "↑", color: "text-red-500", bg: "bg-red-50" },
  down: { arrow: "↓", color: "text-red-500", bg: "bg-red-50" },
  flat: { arrow: "→", color: "text-slate-400", bg: "bg-slate-50" },
};

const CARD_ACCENT = [
  "border-t-blue-500",
  "border-t-violet-500",
  "border-t-amber-500",
  "border-t-teal-500",
];

export default function KpiCardsBlock({ block }: { block: KpiCardsBlockType }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-600 mb-3">{block.title}</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {block.items.map((item, i) => {
          const trend = item.trend ? TREND_STYLE[item.trend] : null;
          return (
            <div
              key={item.key}
              className={`bg-white rounded-xl border border-slate-200 border-t-4 ${CARD_ACCENT[i % CARD_ACCENT.length]} p-4 shadow-sm`}
            >
              <p className="text-xs text-slate-500 mb-2">{item.label}</p>
              <div className="flex items-end gap-1.5">
                <span className="text-2xl font-bold text-slate-800 leading-none">
                  {item.value}
                </span>
                {item.unit && (
                  <span className="text-xs text-slate-400 mb-0.5">{item.unit}</span>
                )}
              </div>
              {trend && (
                <span
                  className={`inline-block mt-2 text-xs font-medium px-1.5 py-0.5 rounded ${trend.bg} ${trend.color}`}
                >
                  {trend.arrow} {item.trend === "up" ? "上升" : item.trend === "down" ? "下降" : "持平"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
