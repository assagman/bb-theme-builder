import { ALPHA_COLOR_PATTERN, alphaPart, opaquePart } from "../theme/color.ts";
import { EXTRA_DEFINITIONS, type ExtraKey } from "../theme/extras.ts";
import type { Mode } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { TokenRow } from "./TokenRow.tsx";

/**
 * One row for a token bb derives on its own. Empty means "auto": the field
 * shows bb's value as a placeholder so the user sees what they would
 * override, and the Auto button hands the token back to bb.
 */
export function ExtraTokenRow({
  tokenKey,
  mode,
  override,
  resolved,
  onChange,
}: {
  tokenKey: ExtraKey;
  mode: Mode;
  /** The user's value, or undefined while bb derives the token. */
  override: string | undefined;
  /** What bb paints now: the override when valid, else bb's default for this palette. */
  resolved: string;
  /** undefined clears the override. */
  onChange: (value: string | undefined) => void;
}) {
  const token = EXTRA_DEFINITIONS[tokenKey];
  const auto = override === undefined;
  return (
    <TokenRow
      id={`${mode}-${tokenKey}`}
      label={token.label}
      css={token.css}
      pickerValue={opaquePart(resolved)}
      // The native picker has no alpha, so a pick keeps the transparency the token already has.
      onPick={(hex) => onChange(hex + alphaPart(resolved))}
      value={override ?? ""}
      placeholder={resolved}
      invalid={!auto && !ALPHA_COLOR_PATTERN.test(override)}
      onType={(text) => {
        const value = text.trim();
        onChange(value === "" ? undefined : value);
      }}
      trailing={
        auto ? (
          <span className="tb-auto">{COPY.autoMark}</span>
        ) : (
          <button
            type="button"
            className="tb-reset"
            aria-label={`${COPY.resetAutoLabel} ${token.label}`}
            onClick={() => onChange(undefined)}
          >
            {COPY.resetAuto}
          </button>
        )
      }
    />
  );
}
