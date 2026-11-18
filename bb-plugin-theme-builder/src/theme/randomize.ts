import {
  ACCENT_PATTERN,
  type GeneratedPalette,
} from "../generation/contract.ts";
import { hexToOklch, oklchToHex, wrapHue } from "./color.ts";
import {
  contrastRatio,
  TEXT_CONTRAST_MINIMUM,
  TEXT_PAIRS,
} from "./contrast.ts";
import {
  MODES,
  type Mode,
  type PaletteTokens,
  type TokenKey,
} from "./tokens.ts";

const DEGREES_PER_TURN = 360;
// Each step is small enough to land near the minimum ratio instead of overshooting into harsh extremes.
const LIGHTNESS_STEP = 0.02;
const MAX_REPAIR_STEPS = 50;
const LIGHTNESS_MIN = 0;
const LIGHTNESS_MAX = 1;
// Only text that sits on a filled surface may collapse to black or white: it has no canvas-grade lightness range to walk through, and a mid-tone exact accent can defeat every tint.
const FILL_FOREGROUNDS: ReadonlySet<TokenKey> = new Set([
  "primaryForeground",
  "destructiveForeground",
]);
const BLACK = "#000000";
const WHITE = "#ffffff";

// Fixed hues keep status colors recognizable whatever accent the user picks.
const STATUS_HUES = {
  destructive: 25,
  warning: 75,
  success: 145,
  attention: 250,
  prMerged: 300,
};

// Palette chroma bounds: an achromatic accent must still yield visible status colors, and very high chroma clips out of gamut.
const MIN_PALETTE_CHROMA = 0.08;
const MAX_PALETTE_CHROMA = 0.2;
const RANDOM_CHROMA_SPAN = MAX_PALETTE_CHROMA - MIN_PALETTE_CHROMA;
// Canvas and ink carry only a whisper of the hue so surfaces feel related to the accent without tinting text noticeably.
const TINT_CHROMA_BASE = 0.006;
const TINT_CHROMA_JITTER = 0.008;
const TINT_CHROMA_INK_FACTOR = 1.5;
// File paths sit slightly off the accent hue so they read as a distinct role, not a second primary.
const FILE_ACCENT_HUE_DRIFT = 12;

type Lightness = {
  canvas: number;
  ink: number;
  muted: number;
  subtle: number;
  readback: number;
  primary: number;
  fill: number;
  text: number;
};

// Light and dark ramps are authored separately because perceived contrast is not symmetric; the repair pass only trims the remainder.
const LIGHTNESS: Record<Mode, Lightness> = {
  light: {
    canvas: 0.985,
    ink: 0.22,
    muted: 0.44,
    subtle: 0.5,
    readback: 0.47,
    primary: 0.48,
    fill: 0.52,
    text: 0.45,
  },
  dark: {
    canvas: 0.2,
    ink: 0.97,
    muted: 0.86,
    subtle: 0.74,
    readback: 0.78,
    primary: 0.78,
    fill: 0.78,
    text: 0.8,
  },
};

const PRNG_INCREMENT = 0x6d2b79f5;
const PRNG_SHIFT_A = 15;
const PRNG_SHIFT_B = 7;
const PRNG_SHIFT_C = 14;
const PRNG_MIX = 61;
const PRNG_RANGE = 4294967296;

/** Seeded PRNG so a (accent, seed) pair always reproduces the same theme. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + PRNG_INCREMENT) >>> 0;
    let mixed = Math.imul(state ^ (state >>> PRNG_SHIFT_A), state | 1);
    mixed ^=
      mixed + Math.imul(mixed ^ (mixed >>> PRNG_SHIFT_B), mixed | PRNG_MIX);
    return ((mixed ^ (mixed >>> PRNG_SHIFT_C)) >>> 0) / PRNG_RANGE;
  };
}

/** Raised when the accent is not `#rrggbb`, so a typo fails loudly instead of yielding a palette that fails schema validation downstream. */
export class InvalidAccentError extends Error {
  constructor(accent: unknown) {
    super(`Accent must match #rrggbb: ${JSON.stringify(accent)}`);
    this.name = "InvalidAccentError";
  }
}

/** Raised for seeds that would silently alias to another seed (fractions, NaN, Infinity, beyond 2^53). */
export class InvalidSeedError extends Error {
  constructor(seed: unknown) {
    super(`Seed must be a safe integer: ${String(seed)}`);
    this.name = "InvalidSeedError";
  }
}

/** Hue, chroma, and optional exact accent shared by both modes so light and dark read as one theme. */
type PaletteBase = { hue: number; chroma: number; accent: string | null };

/** Keeps palette chroma inside a range that stays visible for gray accents and displayable for neon ones. */
function clampChroma(chroma: number): number {
  return Math.min(MAX_PALETTE_CHROMA, Math.max(MIN_PALETTE_CHROMA, chroma));
}

