export type AnalysisType =
  | "business_diagnosis"
  | "capacity_analysis"
  | "inventory_health"
  | (string & {});

export interface TimeRange {
  startAt: string;
  endAt: string;
  timezone: string;
}

export interface ActorContext {
  actorId: string;
  actorType: "user" | "system";
  actorName?: string;
}

export interface AnalysisRequestContext {
  traceId: string;
  tenantId: string;
  orgId: string;
  siteId: string;
  requestedAt: string;
  requestedBy: ActorContext;
}

export interface AnalysisRequestInput {
  analysisType: AnalysisType;
  timeRange: TimeRange;
  inputParams: Record<string, unknown>;
  playbookVersion: string;
  reportTemplateVersion: string;
}

export interface AnalysisRequest {
  context: AnalysisRequestContext;
  input: AnalysisRequestInput;
}

export interface AnalysisTaskAccepted {
  taskId: string;
  traceId: string;
  status: "accepted" | "running";
}

export interface AnalysisScenario {
  skillKey: string;
  title: string;
  description: string;
  defaultReportTemplateVersion: string;
  allowedInputParams: string[];
}
