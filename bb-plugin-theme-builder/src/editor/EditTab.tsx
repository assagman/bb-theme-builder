import { contrastReport } from "../theme/contrast.ts";
import type { Mode, ThemeDraft } from "../theme/tokens.ts";
import { MODES } from "../theme/tokens.ts";
import { COPY, RATIO_DECIMALS } from "./copy.ts";
import { TokenControls } from "./TokenControls.tsx";

/**
 * Edit tab body: the colors and fonts of the working theme. The contrast
 * report stays here until the per-row badges replace it, so checking text
 * contrast does not disappear in the meantime.
 */
export function EditTab({
  draft,
  mode,
  valid,
  busy,
  onChange,
}: {
  draft: ThemeDraft;
  mode: Mode;
  /** The report needs a schema-valid draft, so it is skipped while a hex field holds a typo. */
  valid: boolean;
  busy: boolean;
  onChange: (draft: ThemeDraft) => void;
}) {
  const report = valid ? contrastReport(draft) : [];
  return (
    <div className="space-y-5">
      <p className="tb-hint">
        {COPY.editingMode} {COPY[mode]}
      </p>
      <fieldset disabled={busy} className="space-y-5">
        <TokenControls draft={draft} mode={mode} onChange={onChange} />
      </fieldset>
      <details>
        <summary className="cursor-pointer font-medium">
          {COPY.contrast}
        </summary>
        <p className="my-3 text-xs text-muted-foreground">
          {COPY.contrastNote}
        </p>
        {MODES.map((value) => (
          <section key={value} className="mb-4">
            <h3 className="mb-2 text-sm font-medium">{COPY[value]}</h3>
            <dl className="tb-contrast">
              {report
                .filter((pair) => pair.mode === value)
                .map((pair) => (
                  <div key={pair.label} className="contents">
                    <dt>{pair.label}</dt>
                    <dd>
                      {pair.ratio.toFixed(RATIO_DECIMALS)}:1 ·{" "}
                      {pair.passes ? COPY.contrastPass : COPY.contrastFail}
                    </dd>
                  </div>
                ))}
            </dl>
          </section>
        ))}
      </details>
    </div>
  );
}
