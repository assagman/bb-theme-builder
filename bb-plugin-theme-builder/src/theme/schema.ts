import { z } from "zod";
import {
  CODE_FONTS,
  MAX_NAME_LENGTH,
  MAX_PRESET_BYTES,
  MAX_REVISION,
  MODES,
  SCHEMA_VERSION,
  type ThemeDraft,
  type ThemePreset,
  TOKEN_KEYS,
  UI_FONTS,
} from "./tokens.ts";

export const COLOR_PATTERN = /^#[0-9a-f]{6}$/;
const OVERSIZE_MESSAGE = "Preset exceeds the allowed payload size";
const UI_FONT_KEYS = Object.keys(UI_FONTS) as (keyof typeof UI_FONTS)[];
const CODE_FONT_KEYS = Object.keys(CODE_FONTS) as (keyof typeof CODE_FONTS)[];
export const colorSchema = z.string().regex(COLOR_PATTERN);
export const idSchema = z.uuid();
export const revisionSchema = z.number().int().min(1).max(MAX_REVISION);
export const paletteSchema = z.record(z.enum(TOKEN_KEYS), colorSchema);
const draftFields = {
  schemaVersion: z.literal(SCHEMA_VERSION),
  name: z
    .string()
    .min(1)
    .max(MAX_NAME_LENGTH)
    .refine((value) => value.trim().length > 0),
  light: paletteSchema,
  dark: paletteSchema,
  uiFont: z.enum(UI_FONT_KEYS),
  codeFont: z.enum(CODE_FONT_KEYS),
};
const withinLimit = (value: unknown) =>
  new TextEncoder().encode(JSON.stringify(value)).byteLength <=
  MAX_PRESET_BYTES;
export const draftSchema = z
  .strictObject(draftFields)
  .refine(withinLimit, OVERSIZE_MESSAGE);
export const presetSchema = z
  .strictObject({
    ...draftFields,
    id: idSchema,
    revision: revisionSchema,
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .refine(withinLimit, OVERSIZE_MESSAGE);

export function toDraft(preset: ThemePreset): ThemeDraft {
  return {
    schemaVersion: preset.schemaVersion,
    name: preset.name,
    light: structuredClone(preset.light),
    dark: structuredClone(preset.dark),
    uiFont: preset.uiFont,
    codeFont: preset.codeFont,
  };
}

/** The two palettes of a theme, the part an agent reply or checkpoint replaces; fonts and name stay with the draft. */
export function paletteOf(draft: Pick<ThemeDraft, "light" | "dark">) {
  return { light: draft.light, dark: draft.dark };
}

/** Token-wise palette equality, because palettes reach the page from sources (zod, stored JSON, generators) that order keys differently. */
export function samePalette(
  a: Pick<ThemeDraft, "light" | "dark">,
  b: Pick<ThemeDraft, "light" | "dark">,
): boolean {
  return MODES.every((mode) =>
    TOKEN_KEYS.every((key) => a[mode][key] === b[mode][key]),
  );
}

// Fixed field and token order, because drafts reach the page from sources (defaults, zod, stored JSON) that order keys differently.
function canonical(draft: ThemeDraft) {
  return JSON.stringify([
    draft.schemaVersion,
    draft.name,
    draft.uiFont,
    draft.codeFont,
    TOKEN_KEYS.map((key) => draft.light[key]),
    TOKEN_KEYS.map((key) => draft.dark[key]),
  ]);
}

/** One definition of "unchanged" for dirty checks and draft restore; compares values, never key order. */
export function sameDraft(a: ThemeDraft, b: ThemeDraft): boolean {
  return canonical(a) === canonical(b);
}
