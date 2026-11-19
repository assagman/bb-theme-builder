import { type ReactNode, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { draftSchema } from "../theme/schema.ts";
import { swatchOf } from "../theme/swatch.ts";
import { MODES } from "../theme/tokens.ts";
import { ActionBar } from "./ActionBar.tsx";
import { AiTab } from "./AiTab.tsx";
import { useChat } from "./chat.ts";
import { COPY } from "./copy.ts";
import { EditTab } from "./EditTab.tsx";
import { useModelSelection } from "./model-selection.ts";
import { Notices } from "./Notices.tsx";
import { PreviewFrame } from "./PreviewFrame.tsx";
import { RandomizeTab } from "./RandomizeTab.tsx";
import { EMPTY_ROLL_HISTORY } from "./roll-history.ts";
import { useBuilderState } from "./state.ts";
import type { Tab } from "./store.ts";
import { TabPanel, Tabs } from "./Tabs.tsx";
import { type ThemeEntry, ThemeList } from "./ThemeList.tsx";
import "./editor.css";

const NEUTRAL_SWATCH = swatchOf(NEUTRAL_PRESET);
/** Never a real theme id (those are UUIDs), so the unsaved card cannot collide with a saved one. */
const UNSAVED_ENTRY_ID = "unsaved";

/**
 * Theme Builder page: theme list on top, the three ways to make a theme
 * beside the live preview, and one action bar. All of it edits the single
 * working draft held by `useBuilderState`, called once here so its mount
 * effects (list, appearance, draft restore) run once.
 */
export function BuilderPage() {
  const state = useBuilderState();
  // Bumped when the working theme is replaced by one with the same bar key, so a half-filled name form cannot outlive it.
  const [barEpoch, setBarEpoch] = useState(0);
  // Lives here, not in the tab, so rolls survive switching tabs.
  const [rollHistory, setRollHistory] = useState(EMPTY_ROLL_HISTORY);
  // Held here too, so the accent the user typed survives tab switches.
  const [accent, setAccent] = useState("");
  // Whenever the working theme is replaced, its rolls no longer belong to the new one even if a palette happens to match.
  const resetRolls = () => setRollHistory(EMPTY_ROLL_HISTORY);
  // Chat, model and typed text live here, not in the AI tab, because only the open tab is mounted and the session must keep polling, pinging and applying replies while another tab is open.
  const chat = useChat();
  const model = useModelSelection();
  const [aiDescription, setAiDescription] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const { draft, mode, setMode, tab, setTab } = state;
  const valid = draftSchema.safeParse(draft).success;
  const builtInOpen = state.saved === null && !state.dirty;
  // The state layer never prompts, so every path that would drop edits asks here.
  const confirmDiscard = () => !state.dirty || window.confirm(COPY.discard);
  const discard = () => {
    if (!confirmDiscard()) return;
    resetRolls();
    state.discard();
  };
  const createTheme = () => {
    if (!confirmDiscard()) return;
    setBarEpoch((value) => value + 1);
    resetRolls();
    state.newTheme();
  };
  const status = state.dirty
    ? COPY.dirty
    : state.saved === null
      ? COPY.statusBuiltIn
      : COPY.saved;
  // Render functions, so only the open tab's body is built on each render.
  const tabBodies: Record<Tab, () => ReactNode> = {
    ai: () => (
      <AiTab
        busy={state.busy}
        valid={valid}
        accent={accent}
        onAccent={setAccent}
        chat={chat}
        model={model}
        description={aiDescription}
        onDescription={setAiDescription}
        message={aiMessage}
        onMessage={setAiMessage}
      />
    ),
    edit: () => (
      <EditTab
        draft={draft}
        mode={mode}
        busy={state.busy}
        onChange={state.setDraft}
      />
    ),
    randomize: () => (
      <RandomizeTab
        draft={draft}
        busy={state.busy}
        accent={accent}
        onAccent={setAccent}
        history={rollHistory}
        onHistory={setRollHistory}
        onChange={state.setDraft}
        onTab={setTab}
      />
    ),
  };
  const entries: ThemeEntry[] = [
    {
      id: "",
      name: COPY.neutralBuiltIn,
      swatch: NEUTRAL_SWATCH,
      open: builtInOpen,
      active: false,
    },
    // Right after Neutral, where the first edit of it happens, so the list does not jump.
    ...(state.saved === null && state.dirty
      ? [
          {
            id: UNSAVED_ENTRY_ID,
            name: draft.name,
            swatch: swatchOf(draft),
            open: true,
            active: false,
            unsaved: true,
          },
        ]
      : []),
    ...state.presets.map((theme) => ({
      id: theme.id,
      name: theme.name,
      swatch: theme.swatch,
      open: theme.id === state.saved?.id,
      active: theme.id === state.appliedPresetId,
    })),
  ];
  return (
    <div className="tb-shell">
      <div className="tb-body">
        <header className="tb-header">
          <h1 className="tb-title">{COPY.title}</h1>
        </header>
        <section className="tb-themes" aria-label={COPY.yourThemes}>
          <div className="tb-section-head">
            <h2 className="tb-heading">{COPY.yourThemes}</h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={state.busy}
              aria-label={COPY.newThemeLabel}
              onClick={createTheme}
            >
              <span aria-hidden="true">+ </span>
              {COPY.newTheme}
            </Button>
          </div>
          <ThemeList
            entries={entries}
            disabled={state.busy}
            onSelect={(id) => {
              setBarEpoch((value) => value + 1);
              if (state.select(id)) resetRolls();
            }}
          />
        </section>
        <div className="tb-workspace">
          <section className="tb-editor" aria-label={COPY.tabsLabel}>
            <Tabs value={tab} onChange={setTab} />
            <TabPanel tab={tab}>{tabBodies[tab]()}</TabPanel>
          </section>
          <section className="tb-preview" aria-label={COPY.preview}>
            <div className="tb-section-head">
              <h2 className="tb-heading">{COPY.preview}</h2>
              <fieldset className="tb-mode" aria-label={COPY.mode}>
                {MODES.map((value) => (
                  <Button
                    key={value}
                    type="button"
                    size="sm"
                    variant={value === mode ? "default" : "outline"}
                    aria-pressed={value === mode}
                    onClick={() => setMode(value)}
                  >
                    {COPY[value]}
                  </Button>
                ))}
              </fieldset>
            </div>
            <PreviewFrame draft={draft} mode={mode} />
            <p className="tb-hint">{COPY.previewNote}</p>
          </section>
        </div>
        <ActionBar
          key={`${state.saved?.id ?? UNSAVED_ENTRY_ID}-${barEpoch}`}
          name={draft.name}
          status={status}
          dirty={state.dirty}
          busy={state.busy}
          valid={valid}
          hasSaved={state.saved !== null}
          appearance={{
            current: state.appearance,
            missingRestore: state.missingRestore,
          }}
          onDiscard={discard}
          onSave={state.save}
          onApply={state.apply}
          onSaveAs={state.saveAs}
          onRename={state.rename}
          onDuplicate={() => {
            setBarEpoch((value) => value + 1);
            resetRolls();
            state.duplicate();
          }}
          onDelete={() => {
            if (state.remove()) resetRolls();
          }}
          onExport={state.download}
          onRestore={() => state.restore()}
          onUseDefault={() => state.restore(true)}
          notices={
            <Notices
              busy={state.busy}
              notice={state.notice}
              message={state.message}
              error={state.error}
              invalid={!valid}
              held={chat.held}
              onDiscardRestored={discard}
            />
          }
        />
      </div>
    </div>
  );
}
