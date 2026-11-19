import { useState } from "react";
import { Input } from "../../components/ui/input.tsx";
import { COLOR_PATTERN } from "../theme/color.ts";
import { type TokenContrast, tokenContrast } from "../theme/contrast.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import {
  COLLAPSED_GROUPS,
  type ExtraKey,
  extrasOf,
  resolveExtras,
  visibleGroups,
  withExtra,
} from "../theme/extras.ts";
import { editToken, type SidebarAnchor } from "../theme/sidebar.ts";
import {
  CODE_FONTS,
  type Mode,
  type ThemeDraft,
  TOKEN_DEFINITIONS,
  type TokenKey,
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
import { ExtraTokenRow } from "./ExtraTokenRow.tsx";
import { TokenRow } from "./TokenRow.tsx";

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
  anchors,
  onChange,
}: {
  draft: ThemeDraft;
  mode: Mode;
  /** Last valid Background and Text per mode, owned by the page so it survives tab switches. */
  anchors: Record<Mode, SidebarAnchor>;
  onChange: (draft: ThemeDraft) => void;
}) {
  const change = (key: TokenKey, value: string) => {
    const current = draft[mode];
    onChange({
      ...draft,
      [mode]: editToken(current, key, value, mode, anchors[mode]),
    });
  };
  const row = (key: TokenKey) => {
    const token = TOKEN_DEFINITIONS[key];
    const color = draft[mode][key];
    const valid = COLOR_PATTERN.test(color);
    const contrast = tokenContrast(draft[mode], key);
    const contrastId = `${mode}-${key}-contrast`;
    return (
      <TokenRow
        key={key}
        id={`${mode}-${key}`}
        label={token.label}
        css={token.css}
        pickerValue={valid ? color : NEUTRAL_PRESET[mode][key]}
        onPick={(hex) => change(key, hex)}
        value={color}
        invalid={!valid}
        describedBy={contrast ? contrastId : undefined}
        onType={(text) => change(key, text)}
        trailing={
          contrast && <ContrastBadge contrast={contrast} id={contrastId} />
        }
      />
    );
  };
  const overrides = extrasOf(draft.extras, mode);
  // One pass for all rows: rows that follow other extras read the same resolved table.
  const resolved = resolveExtras(draft[mode], overrides, mode);
  const [search, setSearch] = useState("");
  const query = search.trim().toLowerCase();
  const changeExtra = (key: ExtraKey, value: string | undefined) =>
    onChange({ ...draft, extras: withExtra(draft.extras, mode, key, value) });
  const groups = visibleGroups(query);
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <label htmlFor={`${mode}-token-search`} className="block space-y-1">
          <span>{COPY.tokenSearchLabel}</span>
          <Input
            id={`${mode}-token-search`}
            type="search"
            value={search}
            placeholder={COPY.tokenSearchPlaceholder}
            spellCheck={false}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <p className="tb-hint">{COPY.extrasHint}</p>
      </div>
      {groups.length === 0 && (
        <p className="tb-hint">{COPY.tokenSearchEmpty}</p>
      )}
      {groups.map(({ group, core, extras }) => {
        const failures = core.filter(
          (key) => tokenContrast(draft[mode], key)?.passes === false,
        ).length;
        return (
          <details
            // Remounts when a search starts or ends, so a search opens every matching group and clearing it restores the defaults.
            key={`${group}-${query === "" ? "browse" : "search"}`}
            open={query !== "" || !COLLAPSED_GROUPS.has(group)}
            className="tb-group"
          >
            <summary className="cursor-pointer py-2 font-medium">
              {TOKEN_GROUP_LABELS[group]}
              {failures > 0 && groupFailures(failures)}
            </summary>
            <div className="space-y-3 pt-3">
              {core.map(row)}
              {extras.map((key) => (
                <ExtraTokenRow
                  key={key}
                  tokenKey={key}
                  mode={mode}
                  override={overrides[key]}
                  resolved={resolved[key]}
                  onChange={(value) => changeExtra(key, value)}
                />
              ))}
            </div>
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
