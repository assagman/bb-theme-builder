import type { PaletteTokens, ThemeDraft, TokenKey } from "./tokens.ts";

/** Order is the contract with the theme list: background, text, accent, accent text, so one strip previews a theme. */
export const SWATCH_TOKENS = [
  "canvas",
  "ink",
  "primary",
  "primaryForeground",
] as const satisfies readonly TokenKey[];
/** Number of colors per mode in a swatch; the list schema pins its tuples to this. */
export type SwatchColors = [string, string, string, string];
/** Both modes of a theme, small enough to ship with every list item. */
export type Swatch = { light: SwatchColors; dark: SwatchColors };

function colorsOf(palette: PaletteTokens): SwatchColors {
  const [canvas, ink, primary, primaryForeground] = SWATCH_TOKENS;
  return [
    palette[canvas],
    palette[ink],
    palette[primary],
    palette[primaryForeground],
  ];
}

/** Shared by the server list and the client's optimistic list update so both always agree on what a swatch is. */
export function swatchOf(theme: Pick<ThemeDraft, "light" | "dark">): Swatch {
  return { light: colorsOf(theme.light), dark: colorsOf(theme.dark) };
}
