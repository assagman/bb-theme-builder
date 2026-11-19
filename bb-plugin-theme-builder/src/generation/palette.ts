import { MAX_PRESET_BYTES, TOKEN_DEFINITIONS } from "../theme/tokens.ts";
import { generatedPaletteSchema } from "./contract.ts";

const JSON_FENCE = /^```(?:json)?\s*\n([\s\S]*?)\n```$/;
const HEX_VALUE = /^#[0-9a-fA-F]{6}$/;
const INVALID_RESULT =
  "The model returned an invalid palette. Try Randomize again.";
const INSTRUCTIONS = [
  "Create a distinctive, coordinated light and dark UI color palette. Return only JSON with light and dark objects.",
  "This is a text-only design request. Do not use tools, read files, run commands, change settings, or ask questions.",
  "Every color must be an opaque six-digit hex string. Include every token listed below, with no additional keys.",
  "Use a light canvas and dark ink for light mode, and a dark canvas and light ink for dark mode.",
  "Aim for at least 4.5:1 contrast for text on canvas, primaryForeground on primary, and destructiveForeground on destructive.",
  "Keep warning, success, destructive, and diff colors recognizable while coordinating their tones with the palette.",
  "diffAdded and diffRemoved are TEXT colors on canvas, not background fills. Keep these and all semantic text colors readable on canvas in each mode.",
  "Vary the visual direction for each variation seed. Never output CSS, HTML, names, fonts, or commentary.",
].join("\n");
const TOKEN_LABELS = Object.entries(TOKEN_DEFINITIONS)
  .map(([key, definition]) => `${key}: ${definition.label}`)
  .join("\n");

export function generationPrompt(accent: string | null, seed: string): string {
  const constraint =
    accent === null
      ? "Choose the accent colors freely."
      : `Use exactly ${accent} for primary in BOTH modes; choose primaryForeground for readable contrast against it.`;
  return `${INSTRUCTIONS}\n${constraint}\nVariation seed: ${seed}\nTokens in each mode:\n${TOKEN_LABELS}`;
}

export function parseGeneratedPalette(text: string, accent: string | null) {
  if (new TextEncoder().encode(text).byteLength > MAX_PRESET_BYTES)
    throw new Error(INVALID_RESULT);
  const trimmed = text.trim();
  const json = JSON_FENCE.exec(trimmed)?.[1] ?? trimmed;
  try {
    const palette = generatedPaletteSchema.parse(
      JSON.parse(json, (_key, value: unknown) =>
        typeof value === "string" && HEX_VALUE.test(value)
          ? value.toLowerCase()
          : value,
      ),
    );
    if (accent !== null) {
      palette.light.primary = accent;
      palette.dark.primary = accent;
    }
    return palette;
  } catch {
    throw new Error(INVALID_RESULT);
  }
}
