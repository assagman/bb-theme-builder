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
const SIDEBAR_HOVER_TEXT = "--sidebar-accent-foreground";

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
        `  --font-sans: ${UI_FONTS[draft.uiFont].stack};`,
        `  --font-mono: ${CODE_FONTS[draft.codeFont].stack};`,
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
