export interface AnalysisClaimSelector {
  campaignId?: string | null;
  analysisJobId?: string | null;
  organizationId?: string | null;
}

export interface AnalysisClaimQuery {
  text: string;
  values: string[];
}

export function buildAnalysisClaimQuery(selector?: AnalysisClaimSelector): AnalysisClaimQuery;
