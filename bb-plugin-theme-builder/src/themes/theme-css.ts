/**
 * Reads a bb theme.css into an editable draft and writes the draft back as a
 * copy of that CSS. Pure, so the page (preview, export) and the server
 * (Overwrite, Save as new) build byte-identical copies.
 */

import { ALPHA_COLOR_PATTERN, COLOR_PATTERN } from "../theme/color.ts";
import {
  FONT_MONO,
  FONT_SANS,
  generateCss,
  LIGHT_ROOT,
  MODE_SELECTORS,
  SIDEBAR_HOVER_TEXT,
} from "../theme/css.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import {
  autoHoverText,
  EXTRA_DEFINITIONS,
  EXTRA_KEYS,
  type ExtraKey,
  type ExtraTokens,
  extrasOf,
  isAutoHoverText,
  resolveExtras,
  type ThemeExtras,
} from "../theme/extras.ts";
import { derivedSidebar } from "../theme/sidebar.ts";
import {
  CODE_FONTS,
  MODES,
  type Mode,
  type PaletteTokens,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  TOKEN_KEYS,
  type TokenKey,
  UI_FONTS,
} from "../theme/tokens.ts";

/** Marks the one block the builder owns; everything else in the file is the theme author's CSS, kept verbatim. */
export const EDITS_MARKER = "/* theme-builder:edits */";
const ROOT_SELECTOR = ":root";
const MODE_CLASS: Record<string, Mode> = {
  ".light": "light",
  [LIGHT_ROOT]: "light",
  ".dark": "dark",
};
const COMMENT_OPEN = "/*";
const COMMENT_CLOSE = "*/";
const COMMENT_BLANK = " ";
const IMPORT_RULE = /@import\b[^;]*;?/gi;
// `</` inside a srcdoc <style> could close the element; `\/` is the same character to CSS.
const STYLE_CLOSE = /<\//g;
const STYLE_CLOSE_SAFE = "<\\/";
// Three or four digits (`#rgb`, `#rgba`); each one is doubled to the long form before the pattern check.
const SHORT_HEX = /^#[0-9a-f]{3,4}$/;
const WHITESPACE = /\s+/g;
const NEWLINE = "\n";
const CRLF = /\r\n?/g;
const PARAGRAPH = "\n\n";
const INDENT = "  ";
const RULE_CLOSE = "}";
// One line of an edits rule exactly as buildCopyCss writes it; sticky so it is matched in place, never searched for.
// Digits too: the terminal colors are --ansi-0 … --ansi-15.
const EDITS_LINE = / {2}(--[a-z0-9-]+): ([^;\n{}]+);\n/y;
const QUOTES = new Set(['"', "'"]);
const ESCAPE = "\\";
// The base parse only feeds the token diff, so its name is never read.
const BASE_NAME = "";
const TOKEN_BY_CSS = new Map<string, TokenKey>(
  TOKEN_KEYS.map((key) => [TOKEN_DEFINITIONS[key].css, key]),
);
const EXTRA_BY_CSS = new Map<string, ExtraKey>(
  EXTRA_KEYS.map((key) => [EXTRA_DEFINITIONS[key].css, key]),
);
const OUR_VARS = [
  ...TOKEN_BY_CSS.keys(),
  ...EXTRA_BY_CSS.keys(),
  FONT_SANS,
  FONT_MONO,
];
// A declaration of one of our variables anywhere in a block, used to spot rules that style parts directly.
const OUR_DECLARATION = new RegExp(
  `(?:^|[;{\\s])(?:${OUR_VARS.map((name) => name.replace(/-/g, "\\-")).join("|")})\\s*:`,
);
const COLOR_VARS = new Set(TOKEN_BY_CSS.keys());
// Font values the writer can emit, so only its own font lines count as part of an edits block.
const FONT_STACKS = new Map<string, Set<string>>([
  [FONT_SANS, new Set(Object.values(UI_FONTS).map((font) => font.stack))],
  [FONT_MONO, new Set(Object.values(CODE_FONTS).map((font) => font.stack))],
]);

type Rule = { prelude: string; body: string };
/**
 * Per mode, the keys whose final value in the source is a hex the editor can
 * read. A key absent here is inherited (from Neutral or the derived sidebar),
 * including one whose last value is a form the editor cannot read.
 */
