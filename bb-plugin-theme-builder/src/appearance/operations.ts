import { z } from "zod";
import { idSchema } from "../theme/schema.ts";

export const OPERATION_KEY = "appearance-operation";
export const BUILTIN_THEME_IDS = [
  "default",
  "nord",
  "dracula",
  "solarized",
  "gruvbox",
  "catppuccin",
];
export const DEFAULT_THEME_ID = "default";
export const ID_KEY_LENGTH = 12;
export const DEFAULT_CODE_THEME = {
  dark: "pierre-dark",
  light: "pierre-light",
  files: {},
};
export const HASH_PATTERN = /^[a-f0-9]{64}$/;
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
    "Appearance changed. Refresh appearance and review the current palette before trying again.",
  revision:
    "The saved preset changed or was deleted. Reload it before applying.",
  unavailable:
    "The previous theme is unavailable. You can explicitly choose the default theme instead.",
  noRestore: "This restore operation is no longer available.",
  files: "Could not create the generated theme. Appearance was not changed.",
  unconfirmed:
    "The requested palette was not confirmed. Refresh appearance before retrying.",
  failed:
    "The operation could not be completed. Refresh appearance to reconcile its result.",
};
