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
const ID_SEPARATOR = "-";
const ID_REPLACEMENT = "";
const THEME_ID_PREFIX = "theme-builder-";
// Mirrors the id format written on apply; anything else was not produced by this plugin.
const APPLIED_THEME_ID = new RegExp(
  `^${THEME_ID_PREFIX}([a-f0-9]{${ID_KEY_LENGTH}})-r[1-9][0-9]*-[a-f0-9]{${ID_KEY_LENGTH}}$`,
);

/** Shortens a UUID to the key embedded in applied theme ids; kept here so apply and detection cannot drift apart. */
export function idKey(id: string): string {
  return id.replaceAll(ID_SEPARATOR, ID_REPLACEMENT).slice(0, ID_KEY_LENGTH);
}

/** Lives beside idKey and imports nothing from node so the page can mark the applied theme without a server call. */
export function appliedPresetId(
  themeId: string,
  presetIds: string[],
): string | null {
  const applied = APPLIED_THEME_ID.exec(themeId)?.[1];
  if (applied === undefined) return null;
  return presetIds.find((id) => idKey(id) === applied) ?? null;
}
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
    "Appearance changed in another window. Try again to use the current appearance.",
  revision:
    "The saved theme changed or was deleted. Reload it before applying.",
  unavailable:
    "The previous theme is unavailable. You can explicitly choose the default theme instead.",
  noRestore: "This restore operation is no longer available.",
  files: "Could not create the generated theme. Appearance was not changed.",
  unconfirmed: "The requested palette was not confirmed. Try again.",
  failed:
    "The operation could not be completed. Try again to see the current appearance.",
};
