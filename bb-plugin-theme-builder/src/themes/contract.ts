/**
 * Every RPC the page may call, with strict schemas on both sides: the server
 * rejects unknown fields, oversized drafts, and ids outside the allowed
 * patterns before any handler runs.
 */
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { chatMethods, generationMethods } from "../generation/contract.ts";
import { draftSchema, idSchema } from "../theme/schema.ts";
import { MAX_NAME_LENGTH } from "../theme/tokens.ts";
import {
  ANY_THEME_ID_PATTERN,
  CUSTOM_THEME_ID_PATTERN,
  HASH_PATTERN,
  MAX_LISTED_THEMES,
  MAX_PLUGIN_NAME_LENGTH,
  MAX_THEME_CSS_BYTES,
} from "./ids.ts";

const anyThemeId = z.string().regex(ANY_THEME_ID_PATTERN);
const customThemeId = z.string().regex(CUSTOM_THEME_ID_PATTERN);
const hashSchema = z.string().regex(HASH_PATTERN);
const nameSchema = z
  .string()
  .min(1)
  .max(MAX_NAME_LENGTH)
  .refine((value) => value.trim().length > 0);
const failureSchema = <K extends "conflict" | "failed" | "missing">(kind: K) =>
  z.strictObject({ kind: z.literal(kind), message: z.string() });
const appearanceOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("applied"), operationId: idSchema }),
  z.strictObject({ kind: z.literal("restored"), operationId: idSchema }),
  failureSchema("conflict"),
  failureSchema("failed"),
  failureSchema("missing"),
]);
/** A custom theme as stored: its CSS verbatim and the hash Overwrite must send back. */
const customThemeSchema = z.strictObject({
  kind: z.literal("custom"),
  id: customThemeId,
  css: z.string().max(MAX_THEME_CSS_BYTES),
  hash: hashSchema,
  owned: z.boolean(),
});
/** A theme bb paints but does not expose as CSS, so the page starts it from Neutral. */
const opaqueThemeSchema = z.strictObject({
  kind: z.enum(["builtin", "plugin"]),
  id: anyThemeId,
  name: z.string().max(MAX_PLUGIN_NAME_LENGTH),
});
/** `unsupported`: bb lists the folder but its name fails the strict pattern, so it is never read; `missing`: bb does not list it. */
const themeViewSchema = z.discriminatedUnion("kind", [
  customThemeSchema,
  opaqueThemeSchema,
  z.strictObject({ kind: z.enum(["unsupported", "missing"]), id: anyThemeId }),
]);
/** Undo/redo availability plus the file's hash now, so the page can tell a change made outside the builder. */
const historySchema = z.strictObject({
  canUndo: z.boolean(),
  canRedo: z.boolean(),
  undoSteps: z.number().int().min(0),
  redoSteps: z.number().int().min(0),
  hash: hashSchema.nullable(),
});
/** Whether bb repainted after a write: `inactive` when the theme is not in use, `unconfirmed` when bb did not read it back. */
const repaintSchema = z.enum(["inactive", "repainted", "unconfirmed"]);
/** Outcome of every write: the theme as now on disk, and whether bb repainted it when it is in use. */
const saveOutcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("saved"),
    theme: customThemeSchema,
    repaint: repaintSchema,
  }),
  failureSchema("conflict"),
  failureSchema("failed"),
]);
const themeListSchema = z.strictObject({
  activeId: z.string(),
  builtin: z.array(anyThemeId),
  custom: z
    .array(z.strictObject({ id: customThemeId, owned: z.boolean() }))
    .max(MAX_LISTED_THEMES),
  plugins: z
    .array(
      z.strictObject({
        id: anyThemeId,
        name: z.string().max(MAX_PLUGIN_NAME_LENGTH),
      }),
    )
    .max(MAX_LISTED_THEMES),
});
const appearanceViewSchema = z.strictObject({
  themeId: z.string(),
  fingerprint: hashSchema,
  restoreAvailable: z.boolean(),
  operationId: idSchema.nullable(),
});

export const rpcContract = defineRpcContract({
  ...generationMethods,
  ...chatMethods,
  listThemes: {
    input: z.strictObject({}),
    output: themeListSchema,
  },
  getTheme: {
    input: z.strictObject({ id: anyThemeId }),
    output: themeViewSchema,
  },
  overwriteTheme: {
    input: z.strictObject({
      id: customThemeId,
      expectedHash: hashSchema,
      draft: draftSchema,
    }),
    output: saveOutcomeSchema,
  },
  saveThemeAs: {
    input: z.strictObject({
      name: nameSchema,
      sourceId: customThemeId.nullable(),
      draft: draftSchema,
    }),
    output: saveOutcomeSchema,
  },
  getThemeHistory: {
    input: z.strictObject({ id: customThemeId }),
    output: historySchema,
  },
  undoTheme: {
    input: z.strictObject({ id: customThemeId }),
    output: saveOutcomeSchema,
  },
  redoTheme: {
    input: z.strictObject({ id: customThemeId }),
    output: saveOutcomeSchema,
  },
  deleteTheme: {
    input: z.strictObject({ id: customThemeId }),
    output: z.discriminatedUnion("kind", [
      z.strictObject({ kind: z.literal("deleted") }),
      failureSchema("conflict"),
      failureSchema("failed"),
    ]),
  },
  getAppearance: {
    input: z.strictObject({}),
    output: appearanceViewSchema,
  },
  useTheme: {
    input: z.strictObject({
      themeId: anyThemeId,
      observedFingerprint: hashSchema,
    }),
    output: appearanceOutcomeSchema,
  },
  restoreAppearance: {
    input: z.strictObject({
      operationId: idSchema,
      observedFingerprint: hashSchema,
      fallbackToDefault: z.boolean().optional(),
    }),
    output: appearanceOutcomeSchema,
  },
});

// Both sides use these instead of hand-written copies, so a contract change cannot leave one side behind.
export type ThemeList = z.infer<typeof themeListSchema>;
export type ThemeView = z.infer<typeof themeViewSchema>;
export type HistoryView = z.infer<typeof historySchema>;
export type RepaintResult = z.infer<typeof repaintSchema>;
export type SaveOutcome = z.infer<typeof saveOutcomeSchema>;
export type ThemeFailure = Extract<SaveOutcome, { message: string }>;
export type AppearanceView = z.infer<typeof appearanceViewSchema>;