type ModeValues = Record<
  Mode,
  { core: Map<TokenKey, string>; extras: Map<ExtraKey, string> }
>;
type Fonts = { sans: string | null; mono: string | null };
/** A theme read into the editor's model plus whether some of it escapes that model. */
export type ParsedTheme = { draft: ThemeDraft; scopedOverrides: boolean };
/** The author's CSS without the builder's edits block, and the palette it paints on its own. */
type CopySource = {
  css: string;
  source: string;
  hadEdits: boolean;
  base: ThemeDraft;
};

/** Index just past a quoted string starting at `start`, so braces inside strings are not counted. */
function skipString(css: string, start: number): number {
  const quote = css[start];
  let index = start + 1;
  while (index < css.length && css[index] !== quote) {
    if (css[index] === ESCAPE) index += 1;
    index += 1;
  }
  return index;
}

/**
 * The CSS with each comment blanked, in one left-to-right pass: a regex over
 * `/*` runs takes quadratic time on an unclosed one, and strings are copied
 * whole so a `/*` inside a string is not taken for a comment.
 */
function stripComments(css: string): string {
  const parts: string[] = [];
  let copied = 0;
  let index = 0;
  while (index < css.length) {
    if (QUOTES.has(css[index])) {
      index = skipString(css, index) + 1;
    } else if (css.startsWith(COMMENT_OPEN, index)) {
      parts.push(css.slice(copied, index), COMMENT_BLANK);
      const close = css.indexOf(COMMENT_CLOSE, index + COMMENT_OPEN.length);
      index = close < 0 ? css.length : close + COMMENT_CLOSE.length;
      copied = index;
    } else {
      index += 1;
    }
  }
  parts.push(css.slice(copied));
  return parts.join("");
}

/** Top-level rules in source order; statements such as `@import x;` have no body and are skipped. */
function topLevelRules(css: string): Rule[] {
  const rules: Rule[] = [];
  let depth = 0;
  let start = 0;
  let bodyStart = 0;
  let prelude = "";
  for (let index = 0; index < css.length; index += 1) {
    const char = css[index];
    if (QUOTES.has(char)) {
      index = skipString(css, index);
    } else if (char === "{") {
      if (depth === 0) {
        prelude = css.slice(start, index).trim();
        bodyStart = index + 1;
      }
      depth += 1;
    } else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) {
        rules.push({ prelude, body: css.slice(bodyStart, index) });
        start = index + 1;
      }
    } else if ((char === ";" || char === "}") && depth === 0) {
      start = index + 1;
    }
  }
  return rules;
}

/** Plain `name: value` declarations of one block; nested blocks are returned apart so they can be judged as other selectors. */
function declarations(body: string): {
  values: [string, string][];
  nested: string[];
} {
  const values: [string, string][] = [];
  const nested: string[] = [];
  let depth = 0;
  let start = 0;
  const flush = (end: number) => {
    const segment = body.slice(start, end);
    start = end + 1;
    if (segment.includes("{")) {
      nested.push(segment);
      return;
    }
    const colon = segment.indexOf(":");
    if (colon > 0)
      values.push([
        segment.slice(0, colon).trim().toLowerCase(),
        segment.slice(colon + 1).trim(),
      ]);
  };
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (QUOTES.has(char)) index = skipString(body, index);
    else if (char === "{") depth += 1;
    else if (char === "}" && depth > 0) {
      depth -= 1;
      if (depth === 0) flush(index);
    } else if (char === ";" && depth === 0) flush(index);
  }
  flush(body.length);
  return { values, nested };
}

/**
 * Lowercase long hex when the value matches `pattern` (core tokens take six
 * digits; extras may add alpha), or null for any other form (names,
 * functions, variables) that the editor cannot read.
 */
function hexColor(value: string, pattern: RegExp): string | null {
  const color = value.toLowerCase();
  const long = SHORT_HEX.test(color)
    ? `#${[...color.slice(1)].map((digit) => digit + digit).join("")}`
    : color;
  return pattern.test(long) ? long : null;
}

