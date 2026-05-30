export type MetricGrain = "hour" | "day" | "week" | "month" | "quarter";

export type FilterOperator =
  | "eq"
  | "neq"
  | "in"
  | "not_in"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between";

export interface MetricTimeRange {
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface MetricFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | Array<string | number | boolean>;
}

export interface AuditContext {
  traceId: string;
  tenantId: string;
  actorId: string;
  skillKey: string;
}

export interface MetricQuery {
  metricKey: string;
  dimensions: string[];
  filters: MetricFilter[];
  grain: MetricGrain;
  timeRange: MetricTimeRange;
  limit?: number;
  queryReason: string;
  auditContext: AuditContext;
}

export interface MetricDefinitionRef {
  metricKey: string;
  metricName: string;
  definitionVersion: string;
  unit?: string;
}

export interface MetricQueryResult {
  queryAuditId: string;
  requestedAt: string;
  sourceSystem: string;
  dataTimestamp: string;
  metricDefinitions: MetricDefinitionRef[];
  rows: Array<Record<string, string | number | boolean | null>>;
}
