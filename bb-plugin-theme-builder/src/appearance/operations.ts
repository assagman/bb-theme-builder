import { z } from "zod";
import { idSchema } from "../theme/schema.ts";
import { HASH_PATTERN } from "../themes/ids.ts";

export const OPERATION_KEY = "appearance-operation";
export const DEFAULT_CODE_THEME = {
  dark: "pierre-dark",
  light: "pierre-light",
  files: {},
};
const identitySchema = z.strictObject({
  themeId: z.string(),
  fingerprint: z.string().regex(HASH_PATTERN),
});
const applyRecordSchema = z.strictObject({
  operationId: idSchema,
  previous: identitySchema,
  target: identitySchema,
  previousSourceFingerprint: z
    .string()
    .regex(HASH_PATTERN)
    .nullable()
    .optional(),
});
const pendingSchema = z.strictObject({
  kind: z.enum(["apply", "restore"]),
  operationId: idSchema,
  previous: identitySchema,
  target: identitySchema,
  record: applyRecordSchema,
});
export const operationStateSchema = z.strictObject({
  pending: pendingSchema.nullable(),
  lastApply: applyRecordSchema.nullable(),
});
export type PaletteIdentity = z.infer<typeof identitySchema>;
export type OperationState = z.infer<typeof operationStateSchema>;
export type PendingOperation = z.infer<typeof pendingSchema>;
export const EMPTY_OPERATIONS: OperationState = {
  pending: null,
  lastApply: null,
};
export const OPERATION_MESSAGES = {
  changed:
    "Appearance changed in another window. Try again to use the current appearance.",
  missingTheme: "That theme is no longer available in bb. Pick another one.",
  alreadyActive: "This theme is already in use.",
  unavailable:
    "The previous theme is unavailable. You can explicitly choose the default theme instead.",
  noRestore: "This restore operation is no longer available.",
  unconfirmed: "The requested palette was not confirmed. Try again.",
  failed:
    "The operation could not be completed. Try again to see the current appearance.",
};
