import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { contrastReport } from "../theme/contrast.ts";
import { draftSchema } from "../theme/schema.ts";
import { MAX_NAME_LENGTH, MODES } from "../theme/tokens.ts";
import { COPY, RATIO_DECIMALS, SELECT_CLASS } from "./copy.ts";
import { PreviewFrame } from "./PreviewFrame.tsx";
import { RandomizeControls } from "./RandomizeControls.tsx";
import { useBuilderState } from "./state.ts";
import { TokenControls } from "./TokenControls.tsx";
import "./editor.css";

const NAME_INPUT_ID = "theme-builder-name";

export function BuilderPage() {
  const state = useBuilderState();
  const { draft, setDraft, mode, setMode, view, setView } = state;
  const valid = draftSchema.safeParse(draft).success;
  const report = valid ? contrastReport(draft) : [];
  const savedActionDisabled = state.busy || state.saved === null;
  const saveDisabled =
    state.busy || !valid || (!state.dirty && state.saved !== null);
  const applyDisabled = state.busy || !valid || state.appearance === null;
  const restoreDisabled = state.busy || !state.appearance?.restoreAvailable;
  const draftStatus = state.dirty
    ? COPY.dirty
    : state.saved === null
      ? COPY.neutral
      : COPY.saved;
  return (
    <div className="tb-shell">
      <div className="tb-body" data-view={view}>
        <p className="mb-5 text-sm text-muted-foreground">
          {COPY.introduction}
        </p>
        <div className="tb-view-tabs">
          {[COPY.edit, COPY.preview].map((label) => (
            <Button
              key={label}
              variant="outline"
              aria-pressed={view === label.toLowerCase()}
              onClick={() => setView(label.toLowerCase())}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="tb-grid">
          <div className="tb-edit-column space-y-5">
            <label className="block space-y-2">
              <span className="text-sm font-medium">{COPY.presets}</span>
              <select
                className={SELECT_CLASS}
                value={state.saved?.id ?? ""}
                disabled={state.busy}
                onChange={(event) => state.select(event.target.value)}
              >
                <option value="">{COPY.neutral}</option>
                {state.presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </label>
            <fieldset disabled={state.busy} className="space-y-5">
              <label className="block space-y-2" htmlFor={NAME_INPUT_ID}>
                <span className="text-sm font-medium">{COPY.name}</span>
                <Input
                  id={NAME_INPUT_ID}
                  value={draft.name}
                  maxLength={MAX_NAME_LENGTH}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                />
              </label>
              <p role="status" className="text-xs text-muted-foreground">
                {draftStatus}
              </p>
              <fieldset className="flex gap-2" aria-label={COPY.mode}>
                {MODES.map((value) => (
                  <Button
                    key={value}
                    variant={value === mode ? "default" : "outline"}
                    aria-pressed={value === mode}
                    onClick={() => setMode(value)}
                  >
                    {COPY[value]}
                  </Button>
                ))}
              </fieldset>
              <TokenControls draft={draft} mode={mode} onChange={setDraft} />
            </fieldset>
            <RandomizeControls
              busy={state.busy}
              generating={state.generating}
              canUndo={state.canUndo}
              onGenerate={state.randomize}
              onCancel={state.cancelGeneration}
              onUndo={state.undoRandomization}
            />
            {!valid && <p role="alert">{COPY.invalid}</p>}
            <div className="tb-toolbar">
              <Button disabled={saveDisabled} onClick={state.save}>
                {COPY.save}
              </Button>
              <Button
                variant="outline"
                disabled={state.busy}
                onClick={state.duplicate}
              >
                {COPY.duplicate}
              </Button>
              <Button
                variant="outline"
                disabled={savedActionDisabled}
                onClick={state.remove}
              >
                {COPY.remove}
              </Button>
              <Button
                variant="ghost"
                disabled={savedActionDisabled}
                onClick={() => state.select(state.saved?.id ?? "")}
              >
                {COPY.reloadSaved}
              </Button>
            </div>
            <div className="tb-toolbar">
              <Button
                variant="outline"
                disabled={savedActionDisabled}
                onClick={() => state.download("json")}
              >
                {COPY.exportJson}
              </Button>
              <Button
                variant="outline"
                disabled={savedActionDisabled}
                onClick={() => state.download("css")}
              >
                {COPY.exportCss}
              </Button>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-muted-foreground">{COPY.global}</p>
              <div className="tb-toolbar">
                <Button disabled={applyDisabled} onClick={state.apply}>
                  {COPY.apply}
                </Button>
                <Button
                  variant="outline"
                  disabled={restoreDisabled}
                  onClick={() => state.restore()}
                >
                  {COPY.restore}
                </Button>
                <Button
                  variant="ghost"
                  disabled={state.busy}
                  onClick={state.refreshAppearance}
                >
                  {COPY.refresh}
                </Button>
              </div>
              {state.missingRestore && (
                <Button
                  variant="outline"
                  disabled={state.busy}
                  onClick={() => state.restore(true)}
                >
                  {COPY.defaultAction}
                </Button>
              )}
              {state.appearance && (
                <p className="break-all text-xs text-muted-foreground">
                  {COPY.active}
                  {state.appearance.themeId}
                </p>
              )}
            </div>
            {state.busy && <p role="status">{COPY.busy}</p>}
            {state.message !== null && <p role="status">{state.message}</p>}
            {state.error !== null && <p role="alert">{state.error}</p>}
            <p className="text-xs text-muted-foreground">{COPY.localNote}</p>
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
                            {pair.passes
                              ? COPY.contrastPass
                              : COPY.contrastFail}
                          </dd>
                        </div>
                      ))}
                  </dl>
                </section>
              ))}
            </details>
          </div>
          <section
            className="tb-preview-column space-y-3"
            aria-label={COPY.preview}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-medium">{COPY.preview}</h2>
              <span className="text-xs text-muted-foreground">
                {COPY[mode]}
              </span>
            </div>
            <PreviewFrame draft={draft} mode={mode} />
            <p className="text-xs text-muted-foreground">{COPY.previewNote}</p>
          </section>
        </div>
      </div>
    </div>
  );
}
