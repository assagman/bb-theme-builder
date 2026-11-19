import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { generationMethods } from "../generation/contract.ts";
import {
  draftSchema,
  idSchema,
  presetSchema,
  revisionSchema,
} from "../theme/schema.ts";
import { MAX_PRESETS } from "../theme/tokens.ts";

const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/;
const conflictSchema = z.strictObject({ kind: z.literal("conflict") });
const referenceSchema = z.strictObject({
  id: idSchema,
  revision: revisionSchema,
});
const appearanceOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("applied"), operationId: idSchema }),
  z.strictObject({ kind: z.literal("restored"), operationId: idSchema }),
  ...(["conflict", "failed", "missing"] as const).map((kind) =>
    z.strictObject({ kind: z.literal(kind), message: z.string() }),
  ),
]);

export const rpcContract = defineRpcContract({
  ...generationMethods,
  listPresets: {
    input: z.strictObject({}),
    output: z
      .array(
        z.strictObject({
          id: idSchema,
          name: z.string(),
          revision: revisionSchema,
        }),
      )
      .max(MAX_PRESETS),
  },
  getPreset: {
    input: z.strictObject({ id: idSchema }),
    output: presetSchema.nullable(),
  },
  savePreset: {
    input: z.strictObject({
      id: idSchema.nullable(),
      expectedRevision: revisionSchema.nullable(),
      draft: draftSchema,
    }),
    output: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("saved"), preset: presetSchema }),
      conflictSchema,
      z.strictObject({ kind: z.literal("limit") }),
    ]),
  },
  deletePreset: {
    input: z.strictObject({ id: idSchema, expectedRevision: revisionSchema }),
    output: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("deleted") }),
      conflictSchema,
    ]),
  },
  exportPreset: {
    input: referenceSchema,
    output: z.discriminatedUnion("kind", [
      conflictSchema,
      z.strictObject({
        kind: z.literal("exported"),
        json: z.string(),
        css: z.string(),
        baseName: z.string(),
      }),
    ]),
  },
  getAppearance: {
    input: z.strictObject({}),
    output: z.strictObject({
      themeId: z.string(),
      fingerprint: z.string().regex(FINGERPRINT_PATTERN),
      restoreAvailable: z.boolean(),
      operationId: idSchema.nullable(),
    }),
  },
  applyPreset: {
    input: referenceSchema.extend({
      observedFingerprint: z.string().regex(FINGERPRINT_PATTERN),
    }),
    output: appearanceOutcomeSchema,
  },
  restoreAppearance: {
    input: z.strictObject({
      operationId: idSchema,
      observedFingerprint: z.string().regex(FINGERPRINT_PATTERN),
      fallbackToDefault: z.boolean().optional(),
    }),
    output: appearanceOutcomeSchema,
  },
});
