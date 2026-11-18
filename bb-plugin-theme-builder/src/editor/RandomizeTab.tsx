import { useId, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { accentSchema } from "../generation/contract.ts";
import { randomizePalette } from "../theme/randomize.ts";
import type { ThemeDraft } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { LOG_PREFIX } from "./log.ts";
import {
  canStep,
  liveHistory,
  type RollHistory,
  recordRoll,
  stepHistory,
} from "./roll-history.ts";
import type { Tab } from "./store.ts";

/** Shown in the color picker while the accent is blank or invalid; a picker cannot display "no value". */
const PICKER_FALLBACK = "#7c3aed";

/** One uint32 from the platform CSPRNG, so repeated rolls do not collide the way clock seeds can. */
function freshSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

/**
 * Randomize tab body: optional accent, one-click full-theme roll, and a
 * Back/Forward trail. A roll writes only the two palettes into the draft, so
 * dirty tracking, restore, Save and Apply follow with no extra wiring.
 * History is owned by the page so it survives tab switches.
 */
export function RandomizeTab({
  draft,
  busy,
  accent,
  onAccent,
  history,
  onHistory,
  onChange,
  onTab,
}: {
  draft: ThemeDraft;
  busy: boolean;
  accent: string;
  onAccent: (accent: string) => void;
  history: RollHistory;
  onHistory: (history: RollHistory) => void;
  onChange: (draft: ThemeDraft) => void;
  onTab: (tab: Tab) => void;
}) {
  const [failed, setFailed] = useState(false);
  const errorId = useId();
  const accentId = useId();
  const trimmed = accent.trim();
  const parsed = accentSchema.safeParse(trimmed);
  const invalid = trimmed !== "" && !parsed.success;
  const live = liveHistory(history, draft);
  const canBack = canStep(live, -1);
  const canForward = canStep(live, 1);

  const roll = () => {
    try {
      const rolled = randomizePalette(
        trimmed === "" || !parsed.success ? null : parsed.data,
        freshSeed(),
      );
      onHistory(recordRoll(history, draft, rolled));
      onChange({ ...draft, light: rolled.light, dark: rolled.dark });
      setFailed(false);
    } catch (cause) {
      // The accent was validated, so reaching here is a bug; keep it diagnosable without blocking the page.
      console.error(`${LOG_PREFIX} randomize failed`, { cause });
      setFailed(true);
    }
  };
  const step = (delta: -1 | 1) => {
    const next = stepHistory(live, delta);
    const target = next.entries[next.index];
    if (target === undefined) return;
    onHistory(next);
    onChange({ ...draft, light: target.light, dark: target.dark });
  };

  return (
    <div className="space-y-4">
      <p className="tb-hint">{COPY.randomizeIntro}</p>
      <div className="tb-token tb-token--accent">
        <label htmlFor={accentId}>{COPY.accentLabel}</label>
        <input
          type="color"
          value={parsed.success ? parsed.data : PICKER_FALLBACK}
          aria-label={COPY.accentPickerLabel}
          disabled={busy}
          onChange={(event) => onAccent(event.target.value)}
        />
        <Input
          id={accentId}
          value={accent}
          placeholder={COPY.accentPlaceholder}
          aria-invalid={invalid}
          aria-describedby={invalid ? errorId : undefined}
          spellCheck={false}
          disabled={busy}
          onChange={(event) => onAccent(event.target.value)}
        />
      </div>
      {invalid && (
        <p id={errorId} className="tb-hint tb-field-error">
          {COPY.accentInvalid}
        </p>
      )}
      {failed && (
        <p role="alert" className="tb-hint tb-field-error">
          {COPY.randomizeFailed}
        </p>
      )}
      <div className="tb-roll-actions">
        <Button type="button" disabled={busy || invalid} onClick={roll}>
          {COPY.randomize}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !canBack}
          onClick={() => step(-1)}
        >
          {COPY.rollBack}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy || !canForward}
          onClick={() => step(1)}
        >
          {COPY.rollForward}
        </Button>
      </div>
      <div className="tb-roll-actions">
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onTab("edit")}
        >
          {COPY.editThis}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => onTab("ai")}
        >
          {COPY.refineWithAi}
        </Button>
      </div>
    </div>
  );
}