/** Modes a selector list paints: `:root` is both, `.light`/`.dark` one each; anything else is not a palette rule. */
function modesOf(prelude: string): Mode[] {
  if (prelude.startsWith("@")) return [];
  const items = prelude.split(",").map((item) => item.trim());
  if (items.includes(ROOT_SELECTOR)) return [...MODES];
  return MODES.filter((mode) =>
    items.some((item) => MODE_CLASS[item] === mode),
  );
}

/** Font key whose stack matches exactly (spacing aside), else the system stack the editor shows by default. */
function fontKey<K extends string>(
  value: string | null,
  table: Record<K, { stack: string }>,
): K | "system" {
  if (value === null) return "system";
  const wanted = value.replace(WHITESPACE, " ").trim();
  const match = (Object.keys(table) as K[]).find(
    (key) => table[key].stack === wanted,
  );
  return match ?? "system";
}

/**
 * One mode's palette: parsed values, then each sidebar color the theme leaves out derived from Background and Text,
 * then Neutral for the rest. bb fills sidebar colors one by one from its own mixes, so deriving per key keeps the
 * editor showing what bb paints and keeps a reopened sidebar-only edit from pinning Neutral sidebar colors on resave.
 */
function fillPalette(parsed: Map<TokenKey, string>, mode: Mode): PaletteTokens {
  const values = Object.fromEntries(parsed) as Partial<PaletteTokens>;
  const neutral = NEUTRAL_PRESET[mode];
  const canvas = values.canvas ?? neutral.canvas;
  const ink = values.ink ?? neutral.ink;
  return {
    ...neutral,
    ...derivedSidebar(canvas, ink, mode),
    ...values,
    canvas,
    ink,
  };
}

/** Records one parsed value per mode; a later value the editor cannot read hides an earlier hex, so the key is not counted as set there. */
function setParsed<K extends "core" | "extras">(
  palette: ModeValues,
  modes: Mode[],
  kind: K,
  key: K extends "core" ? TokenKey : ExtraKey,
  color: string | null,
) {
  for (const mode of modes) {
    const values = palette[mode][kind] as Map<typeof key, string>;
    if (color === null) values.delete(key);
    else values.set(key, color);
  }
}

/** Applies one palette rule's declarations in source order, so later rules win as they do in the browser. */
function readPaletteRule(
  values: [string, string][],
  modes: Mode[],
  palette: ModeValues,
  fonts: Fonts,
) {
  for (const [name, value] of values) {
    if (name === FONT_SANS) fonts.sans = value;
    else if (name === FONT_MONO) fonts.mono = value;
    const core = TOKEN_BY_CSS.get(name);
    const extra = EXTRA_BY_CSS.get(name);
    if (core !== undefined)
      setParsed(palette, modes, "core", core, hexColor(value, COLOR_PATTERN));
    else if (extra !== undefined)
      setParsed(
        palette,
        modes,
        "extras",
        extra,
        hexColor(value, ALPHA_COLOR_PATTERN),
      );
  }
}

/**
 * The extra tokens a theme sets, per mode. A Sidebar hover text equal to
 * Sidebar text is the line the writer adds on its own, not a user choice, so
 * it is left to follow Sidebar text instead of being pinned.
 */
function readExtras(
  palette: ModeValues,
  filled: Record<Mode, PaletteTokens>,
): { extras?: ThemeExtras } {
  const extras: ThemeExtras = { light: {}, dark: {} };
  let count = 0;
  for (const mode of MODES) {
    for (const key of EXTRA_KEYS) {
      const value = palette[mode].extras.get(key);
      if (value === undefined) continue;
      if (
        key === "sidebarAccentForeground" &&
        isAutoHoverText(filled[mode], value)
      )
        continue;
      extras[mode][key] = value;
      count += 1;
    }
  }
  return count === 0 ? {} : { extras };
}

/**
 * Reads the palette bb would paint from a theme's own CSS. Only top-level
 * `:root`, `.light` and `.dark` rules count; any other rule that sets one of
 * our variables is reported, because it styles a part directly and the editor
 * cannot follow it.
 */
