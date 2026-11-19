import { Input } from "../../components/ui/input.tsx";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { COLOR_PATTERN } from "../theme/schema.ts";
import {
  CODE_FONTS,
  type Mode,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  TOKEN_KEYS,
  type TokenKey,
  UI_FONTS,
} from "../theme/tokens.ts";
import { COPY, SELECT_CLASS } from "./copy.ts";

export function TokenControls({
  draft,
  mode,
  onChange,
}: {
  draft: ThemeDraft;
  mode: Mode;
  onChange: (draft: ThemeDraft) => void;
}) {
  const change = (key: TokenKey, value: string) =>
    onChange({ ...draft, [mode]: { ...draft[mode], [key]: value } });
  const row = (key: TokenKey) => {
    const token = TOKEN_DEFINITIONS[key];
    const color = draft[mode][key];
    const valid = COLOR_PATTERN.test(color);
    return (
      <div className="tb-token" key={key}>
        <label htmlFor={`${mode}-${key}`}>{token.label}</label>
        <input
          type="color"
          value={valid ? color : NEUTRAL_PRESET[mode][key]}
          aria-label={`${token.label} color`}
          onChange={(event) => change(key, event.target.value)}
        />
        <Input
          id={`${mode}-${key}`}
          value={color}
          aria-invalid={!valid}
          spellCheck={false}
          onChange={(event) => change(key, event.target.value.toLowerCase())}
        />
      </div>
    );
  };
  return (
    <div className="space-y-6">
      <section aria-label={COPY.basic} className="space-y-3">
        {TOKEN_KEYS.filter((key) => TOKEN_DEFINITIONS[key].basic).map(row)}
      </section>
      <section aria-label={COPY.fonts} className="space-y-3">
        <label className="block space-y-1">
          <span>{COPY.uiFont}</span>
          <select
            className={SELECT_CLASS}
            value={draft.uiFont}
            onChange={(event) =>
              onChange({
                ...draft,
                uiFont: event.target.value as ThemeDraft["uiFont"],
              })
            }
          >
            {Object.entries(UI_FONTS).map(([key, font]) => (
              <option key={key} value={key}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span>{COPY.codeFont}</span>
          <select
            className={SELECT_CLASS}
            value={draft.codeFont}
            onChange={(event) =>
              onChange({
                ...draft,
                codeFont: event.target.value as ThemeDraft["codeFont"],
              })
            }
          >
            {Object.entries(CODE_FONTS).map(([key, font]) => (
              <option key={key} value={key}>
                {font.label}
              </option>
            ))}
          </select>
        </label>
      </section>
      <details>
        <summary className="cursor-pointer py-2 font-medium">
          {COPY.advanced}
        </summary>
        <div className="space-y-3 pt-3">
          {TOKEN_KEYS.filter((key) => !TOKEN_DEFINITIONS[key].basic).map(row)}
        </div>
      </details>
    </div>
  );
}
