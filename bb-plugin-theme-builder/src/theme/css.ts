import { draftSchema } from "./schema.ts";
import {
  CODE_FONTS,
  MODES,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  TOKEN_KEYS,
  UI_FONTS,
} from "./tokens.ts";

const SELECTORS = { light: ":root, .light", dark: ".dark" };
const NEWLINE = "\n";
// bb paints hovered sidebar rows' text with this token; it follows Sidebar text so a row keeps its color on hover.
export const SIDEBAR_HOVER_TEXT = "--sidebar-accent-foreground";
// Exported so the theme reader and the edits writer name bb's font variables exactly as the generator does.
export const FONT_SANS = "--font-sans";
export const FONT_MONO = "--font-mono";

export function generateCss(input: ThemeDraft): string {
  const draft = draftSchema.parse(input);
  return (
    MODES.map((mode) => {
      const colors = TOKEN_KEYS.map(
        (key) => `  ${TOKEN_DEFINITIONS[key].css}: ${draft[mode][key]};`,
      );
      const derived = [
        `  ${SIDEBAR_HOVER_TEXT}: ${draft[mode].sidebarForeground};`,
      ];
      const fonts = [
        `  ${FONT_SANS}: ${UI_FONTS[draft.uiFont].stack};`,
        `  ${FONT_MONO}: ${CODE_FONTS[draft.codeFont].stack};`,
      ];
      return [
        `${SELECTORS[mode]} {`,
        ...colors,
        ...derived,
        ...fonts,
        "}",
      ].join(NEWLINE);
    }).join(NEWLINE) + NEWLINE
  );
}
