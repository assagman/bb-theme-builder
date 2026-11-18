import type { Mode, ThemeDraft } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { TokenControls } from "./TokenControls.tsx";

/**
 * Edit tab body: the colors and fonts of the working theme. Contrast badges
 * live on the color rows themselves (see TokenControls), so there is no
 * separate report to keep in sync.
 */
export function EditTab({
  draft,
  mode,
  busy,
  onChange,
}: {
  draft: ThemeDraft;
  mode: Mode;
  busy: boolean;
  onChange: (draft: ThemeDraft) => void;
}) {
  return (
    <div className="space-y-5">
      <p className="tb-hint">
        {COPY.editingMode} {COPY[mode]}
      </p>
      <fieldset disabled={busy} className="space-y-5">
        <TokenControls draft={draft} mode={mode} onChange={onChange} />
      </fieldset>
    </div>
  );
}
