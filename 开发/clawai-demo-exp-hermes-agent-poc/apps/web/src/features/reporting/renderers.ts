import type {
  ReportBlock,
  StructuredReport,
} from "@ce-demo/report-schema";

export type RendererKind = "content" | "data";

export interface RenderNode {
  key: string;
  sectionId: string;
  blockId: string;
  blockType: ReportBlock["type"];
  rendererKind: RendererKind;
  componentKey: string;
  props: Record<string, unknown>;
}

const rendererRegistry: Record<
  ReportBlock["type"],
  { rendererKind: RendererKind; componentKey: string }
> = {
  markdown: {
    rendererKind: "content",
    componentKey: "MarkdownBlock",
  },
  kpi_cards: {
    rendererKind: "data",
    componentKey: "KpiCardsBlock",
  },
  table: {
    rendererKind: "data",
    componentKey: "TableBlock",
  },
  chart: {
    rendererKind: "data",
    componentKey: "ChartBlock",
  },
  insight_list: {
    rendererKind: "content",
    componentKey: "InsightListBlock",
  },
};

export function buildRenderPlan(report: StructuredReport): RenderNode[] {
  return report.sections.flatMap((section) =>
    section.blocks.map((block) => {
      const registryEntry = rendererRegistry[block.type];

      return {
        key: `${section.id}:${block.id}`,
        sectionId: section.id,
        blockId: block.id,
        blockType: block.type,
        rendererKind: registryEntry.rendererKind,
        componentKey: registryEntry.componentKey,
        props: {
          block,
          reportMeta: report.reportMeta,
          sourceRefs: report.sourceRefs,
        },
      };
    }),
  );
}
