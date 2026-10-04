import type { PlanCapability, SelectablePlanKey } from "@/lib/plans";

export type AiTask = "form_mapping" | "form_analysis" | "failure_analysis" | "campaign_assistant" | "operations_assistant";
export type AiModelCapability = "fast" | "reasoning" | "multimodal" | "tool_use" | "voice";
export type AiMessage = { role: "system" | "user" | "assistant"; content: string };
export type AiProvider = "nvidia";

export type AiContext = {
  plan: SelectablePlanKey;
  requiredCapabilities: readonly AiModelCapability[];
  task: AiTask;
  latencyPreference?: "low" | "balanced" | "quality";
  contextSize?: number;
  toolRequirement?: boolean;
};

export type AiCompletion = {
  provider: AiProvider;
  model: string;
  text: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
};

export type AiToolName =
  | "get_campaign_summary"
  | "get_campaign_failures"
  | "get_form_structure"
  | "get_mapping_status"
  | "get_contact_data_quality_summary"
  | "list_recent_imports"
  | "get_usage_summary"
  | "prepare_campaign_draft";

export type AiRequest = {
  task: AiTask;
  messages: AiMessage[];
  capability: PlanCapability;
  tools?: AiToolName[];
};