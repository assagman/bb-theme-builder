import assert from "node:assert/strict";
import { test } from "node:test";
import { contrastRatio } from "./contrast.ts";
import { generateCss } from "./css.ts";
import { NEUTRAL_PRESET } from "./defaults.ts";
import { draftSchema } from "./schema.ts";

const INVALID_COLORS = [
  "red",
  "#fff",
  "#ffffffff",
  "#ABCDEF",
  "#123456; color:red",
  "url(https://example.com)",
];
const INJECTION_FONT = "system; background: url(https://example.com)";

test("accepts complete palettes and rejects injection, unknown fields, and incompatible schemas", () => {
  assert.equal(draftSchema.safeParse(NEUTRAL_PRESET).success, true);
  for (const canvas of INVALID_COLORS) {
    assert.equal(
      draftSchema.safeParse({
        ...NEUTRAL_PRESET,
        light: { ...NEUTRAL_PRESET.light, canvas },
      }).success,
      false,
    );
  }
  for (const patch of [
    { schemaVersion: 2 },
    { uiFont: INJECTION_FONT },
    { unexpected: true },
    { name: " " },
    { name: "x".repeat(81) },
  ]) {
    assert.equal(
      draftSchema.safeParse({ ...NEUTRAL_PRESET, ...patch }).success,
      false,
    );
  }
  assert.equal(
    draftSchema.safeParse({
      ...NEUTRAL_PRESET,
      dark: { ...NEUTRAL_PRESET.dark, selector: "body" },
    }).success,
    false,
  );
});

test("generates deterministic CSS with independent light and dark values and no name interpolation", () => {
  const draft = structuredClone(NEUTRAL_PRESET);
  draft.light.canvas = "#123456";
  draft.name = "</style><script>bad()</script>";
  const css = generateCss(draft);
  assert.match(css, /:root, \.light \{\n {2}--canvas: #123456;/);
  assert.match(css, /\.dark \{\n {2}--canvas: #1c1917;/);
  assert.equal(css.includes(draft.name), false);
  assert.equal(css, generateCss(structuredClone(draft)));
  assert.equal(css.includes("url("), false);
});

test("calculates known WCAG contrast boundaries", () => {
  assert.equal(contrastRatio("#000000", "#ffffff"), 21);
  assert.equal(contrastRatio("#123456", "#123456"), 1);
  assert.ok(contrastRatio("#777777", "#ffffff") < 4.5);
  assert.ok(contrastRatio("#767676", "#ffffff") > 4.5);
});
