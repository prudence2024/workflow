import type { AiModelCapability, AiProvider, AiTask } from "./types";

export type ApprovedModel = {
  provider: AiProvider;
  id: string;
  capabilities: readonly AiModelCapability[];
  tasks: readonly AiTask[];
};

/** Approved models only. Provider catalogs are not exposed directly to users. */
export const APPROVED_MODELS: readonly ApprovedModel[] = [
  {
    provider: "nvidia",
    id: process.env.AI_MODEL_FAST ?? "openai/gpt-oss-20b",
    capabilities: ["fast", "tool_use"],
    tasks: ["form_mapping", "form_analysis", "failure_analysis", "campaign_assistant", "operations_assistant"],
  },
  {
    provider: "nvidia",
    id: process.env.AI_MODEL_REASONING ?? "openai/gpt-oss-120b",
    capabilities: ["reasoning", "tool_use"],
    tasks: ["form_analysis", "campaign_assistant", "operations_assistant"],
  },
  {
    provider: "nvidia",
    id: process.env.AI_MODEL_FALLBACK ?? "meta/llama-3.3-70b-instruct",
    capabilities: ["fast", "tool_use"],
    tasks: ["form_mapping", "form_analysis", "failure_analysis", "campaign_assistant", "operations_assistant"],
  },
];

export function approvedModelsFor(task: AiTask, required: readonly AiModelCapability[]): ApprovedModel[] {
  return APPROVED_MODELS.filter((model) => model.tasks.includes(task) && required.every((capability) => model.capabilities.includes(capability)));
}