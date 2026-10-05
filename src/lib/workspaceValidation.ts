import { z } from "zod";
import { selectablePlanKeySchema } from "@/lib/plans";

export const workspaceInputSchema = z
  .object({
    step: z.enum(["plan", "workspace"]).optional().default("workspace"),
    plan: selectablePlanKeySchema.optional().default("free"),
    accountType: z.enum(["personal", "organization"]),
    name: z.string().optional().default(""),
  })
  .superRefine((value, context) => {
    if (value.accountType === "organization" && value.name.trim().length < 2) {
      context.addIssue({
        code: "custom",
        path: ["name"],
        message: "Enter an organization name",
      });
    }
  });

export function parseWorkspaceInput(input: unknown) {
  return workspaceInputSchema.safeParse(input);
}
