import { type ReactNode, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { draftSchema } from "../theme/schema.ts";
import { nextAnchor, type SidebarAnchor } from "../theme/sidebar.ts";
import { MODES, type Mode } from "../theme/tokens.ts";
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
import type { SourceKind, Tab } from "./store.ts";
import { TabPanel, Tabs } from "./Tabs.tsx";
import { ThemePicker } from "./ThemePicker.tsx";
import "./editor.css";

/** Status after the name when there are no unsaved edits, by where the copy came from. */
const CLEAN_STATUS: Record<SourceKind, string> = {
  builtin: COPY.statusBuiltIn,
  plugin: COPY.statusPlugin,
  custom: COPY.saved,
  unsupported: COPY.statusUnsupported,
  gone: COPY.statusGone,
};

/**
 * Theme Builder page: the theme dropdown on top, the three ways to edit the
 * copy beside the live preview, and one action bar. All of it edits the
 * single working copy held by `useBuilderState`, called once here so its
 * mount effects (catalog, appearance, draft restore) run once.
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
  // Last valid Background and Text per mode, followed on every render so AI, Randomize and theme loads move it too; held here because only the open tab is mounted and a half-typed hex must not reset it.
  const anchorRef = useRef<Partial<Record<Mode, SidebarAnchor>>>({});
  const anchors = Object.fromEntries(
    MODES.map((m) => [
      m,
      nextAnchor(anchorRef.current[m] ?? draft[m], draft[m]),
    ]),
  ) as Record<Mode, SidebarAnchor>;
  anchorRef.current = anchors;
  const status = state.dirty ? COPY.dirty : CLEAN_STATUS[state.source.kind];
  // Every action that replaces the working copy drops the rolls and any half-filled name form of the old one.
  const replaced = (changed: boolean) => {
    if (!changed) return;
    setBarEpoch((value) => value + 1);
    resetRolls();
  };
  const discard = () => {
    // The state layer never prompts for Discard itself, because the restored-draft notice also calls it.
    if (state.dirty && !window.confirm(COPY.discard)) return;
    resetRolls();
    state.discard();
  };
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
        anchors={anchors}
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
  return (
    <div className="tb-shell">
      <div className="tb-body">
        <header className="tb-header">
          <h1 className="tb-title">{COPY.title}</h1>
        </header>
        <ThemePicker
          catalog={state.catalog}
          source={state.source}
          history={state.history}
          busy={state.busy}
          onSelect={(id) => replaced(state.select(id))}
          onUndo={() => replaced(state.undo())}
          onRedo={() => replaced(state.redo())}
          onReload={() => replaced(state.select(state.source.id))}
        />
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
            <PreviewFrame draft={draft} css={state.source.css} mode={mode} />
            <p className="tb-hint">{COPY.previewNote}</p>
          </section>
        </div>
        <ActionBar
          key={`${state.source.id}-${barEpoch}`}
          name={state.source.label}
          status={status}
          dirty={state.dirty}
          busy={state.busy}
          valid={valid}
          source={{
            kind: state.source.kind,
            owned: state.source.owned,
            active: state.source.id === state.catalog?.activeId,
          }}
          appearance={{
            current: state.appearance,
            missingRestore: state.missingRestore,
          }}
          onDiscard={discard}
          onOverwrite={state.overwrite}
          onSaveAs={state.saveAs}
          onUseTheme={state.useTheme}
          onDelete={() => replaced(state.remove())}
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
