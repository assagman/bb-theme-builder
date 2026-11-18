import { hexToLinearRgb } from "./color.ts";
import { COLOR_PATTERN } from "./schema.ts";
import type { PaletteTokens, TokenKey } from "./tokens.ts";

const WEIGHTS = [0.2126, 0.7152, 0.0722];
const CONTRAST_OFFSET = 0.05;
export const TEXT_CONTRAST_MINIMUM = 4.5;
// Exported so the randomizer repairs exactly the pairs the Edit tab badges audit.
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

/** Outcome of the worst text pair a token takes part in as foreground. */
export type TokenContrast = { ratio: number; passes: boolean };

/**
 * Worst contrast of `key` as foreground across TEXT_PAIRS, or null when the
 * token is never text or a color involved is not a valid hex yet. The worst
 * pair is reported because a token that fails against any background is not
 * safe to call readable. Invalid hex is skipped so typing a half-written
 * color never throws inside render.
 */
export function tokenContrast(
  palette: PaletteTokens,
  key: TokenKey,
): TokenContrast | null {
  const ratios = TEXT_PAIRS.filter(([foreground]) => foreground === key)
    .filter(([foreground, background]) =>
      [palette[foreground], palette[background]].every((color) =>
        COLOR_PATTERN.test(color),
      ),
    )
    .map(([foreground, background]) =>
      contrastRatio(palette[foreground], palette[background]),
    );
  if (ratios.length === 0) return null;
  const ratio = Math.min(...ratios);
  return { ratio, passes: ratio >= TEXT_CONTRAST_MINIMUM };
}