export function parseThemeCss(css: string, name: string): ParsedTheme {
  const palette: ModeValues = {
    light: { core: new Map(), extras: new Map() },
    dark: { core: new Map(), extras: new Map() },
  };
  const fonts: Fonts = { sans: null, mono: null };
  let scopedOverrides = false;
  for (const rule of topLevelRules(stripComments(css))) {
    const modes = modesOf(rule.prelude);
    if (modes.length === 0) {
      scopedOverrides ||= OUR_DECLARATION.test(rule.body);
      continue;
    }
    const { values, nested } = declarations(rule.body);
    readPaletteRule(values, modes, palette, fonts);
    scopedOverrides ||= nested.some((block) => OUR_DECLARATION.test(block));
  }
  const filled = {
    light: fillPalette(palette.light.core, "light"),
    dark: fillPalette(palette.dark.core, "dark"),
  };
  return {
    draft: {
      ...NEUTRAL_PRESET,
      name,
      ...filled,
      ...readExtras(palette, filled),
      uiFont: fontKey(fonts.sans, UI_FONTS),
      codeFont: fontKey(fonts.mono, CODE_FONTS),
    },
    scopedOverrides,
  };
}

/** True for a declaration buildCopyCss itself writes: one of our colours as hex, or a font stack it offers. */
function writerDeclaration(name: string, value: string): boolean {
  if (COLOR_VARS.has(name)) return COLOR_PATTERN.test(value);
  if (EXTRA_BY_CSS.has(name)) return ALPHA_COLOR_PATTERN.test(value);
  return FONT_STACKS.get(name)?.has(value) ?? false;
}

/** End of the edits rule for `mode` starting exactly at `at`, or null when the text there is not one the writer made. */
function writerRuleEnd(css: string, at: number, mode: Mode): number | null {
  const head = `${MODE_SELECTORS[mode]} {${NEWLINE}`;
  if (!css.startsWith(head, at)) return null;
  let index = at + head.length;
  let lines = 0;
  for (;;) {
    EDITS_LINE.lastIndex = index;
    const line = EDITS_LINE.exec(css);
    if (line === null) break;
    if (!writerDeclaration(line[1], line[2])) return null;
    index = EDITS_LINE.lastIndex;
    lines += 1;
  }
  if (lines === 0 || !css.startsWith(RULE_CLOSE, index)) return null;
  index += RULE_CLOSE.length;
  return css.startsWith(NEWLINE, index) ? index + NEWLINE.length : index;
}

/**
 * Span of the marker plus the writer's own rules right after it (light,
 * then dark, either may be missing), or null when that marker is not
 * followed by at least one such rule: then it is the author's text.
 */
function editsSpan(css: string, marker: number) {
  const first = marker + EDITS_MARKER.length;
  if (!css.startsWith(NEWLINE, first)) return null;
  let end = first + NEWLINE.length;
  let rules = 0;
  for (const mode of MODES) {
    const ruleEnd = writerRuleEnd(css, end, mode);
    if (ruleEnd === null) continue;
    end = ruleEnd;
    rules += 1;
  }
  return rules === 0 ? null : { start: marker, end };
}

/**
 * The author's CSS with the builder's edits block cut out, so each save
 * diffs against the original and never against itself. Only the last marker
 * that is followed by the writer's own rules counts (the writer always
 * appends, so the last one is its newest); CSS after the block and markers
 * not followed by such rules are the author's and are kept. Space at the
 * seams is dropped so repeated saves put the block at the same place.
 */
function splitEdits(css: string): { source: string; hadEdits: boolean } {
  let span: { start: number; end: number } | null = null;
  for (
    let marker = css.indexOf(EDITS_MARKER);
    marker >= 0;
    marker = css.indexOf(EDITS_MARKER, marker + EDITS_MARKER.length)
  )
    span = editsSpan(css, marker) ?? span;
  if (span === null) return { source: css.trimEnd(), hadEdits: false };
  const parts = [
    css.slice(0, span.start).trimEnd(),
    css.slice(span.end).trim(),
  ].filter((part) => part !== "");
  return { source: parts.join(PARAGRAPH), hadEdits: true };
}