/**
 * Moves the foreground away from its background until the text contrast
 * minimum holds. If stepping runs out, fill foregrounds fall back to black or
 * white (a mid-tone exact accent can defeat every tint) while other text jumps
 * to the extreme lightness at the same hue so status colors keep their hue.
 */
function repairPair(
  foreground: string,
  background: string,
  allowMonochrome: boolean,
): string {
  if (contrastRatio(foreground, background) >= TEXT_CONTRAST_MINIMUM) {
    return foreground;
  }
  const start = hexToOklch(foreground);
  const lighter = start.l >= hexToOklch(background).l;
  const direction = lighter ? LIGHTNESS_STEP : -LIGHTNESS_STEP;
  for (let step = 1; step <= MAX_REPAIR_STEPS; step += 1) {
    const candidate = oklchToHex({ ...start, l: start.l + direction * step });
    if (contrastRatio(candidate, background) >= TEXT_CONTRAST_MINIMUM) {
      return candidate;
    }
  }
  if (allowMonochrome) {
    return contrastRatio(BLACK, background) >= contrastRatio(WHITE, background)
      ? BLACK
      : WHITE;
  }
  return oklchToHex({ ...start, l: lighter ? LIGHTNESS_MAX : LIGHTNESS_MIN });
}

/**
 * Produces the unrepaired token set for one mode from the authored ramp, so
 * design intent (hierarchy, tint) lives here and contrast fixing stays separate.
 */
function draftTokens(
  mode: Mode,
  base: PaletteBase,
  rng: () => number,
): PaletteTokens {
  const ramp = LIGHTNESS[mode];
  const { hue, chroma } = base;
  const tint = TINT_CHROMA_BASE + rng() * TINT_CHROMA_JITTER;
  const color = (l: number, c: number, h: number) => oklchToHex({ l, c, h });
  const status = (l: number, statusHue: number) => color(l, chroma, statusHue);
  // Starting labels are the mode's natural extreme; repair only moves them if the fill demands it.
  const onFill = mode === "light" ? WHITE : BLACK;
  return {
    canvas: color(ramp.canvas, tint, hue),
    ink: color(ramp.ink, tint * TINT_CHROMA_INK_FACTOR, hue),
    primary: base.accent ?? color(ramp.primary, chroma, hue),
    primaryForeground: onFill,
    mutedForeground: color(ramp.muted, tint, hue),
    subtleForeground: color(ramp.subtle, tint, hue),
    readbackForeground: color(ramp.readback, tint, hue),
    destructive: status(ramp.fill, STATUS_HUES.destructive),
    destructiveForeground: onFill,
    destructiveText: status(ramp.text, STATUS_HUES.destructive),
    warning: status(ramp.fill, STATUS_HUES.warning),
    warningText: status(ramp.text, STATUS_HUES.warning),
    attention: status(ramp.text, STATUS_HUES.attention),
    success: status(ramp.text, STATUS_HUES.success),
    diffAdded: status(ramp.text, STATUS_HUES.success),
    diffRemoved: status(ramp.text, STATUS_HUES.destructive),
    prMerged: status(ramp.text, STATUS_HUES.prMerged),
    fileAccent: color(ramp.text, chroma, wrapHue(hue + FILE_ACCENT_HUE_DRIFT)),
  };
}

/** Enforces the contrast minimum on every audited pair, so the authored ramp can stay expressive and still ship accessible. */
function repairDraft(draft: PaletteTokens): PaletteTokens {
  const repaired = { ...draft };
  for (const [foreground, background] of TEXT_PAIRS) {
    repaired[foreground] = repairPair(
      repaired[foreground],
      repaired[background],
      FILL_FOREGROUNDS.has(foreground),
    );
  }
  return repaired;
}

/**
 * Builds a contrast-passing light and dark palette instantly with no model or
 * network. The same (accent, seed) always yields the same palette so a
 * Randomize click is reproducible and testable. The seed is reduced to uint32
 * by the PRNG, so seeds equal modulo 2^32 (including negatives) coincide.
 * Throws InvalidAccentError or InvalidSeedError on bad input.
 */
export function randomizePalette(
  accent: string | null,
  seed: number,
): GeneratedPalette {
  if (accent !== null && !ACCENT_PATTERN.test(accent)) {
    throw new InvalidAccentError(accent);
  }
  if (!Number.isSafeInteger(seed)) {
    throw new InvalidSeedError(seed);
  }
  const rng = mulberry32(seed);
  const normalized = accent === null ? null : accent.toLowerCase();
  const accentColor = normalized === null ? null : hexToOklch(normalized);
  const base: PaletteBase = {
    accent: normalized,
    hue: accentColor === null ? rng() * DEGREES_PER_TURN : accentColor.h,
    chroma: clampChroma(
      accentColor === null
        ? MIN_PALETTE_CHROMA + rng() * RANDOM_CHROMA_SPAN
        : accentColor.c,
    ),
  };
  return Object.fromEntries(
    MODES.map((mode) => [mode, repairDraft(draftTokens(mode, base, rng))]),
  ) as GeneratedPalette;
}
