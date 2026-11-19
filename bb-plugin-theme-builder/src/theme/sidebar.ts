import {
  COLOR_PATTERN,
  hexToOklch,
  type Oklch,
  oklchToHex,
  wrapHue,
} from "./color.ts";
import {
  type Mode,
  type TOKEN_DEFINITIONS,
  type TokenKey,
  tokensInGroup,
} from "./tokens.ts";

/**
 * Sidebar colors that a theme saved before they existed does not hold.
 * bb derives them from Background and Text when a theme leaves them out, so
 * filling them with the same mixes keeps an old theme looking as it did.
 */
export type SidebarKey = {
  [K in TokenKey]: (typeof TOKEN_DEFINITIONS)[K]["group"] extends "sidebar"
    ? K
    : never;
}[TokenKey];
// Read from the token table, so a new sidebar token is upgraded too; derivedSidebar's return type then fails to compile until it is derived.
export const SIDEBAR_KEYS = tokensInGroup("sidebar") as SidebarKey[];

/**
 * Share of Text mixed into Background, per mode, copied from bb's base theme
 * (`color-mix(in oklch, var(--ink) N%, var(--canvas))`). Dark mode needs more
 * Text for the same visible step, which is why bb authors the modes apart.
 */
const BB_SIDEBAR_MIX: Record<
  Mode,
  Record<Exclude<SidebarKey, "sidebarForeground">, number>
> = {
  light: { sidebar: 0.022, sidebarAccent: 0.08, sidebarBorder: 0.14 },
  dark: { sidebar: 0.043, sidebarAccent: 0.12, sidebarBorder: 0.181 },
};
const DEGREES_PER_TURN = 360;
const HALF_TURN = 180;
// Below this chroma CSS treats the hue as missing and takes the other color's hue.
const POWERLESS_HUE_CHROMA = 1e-4;

/** Hue step along the shorter arc, which is CSS color-mix's default hue path. */
function shorterHueDelta(from: number, to: number): number {
  const delta = to - from;
  if (delta > HALF_TURN) return delta - DEGREES_PER_TURN;
  if (delta < -HALF_TURN) return delta + DEGREES_PER_TURN;
  return delta;
}

/**
 * Same result as CSS `color-mix(in oklch, top share, base)`, so a derived
 * sidebar matches what bb paints when the theme leaves the token out.
 */
export function mixOklch(top: string, base: string, share: number): string {
  const a = hexToOklch(top);
  const b = hexToOklch(base);
  const hueA = a.c < POWERLESS_HUE_CHROMA ? b.h : a.h;
  const hueB = b.c < POWERLESS_HUE_CHROMA ? a.h : b.h;
  const mixed: Oklch = {
    l: b.l + (a.l - b.l) * share,
    c: b.c + (a.c - b.c) * share,
    h: wrapHue(hueB + shorterHueDelta(hueB, hueA) * share),
  };
  return oklchToHex(mixed);
}

/** bb's own sidebar colors for a Background and Text pair. */
export function derivedSidebar(
  canvas: string,
  ink: string,
  mode: Mode,
): Record<SidebarKey, string> {
  const mix = BB_SIDEBAR_MIX[mode];
  return {
    sidebar: mixOklch(ink, canvas, mix.sidebar),
    sidebarForeground: ink,
    sidebarAccent: mixOklch(ink, canvas, mix.sidebarAccent),
    sidebarBorder: mixOklch(ink, canvas, mix.sidebarBorder),
  };
}

/**
 * Applies one hand edit to a palette. While the sidebar still holds bb's
 * mixes of the old Background and Text, a Background or Text edit re-derives
 * it, so the sidebar keeps following the main screen as it did before it had
 * its own colors. Once the user (or the agent) customizes any sidebar color,
 * the link breaks and their choice is kept.
 * `anchor` is the last valid Background and Text of this mode: a hex field
 * passes through half-typed values, and judging the link against those would
 * break it for good after the first deleted character.
 */
export function editToken<P extends Record<TokenKey, string>>(
  palette: P,
  key: TokenKey,
  value: string,
  mode: Mode,
  anchor: SidebarAnchor,
): P {
  const next = { ...palette, [key]: value };
  if (key !== "canvas" && key !== "ink") return next;
  // No valid anchor (a draft restored half-typed): the link cannot be judged, so keep the sidebar rather than throw.
  if (![anchor.canvas, anchor.ink].every((c) => COLOR_PATTERN.test(c)))
    return next;
  const linked = derivedSidebar(anchor.canvas, anchor.ink, mode);
  if (!SIDEBAR_KEYS.every((k) => palette[k] === linked[k])) return next;
  // Still linked: wait for a complete color before moving the sidebar.
  if (![next.canvas, next.ink].every((c) => COLOR_PATTERN.test(c))) return next;
  return { ...next, ...derivedSidebar(next.canvas, next.ink, mode) };
}

/** Last valid Background and Text of one mode, which the sidebar link is judged against. */
export type SidebarAnchor = { canvas: string; ink: string };

/** The anchor after a draft change: moves only when both colors are valid, so half-typed hex keeps the previous one. */
export function nextAnchor(
  previous: SidebarAnchor,
  palette: SidebarAnchor,
): SidebarAnchor {
  return [palette.canvas, palette.ink].every((c) => COLOR_PATTERN.test(c))
    ? { canvas: palette.canvas, ink: palette.ink }
    : previous;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isHex = (value: unknown): value is string =>
  typeof value === "string" && COLOR_PATTERN.test(value);

/**
 * Fills sidebar colors missing from one stored palette. Runs before schema
 * validation, so it never trusts the input: it only adds keys when Background
 * and Text are valid hex, and leaves everything else for the schema to reject.
 */
function withSidebar(palette: unknown, mode: Mode): unknown {
  if (!isRecord(palette) || !isHex(palette.canvas) || !isHex(palette.ink))
    return palette;
  if (SIDEBAR_KEYS.every((key) => key in palette)) return palette;
  const derived = derivedSidebar(palette.canvas, palette.ink, mode);
  const filled: Record<string, unknown> = { ...palette };
  for (const key of SIDEBAR_KEYS)
    if (!(key in filled)) filled[key] = derived[key];
  return filled;
}

/**
 * Upgrades any value holding `light` and `dark` palettes (drafts, presets,
 * agent replies, chat checkpoints) saved before the sidebar colors existed.
 * Returns the input unchanged when it has another shape.
 */
export function upgradePalettes(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...("light" in value ? { light: withSidebar(value.light, "light") } : {}),
    ...("dark" in value ? { dark: withSidebar(value.dark, "dark") } : {}),
  };
}

const upgradeTurn = (turn: unknown): unknown =>
  isRecord(turn) && "palette" in turn
    ? { ...turn, palette: upgradePalettes(turn.palette) }
    : turn;

/**
 * Upgrades the palettes of a chat session stored before the sidebar colors
 * existed (its turns and its last agent palette), so an open chat survives the
 * plugin update instead of being dropped as corrupt.
 */
export function upgradeSessionPalettes(value: unknown): unknown {
  if (!isRecord(value)) return value;
  return {
    ...value,
    ...(Array.isArray(value.turns)
      ? { turns: value.turns.map(upgradeTurn) }
      : {}),
    ...("lastAgentPalette" in value
      ? { lastAgentPalette: upgradePalettes(value.lastAgentPalette) }
      : {}),
  };
}