// The page rebuilds the copy on every keystroke from the same source; keyed by the CSS itself (not the page's hash) so server and export calls hit it too and can never get another file's parse.
let lastSource: CopySource | null = null;
/** The source split and parsed once per distinct CSS. */
function copySource(css: string): CopySource {
  if (lastSource?.css !== css) {
    // The writer emits LF only; a CRLF file (edited on Windows) would otherwise hide its edits block and gain a second one on every save.
    const { source, hadEdits } = splitEdits(css.replace(CRLF, NEWLINE));
    const base = parseThemeCss(source, BASE_NAME).draft;
    lastSource = { css, source, hadEdits, base };
  }
  return lastSource;
}

/**
 * Extra-token lines of one mode's edits block: each override that differs
 * from the theme's own. An override the user cleared while the theme itself
 * sets the token cannot be removed by an appended block, so it is written as
 * the color bb derives, which is what the editor shows.
 */
function extraLines(
  base: ThemeDraft,
  draft: ThemeDraft,
  mode: Mode,
  overrides: ExtraTokens,
): string[] {
  const own = extrasOf(base.extras, mode);
  // resolveExtras returns the override when one is set, else the derived color.
  const resolved = resolveExtras(draft[mode], overrides, mode);
  return EXTRA_KEYS.filter((key) => overrides[key] !== own[key]).map(
    (key) => `${INDENT}${EXTRA_DEFINITIONS[key].css}: ${resolved[key]};`,
  );
}

/** One mode's lines of the edits block: only tokens whose value in that mode differs from the theme's own. */
function modeLines(
  base: ThemeDraft,
  draft: ThemeDraft,
  mode: Mode,
  fontLines: string[],
): string[] {
  const keys = TOKEN_KEYS.filter((key) => draft[mode][key] !== base[mode][key]);
  const lines = keys.map(
    (key) => `${INDENT}${TOKEN_DEFINITIONS[key].css}: ${draft[mode][key]};`,
  );
  const overrides = extrasOf(draft.extras, mode);
  const extras = extraLines(base, draft, mode, overrides);
  const hover = autoHoverText(draft[mode], overrides);
  const hoverLine = `${INDENT}${SIDEBAR_HOVER_TEXT}: `;
  // extraLines already writes the hover text when a theme-owned pin was cleared; one line is enough.
  const hoverWritten = extras.some((line) => line.startsWith(hoverLine));
  if (
    keys.includes("sidebarForeground") &&
    hover !== undefined &&
    !hoverWritten
  )
    lines.push(`${hoverLine}${hover};`);
  return [...lines, ...extras, ...fontLines];
}

/**
 * The CSS a saved copy holds. A theme with CSS keeps it verbatim plus one
 * edits block of only the values that differ from it; a built-in or plugin
 * theme exposes no CSS, so its copy is the full generated theme.
 */
export function buildCopyCss(css: string | null, draft: ThemeDraft): string {
  if (css === null) return generateCss(draft);
  const { source, hadEdits, base } = copySource(css);
  const fontLines = [
    ...(draft.uiFont === base.uiFont
      ? []
      : [`${INDENT}${FONT_SANS}: ${UI_FONTS[draft.uiFont].stack};`]),
    ...(draft.codeFont === base.codeFont
      ? []
      : [`${INDENT}${FONT_MONO}: ${CODE_FONTS[draft.codeFont].stack};`]),
  ];
  const blocks = MODES.flatMap((mode) => {
    const lines = modeLines(base, draft, mode, fontLines);
    return lines.length === 0
      ? []
      : [`${MODE_SELECTORS[mode]} {`, ...lines, RULE_CLOSE];
  });
  // Nothing to change: an untouched theme stays byte-identical, and a stale edits block is dropped.
  if (blocks.length === 0) {
    if (!hadEdits) return css;
    return source === "" ? "" : `${source}${NEWLINE}`;
  }
  const head = source === "" ? "" : `${source}${PARAGRAPH}`;
  return `${head}${EDITS_MARKER}${NEWLINE}${blocks.join(NEWLINE)}${NEWLINE}`;
}

/** Theme CSS made safe to inline in the preview's srcdoc: no network imports and no way to close the style element. */
export function previewSafeCss(css: string): string {
  return css.replace(IMPORT_RULE, "").replace(STYLE_CLOSE, STYLE_CLOSE_SAFE);
}
