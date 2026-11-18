import { Input } from "../../components/ui/input.tsx";
import { type TokenContrast, tokenContrast } from "../theme/contrast.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { COLOR_PATTERN } from "../theme/schema.ts";
import {
  CODE_FONTS,
  type Mode,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  TOKEN_GROUP_COLLAPSED,
  TOKEN_GROUPS,
  type TokenKey,
  tokensInGroup,
  UI_FONTS,
} from "../theme/tokens.ts";
import {
  BADGE_FAIL_MARK,
  BADGE_PASS_MARK,
  contrastLabel,
  formatRatio,
  groupFailures,
} from "./contrast-badge.ts";
import { COPY, SELECT_CLASS, TOKEN_GROUP_LABELS } from "./copy.ts";

/**
 * Contrast readout for one color row. Owns the id that the row input's
 * aria-describedby points at, so the pairing cannot drift between the two.
 */
function ContrastBadge({
  contrast,
  id,
}: {
  contrast: TokenContrast;
  id: string;
}) {
  const ratio = formatRatio(contrast.ratio);
  return (
    <span
      id={id}
      className="tb-badge"
      data-passes={contrast.passes}
      role="img"
      aria-label={contrastLabel(ratio, contrast.passes)}
    >
      {ratio}:1 {contrast.passes ? BADGE_PASS_MARK : BADGE_FAIL_MARK}
    </span>
  );
}

/**
 * Color rows grouped by purpose, then the font selects. Contrast is shown on
 * the row it concerns so the user fixes a low-contrast color where they edit it.
 */
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
    const contrast = tokenContrast(draft[mode], key);
    const contrastId = `${mode}-${key}-contrast`;
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
          aria-describedby={contrast ? contrastId : undefined}
          onChange={(event) => change(key, event.target.value.toLowerCase())}
        />
        {contrast && <ContrastBadge contrast={contrast} id={contrastId} />}
      </div>
    );
  };
  return (
    <div className="space-y-6">
      {TOKEN_GROUPS.map((group) => {
        const keys = tokensInGroup(group);
        const failures = keys.filter(
          (key) => tokenContrast(draft[mode], key)?.passes === false,
        ).length;
        return (
          <details
            key={group}
            open={group !== TOKEN_GROUP_COLLAPSED}
            className="tb-group"
          >
            <summary className="cursor-pointer py-2 font-medium">
              {TOKEN_GROUP_LABELS[group]}
              {failures > 0 && groupFailures(failures)}
            </summary>
            <div className="space-y-3 pt-3">{keys.map(row)}</div>
          </details>
        );
      })}
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
    </div>
  );
}
