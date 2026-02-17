import { z } from "zod";

/**
 * Zod schemas for validating AI response shapes.
 * Each schema provides strict runtime validation so malformed Codex output
 * is caught at the API layer rather than crashing the UI.
 */

export const aiSummarySchema = z.object({
  summary: z.string(),
  keyChanges: z.array(
    z.object({
      file: z.string(),
      description: z.string(),
    }),
  ),
  changeType: z.enum(["feature", "bugfix", "refactor", "docs", "chore", "other"]),
});

export const riskAssessmentSchema = z.object({
  riskLevel: z.enum(["low", "medium", "high", "critical"]),
  riskFactors: z.array(
    z.object({
      category: z.enum(["security", "data", "api", "infrastructure", "quality"]),
      description: z.string(),
      severity: z.enum(["low", "medium", "high"]),
    }),
  ),
  explanation: z.string(),
});

export const relationshipsResultSchema = z.object({
  relationships: z.array(
    z.object({
      prNumberA: z.number(),
      prNumberB: z.number(),
      type: z.enum(["related", "depends-on", "conflicts"]),
      reason: z.string(),
    }),
  ),
});

export const suggestReviewersResultSchema = z.object({
  suggestedReviewers: z.array(
    z.object({
      login: z.string(),
      score: z.number(),
      reasons: z.array(z.string()),
    }),
  ),
});

export const suggestLabelsResultSchema = z.object({
  suggestedLabels: z.array(
    z.object({
      name: z.string(),
      confidence: z.number(),
      reason: z.string(),
    }),
  ),
});

export type AiSummaryValidated = z.infer<typeof aiSummarySchema>;
export type RiskAssessmentValidated = z.infer<typeof riskAssessmentSchema>;
export type RelationshipsResultValidated = z.infer<typeof relationshipsResultSchema>;
export type SuggestReviewersResultValidated = z.infer<typeof suggestReviewersResultSchema>;
export type SuggestLabelsResultValidated = z.infer<typeof suggestLabelsResultSchema>;

/**
 * Validates an AI response against a Zod schema.
 * Returns the validated data or throws with a descriptive message.
 */
export function validateAiResponse<T>(
  schema: z.ZodType<T>,
  data: unknown,
  featureName: string,
): T {
  const result = schema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  const issues = result.error.issues
    .map((i) => `${i.path.join(".")}: ${i.message}`)
    .join("; ");
  throw new Error(
    `AI response validation failed for ${featureName}: ${issues}`,
  );
}
