import type {
  ReportSection,
  ReportBlock,
  SourceRef,
  KpiCardsBlock,
  ChartBlock as ChartBlockType,
  TableBlock as TableBlockType,
  MarkdownBlock as MarkdownBlockType,
  InsightListBlock,
} from "@ce-demo/report-schema";
import KpiCardsBlockComponent from "./KpiCardsBlock";
import ChartBlockComponent from "./ChartBlock";
import TableBlockComponent from "./TableBlock";
import MarkdownBlockComponent from "./MarkdownBlock";
import InsightListBlockComponent from "./InsightListBlock";

function BlockWrapper({
  block,
  sourceRefs,
}: {
  block: ReportBlock;
  sourceRefs: SourceRef[];
}) {
  switch (block.type) {
    case "kpi_cards":
      return <KpiCardsBlockComponent block={block as KpiCardsBlock} />;
    case "chart":
      return <ChartBlockComponent block={block as ChartBlockType} />;
    case "table":
      return <TableBlockComponent block={block as TableBlockType} />;
    case "markdown":
      return <MarkdownBlockComponent block={block as MarkdownBlockType} />;
    case "insight_list":
      return (
        <InsightListBlockComponent
          block={block as InsightListBlock}
          sourceRefs={sourceRefs}
        />
      );
    default:
      return null;
  }
}

export default function ReportRenderer({
  section,
  sourceRefs,
}: {
  section: ReportSection;
  sourceRefs: SourceRef[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-lg font-bold text-slate-800">{section.title}</h2>
        {section.description && (
          <p className="text-sm text-slate-500 mt-0.5">{section.description}</p>
        )}
      </div>

      {section.blocks.map((block) => (
        <div
          key={block.id}
          className="bg-white rounded-xl border border-slate-200 shadow-sm p-5"
        >
          <BlockWrapper block={block} sourceRefs={sourceRefs} />

          {/* Source refs footer */}
          {"sourceRefs" in block && Array.isArray(block.sourceRefs) && block.sourceRefs.length > 0 && (
            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap gap-2">
              {(block.sourceRefs as string[]).map((refId) => {
                const ref = sourceRefs.find((r) => r.refId === refId);
                return ref ? (
                  <span
                    key={refId}
                    className="text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded px-2 py-0.5"
                    title={ref.queryAuditId}
                  >
                    📌 {ref.label}
                  </span>
                ) : null;
              })}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
