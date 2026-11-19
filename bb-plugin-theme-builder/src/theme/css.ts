import {
  autoHoverText,
  EXTRA_DEFINITIONS,
  EXTRA_KEYS,
  extrasOf,
} from "./extras.ts";
import { draftSchema } from "./schema.ts";
import {
  CODE_FONTS,
  MODES,
  type Mode,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  TOKEN_KEYS,
  UI_FONTS,
} from "./tokens.ts";

const SELECTORS = { light: ":root, .light", dark: ".dark" };
/**
 * Root while bb is in light mode. bb puts `.dark` on the root in dark mode,
 * so a light value written here can never leak into dark. `:where` adds no
 * specificity, so this ties with `:root`, `.light` and `.dark` and "the later
 * rule wins" holds for bb and for the theme reader.
 */
export const LIGHT_ROOT = ":root:where(:not(.dark))";
/**
 * One mode only. Extras and edits are written per mode only when set, so a
 * light-only value must not sit under `:root`, which dark matches too. Shared
 * by both writers so they always scope a mode the same way.
 */
export const MODE_SELECTORS: Record<Mode, string> = {
  light: `${LIGHT_ROOT}, .light`,
  dark: ".dark",
};
const NEWLINE = "\n";
// bb paints hovered sidebar rows' text with this token; read from the table so writers and reader name it alike.
export const SIDEBAR_HOVER_TEXT = EXTRA_DEFINITIONS.sidebarAccentForeground.css;
// Exported so the theme reader and the edits writer name bb's font variables exactly as the generator does.
export const FONT_SANS = "--font-sans";
export const FONT_MONO = "--font-mono";

export function generateCss(input: ThemeDraft): string {
  const draft = draftSchema.parse(input);
  const palettes = MODES.map((mode) => {
    const overrides = extrasOf(draft.extras, mode);
    const colors = TOKEN_KEYS.map(
      (key) => `  ${TOKEN_DEFINITIONS[key].css}: ${draft[mode][key]};`,
    );
    const hover = autoHoverText(draft[mode], overrides);
    const derived =
      hover === undefined ? [] : [`  ${SIDEBAR_HOVER_TEXT}: ${hover};`];
    const fonts = [
      `  ${FONT_SANS}: ${UI_FONTS[draft.uiFont].stack};`,
      `  ${FONT_MONO}: ${CODE_FONTS[draft.codeFont].stack};`,
    ];
    return [`${SELECTORS[mode]} {`, ...colors, ...derived, ...fonts, "}"].join(
      NEWLINE,
    );
  });
  return [...palettes, ...extraRules(draft)].join(NEWLINE) + NEWLINE;
}

/** One rule per mode holding only the extras the user set; the rest stay out so bb keeps deriving them. */
function extraRules(draft: ThemeDraft): string[] {
  return MODES.flatMap((mode) => {
    const overrides = extrasOf(draft.extras, mode);
    const lines = EXTRA_KEYS.flatMap((key) =>
      overrides[key] === undefined
        ? []
        : [`  ${EXTRA_DEFINITIONS[key].css}: ${overrides[key]};`],
    );
    return lines.length === 0
      ? []
      : [[`${MODE_SELECTORS[mode]} {`, ...lines, "}"].join(NEWLINE)];
  });
}
