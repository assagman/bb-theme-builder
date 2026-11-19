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

export function generateCss(input: ThemeDraft): string {
  const draft = draftSchema.parse(input);
  return (
    MODES.map((mode) => {
      const colors = TOKEN_KEYS.map(
        (key) => `  ${TOKEN_DEFINITIONS[key].css}: ${draft[mode][key]};`,
      );
      const fonts = [
        `  --font-sans: ${UI_FONTS[draft.uiFont].stack};`,
        `  --font-mono: ${CODE_FONTS[draft.codeFont].stack};`,
      ];
      return [`${SELECTORS[mode]} {`, ...colors, ...fonts, "}"].join(NEWLINE);
    }).join(NEWLINE) + NEWLINE
  );
}
