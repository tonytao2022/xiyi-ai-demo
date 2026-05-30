export type InsightSource = "rule" | "model" | "hybrid";
export type ChartType = "line" | "bar" | "pie" | "scatter" | "area";

export interface SourceRef {
  refId: string;
  sourceType: "metric" | "rule" | "document";
  label: string;
  traceId?: string;
  queryAuditId?: string;
  ruleVersion?: string;
}

export interface AuditTrailEntry {
  traceId: string;
  service: string;
  action: string;
  startedAt: string;
  finishedAt?: string;
  status: "success" | "failure";
  summary: string;
}

export interface ReportMeta {
  reportId: string;
  traceId: string;
  tenantId: string;
  orgId: string;
  siteId: string;
  analysisType: string;
  generatedAt: string;
  reportTemplateVersion: string;
  playbookVersion: string;
}

export interface ReportSummary {
  title: string;
  subtitle?: string;
  headline: string;
  keyFindings: string[];
}

export interface MarkdownBlock {
  id: string;
  type: "markdown";
  title?: string;
  markdown: string;
}

export interface KpiCardItem {
  key: string;
  label: string;
  value: string | number;
  unit?: string;
  trend?: "up" | "down" | "flat";
}

export interface KpiCardsBlock {
  id: string;
  type: "kpi_cards";
  title: string;
  items: KpiCardItem[];
  source: InsightSource;
  sourceRefs: string[];
}

export interface TableBlock {
  id: string;
  type: "table";
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, string | number | boolean | null>>;
  source: InsightSource;
  sourceRefs: string[];
}

export interface ChartBlock {
  id: string;
  type: "chart";
  title: string;
  chartType: ChartType;
  data: Array<Record<string, string | number | boolean | null>>;
  xField: string;
  yField: string;
  metricDefinitions: string[];
  source: InsightSource;
  sourceRefs: string[];
}

export interface InsightListBlock {
  id: string;
  type: "insight_list";
  title: string;
  items: Array<{
    id: string;
    content: string;
    source: InsightSource;
    sourceRefs: string[];
  }>;
}

export type ReportBlock =
  | MarkdownBlock
  | KpiCardsBlock
  | TableBlock
  | ChartBlock
  | InsightListBlock;

export interface ReportSection {
  id: string;
  title: string;
  description?: string;
  blocks: ReportBlock[];
}

export interface StructuredReport {
  reportMeta: ReportMeta;
  summary: ReportSummary;
  sections: ReportSection[];
  sourceRefs: SourceRef[];
  auditTrail: AuditTrailEntry[];
}
