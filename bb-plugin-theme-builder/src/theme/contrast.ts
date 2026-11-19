import {
  MODES,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  type TokenKey,
} from "./tokens.ts";

const CHANNEL_STARTS = [1, 3, 5];
const CHANNEL_LENGTH = 2;
const HEX_RADIX = 16;
const CHANNEL_MAX = 255;
const SRGB_THRESHOLD = 0.04045;
const SRGB_DIVISOR = 12.92;
const SRGB_OFFSET = 0.055;
const SRGB_SCALE = 1.055;
const SRGB_EXPONENT = 2.4;
const WEIGHTS = [0.2126, 0.7152, 0.0722];
const CONTRAST_OFFSET = 0.05;
export const TEXT_CONTRAST_MINIMUM = 4.5;
const TEXT_PAIRS: readonly [TokenKey, TokenKey][] = [
  ["ink", "canvas"],
  ["mutedForeground", "canvas"],
  ["subtleForeground", "canvas"],
  ["readbackForeground", "canvas"],
  ["primaryForeground", "primary"],
  ["destructiveForeground", "destructive"],
  ["destructiveText", "canvas"],
  ["warningText", "canvas"],
  ["attention", "canvas"],
  ["success", "canvas"],
  ["diffAdded", "canvas"],
  ["diffRemoved", "canvas"],
  ["prMerged", "canvas"],
  ["fileAccent", "canvas"],
];

function luminance(color: string): number {
  return CHANNEL_STARTS.reduce((sum, start, index) => {
    const value =
      Number.parseInt(color.slice(start, start + CHANNEL_LENGTH), HEX_RADIX) /
      CHANNEL_MAX;
    const linear =
      value <= SRGB_THRESHOLD
        ? value / SRGB_DIVISOR
        : ((value + SRGB_OFFSET) / SRGB_SCALE) ** SRGB_EXPONENT;
    return sum + linear * WEIGHTS[index];
  }, 0);
}

export function contrastRatio(foreground: string, background: string): number {
  const first = luminance(foreground);
  const second = luminance(background);
  return (
    (Math.max(first, second) + CONTRAST_OFFSET) /
    (Math.min(first, second) + CONTRAST_OFFSET)
  );
}

export function contrastReport(draft: ThemeDraft) {
  return MODES.flatMap((mode) =>
    TEXT_PAIRS.map(([foreground, background]) => {
      const ratio = contrastRatio(
        draft[mode][foreground],
        draft[mode][background],
      );
      return {
        mode,
        label: `${TOKEN_DEFINITIONS[foreground].label} / ${TOKEN_DEFINITIONS[background].label}`,
        ratio,
        passes: ratio >= TEXT_CONTRAST_MINIMUM,
      };
    }),
  );
}
