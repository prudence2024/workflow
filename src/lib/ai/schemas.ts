import { z } from "zod";

export const contactFieldSchema = z.enum(["firstName", "lastName", "email", "phone", "company", "address"]);
export const formMappingSuggestionSchema = z.object({
  formField: z.string().min(1).max(120),
  contactField: contactFieldSchema,
  confidence: z.number().min(0).max(1),
  reasoning: z.string().max(400),
});
export const formCopilotSchema = z.object({
  summary: z.string().max(600),
  purpose: z.string().max(180),
  suggestions: z.array(formMappingSuggestionSchema).max(100),
  unmappedRequired: z.array(z.string().max(120)).max(100),
  warnings: z.array(z.string().max(240)).max(20),
  readiness: z.number().int().min(0).max(100),
});
export type FormCopilotResult = z.infer<typeof formCopilotSchema>;

export const assistantRequestSchema = z.object({
  message: z.string().trim().min(1).max(1200),
  campaignId: z.string().uuid().optional(),
  voice: z.boolean().optional().default(false),
});

export const toolArgumentSchema = z.object({ campaignId: z.string().uuid().optional() });