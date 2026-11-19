import { z } from "zod";
import { idSchema, paletteSchema } from "../theme/schema.ts";

export const GENERATION_TIMEOUT_MS = 180000;
export const POLL_INTERVAL_MS = 1000;
export const REASONING_LEVELS = [
  "none",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
  "ultracode",
] as const;
const MAX_SELECTION_LENGTH = 200;
const ACCENT_PATTERN = /^#[0-9a-fA-F]{6}$/;
const selectionString = z.string().min(1).max(MAX_SELECTION_LENGTH);
export const accentSchema = z
  .string()
  .regex(ACCENT_PATTERN)
  .transform((value) => value.toLowerCase());
export const selectionSchema = z.strictObject({
  providerId: selectionString,
  model: selectionString,
  reasoningLevel: z.enum(REASONING_LEVELS),
  serviceTier: z.enum(["default", "fast"]).optional(),
});
export const generatedPaletteSchema = z.strictObject({
  light: paletteSchema,
  dark: paletteSchema,
});
export const generationInputSchema = z.strictObject({
  requestId: idSchema,
  selection: selectionSchema,
  accent: accentSchema.nullable(),
});
export const generationResultSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("running") }),
  z.strictObject({ kind: z.literal("ready"), palette: generatedPaletteSchema }),
  z.strictObject({ kind: z.literal("cancelled") }),
  z.strictObject({ kind: z.literal("failed"), message: z.string() }),
]);
export const generationMethods = {
  getGenerationSelection: {
    input: z.strictObject({}),
    output: selectionSchema.nullable(),
  },
  startGeneration: {
    input: generationInputSchema,
    output: generationResultSchema,
  },
  getGeneration: {
    input: z.strictObject({ requestId: idSchema }),
    output: generationResultSchema,
  },
  cancelGeneration: {
    input: z.strictObject({ requestId: idSchema }),
    output: z.strictObject({}),
  },
};
export type GenerationSelection = z.infer<typeof selectionSchema>;
export type GenerationInput = z.infer<typeof generationInputSchema>;
export type GenerationResult = z.infer<typeof generationResultSchema>;
export type GeneratedPalette = z.infer<typeof generatedPaletteSchema>;
