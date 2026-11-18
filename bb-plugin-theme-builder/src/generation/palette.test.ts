import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { chatMethods } from "./contract.ts";
import { chatOpeningPrompt, parseChatReply } from "./palette.ts";

const ACCENT = "#a34bc5";
const REQUEST_ID = randomUUID();
const SUMMARY = "Warmer accent.";
const PALETTES = { light: NEUTRAL_PRESET.light, dark: NEUTRAL_PRESET.dark };
const reply = (extra: object = {}) =>
  JSON.stringify({
    requestId: REQUEST_ID,
    summary: SUMMARY,
    ...PALETTES,
    ...extra,
  });
const parse = (text: string, accent: string | null = null) =>
  parseChatReply(text, REQUEST_ID, accent);

test("accepts palette JSON and preserves the exact requested accent in both modes", () => {
  const result = parse(reply(), ACCENT).palette;
  assert.equal(result.light.primary, ACCENT);
  assert.equal(result.dark.primary, ACCENT);
  assert.notEqual(result.light.canvas, result.dark.canvas);
  assert.equal(result.light.ink, NEUTRAL_PRESET.light.ink);
});

test("accepts a single JSON fence but refuses prose, incomplete tokens, and injected CSS", () => {
  assert.deepEqual(
    parse(`\u0060\u0060\u0060json\n${reply()}\n\u0060\u0060\u0060`).palette,
    PALETTES,
  );
  for (const value of [
    `Here is your theme: ${reply()}`,
    reply({ light: {} }),
    reply({ css: "body{}" }),
    reply({
      light: { ...PALETTES.light, primary: "url(https://example.com)" },
    }),
  ])
    assert.throws(() => parse(value));
});

test("rejects oversized results before parsing and normalizes uppercase hex", () => {
  assert.throws(() => parse(" ".repeat(32769)));
  const result = parse(
    reply({ light: { ...PALETTES.light, primary: "#ABCDEF" } }),
  ).palette;
  assert.equal(result.light.primary, "#abcdef");
});

test("chat instructions carry an accent constraint and the request id without editor data", () => {
  const first = chatOpeningPrompt(ACCENT, "first", null, null);
  const second = chatOpeningPrompt(null, "second", null, null);
  assert.ok(first.includes(ACCENT));
  assert.ok(first.includes("first"));
  assert.ok(second.includes("second"));
  assert.ok(first.includes("primaryForeground"));
});

test("the chat start boundary normalizes accents and refuses unknown fields or invalid choices", () => {
  const input = {
    requestId: randomUUID(),
    selection: { providerId: "fixture", model: "model", reasoningLevel: "low" },
    accent: "#ABCDEF",
    palette: null,
  };
  const schema = chatMethods.chatStart.input;
  assert.equal(schema.parse(input).accent, "#abcdef");
  for (const value of [
    { ...input, accent: "#fff" },
    { ...input, prompt: "untrusted instructions" },
    { ...input, selection: { ...input.selection, model: "" } },
    { ...input, selection: { ...input.selection, reasoningLevel: "bogus" } },
  ])
    assert.equal(schema.safeParse(value).success, false);
});
