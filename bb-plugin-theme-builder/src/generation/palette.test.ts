import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { generationInputSchema } from "./contract.ts";
import { generationPrompt, parseGeneratedPalette } from "./palette.ts";

const ACCENT = "#a34bc5";
const PALETTES = { light: NEUTRAL_PRESET.light, dark: NEUTRAL_PRESET.dark };

test("accepts palette JSON and preserves the exact requested accent in both modes", () => {
  const result = parseGeneratedPalette(JSON.stringify(PALETTES), ACCENT);
  assert.equal(result.light.primary, ACCENT);
  assert.equal(result.dark.primary, ACCENT);
  assert.notEqual(result.light.canvas, result.dark.canvas);
  assert.equal(result.light.ink, NEUTRAL_PRESET.light.ink);
});

test("accepts a single JSON fence but refuses prose, incomplete tokens, and injected CSS", () => {
  assert.deepEqual(
    parseGeneratedPalette(
      `\u0060\u0060\u0060json\n${JSON.stringify(PALETTES)}\n\u0060\u0060\u0060`,
      null,
    ),
    PALETTES,
  );
  for (const value of [
    `Here is your theme: ${JSON.stringify(PALETTES)}`,
    JSON.stringify({ light: {}, dark: PALETTES.dark }),
    JSON.stringify({ ...PALETTES, css: "body{}" }),
    JSON.stringify({
      ...PALETTES,
      light: { ...PALETTES.light, primary: "url(https://example.com)" },
    }),
  ])
    assert.throws(() => parseGeneratedPalette(value, null));
});

test("rejects oversized results before parsing and normalizes uppercase hex", () => {
  assert.throws(() => parseGeneratedPalette(" ".repeat(32769), null));
  const result = parseGeneratedPalette(
    JSON.stringify({
      ...PALETTES,
      light: { ...PALETTES.light, primary: "#ABCDEF" },
    }),
    null,
  );
  assert.equal(result.light.primary, "#abcdef");
});

test("generation instructions carry an accent constraint and fresh variation seed without editor data", () => {
  const first = generationPrompt(ACCENT, "first");
  const second = generationPrompt(null, "second");
  assert.ok(first.includes(ACCENT));
  assert.ok(first.includes("first"));
  assert.ok(second.includes("second"));
  assert.ok(first.includes("primaryForeground"));
});

test("the generation boundary normalizes accents and refuses unknown fields or invalid choices", () => {
  const input = {
    requestId: randomUUID(),
    selection: { providerId: "fixture", model: "model", reasoningLevel: "low" },
    accent: "#ABCDEF",
  };
  assert.equal(generationInputSchema.parse(input).accent, "#abcdef");
  for (const value of [
    { ...input, accent: "#fff" },
    { ...input, prompt: "untrusted instructions" },
    { ...input, selection: { ...input.selection, model: "" } },
    { ...input, selection: { ...input.selection, reasoningLevel: "bogus" } },
  ])
    assert.equal(generationInputSchema.safeParse(value).success, false);
});
