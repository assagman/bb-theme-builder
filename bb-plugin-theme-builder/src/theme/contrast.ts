import { hexToLinearRgb } from "./color.ts";
import {
  MODES,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  type TokenKey,
} from "./tokens.ts";

const WEIGHTS = [0.2126, 0.7152, 0.0722];
const CONTRAST_OFFSET = 0.05;
export const TEXT_CONTRAST_MINIMUM = 4.5;
// Exported so the randomizer repairs exactly the pairs the contrast report audits.
export const TEXT_PAIRS: readonly [TokenKey, TokenKey][] = [
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

/** Relative luminance (WCAG) built on the shared sRGB decoder so contrast and color math cannot drift apart. */
function luminance(color: string): number {
  return hexToLinearRgb(color).reduce(
    (sum, linear, index) => sum + linear * WEIGHTS[index],
    0,
  );
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
