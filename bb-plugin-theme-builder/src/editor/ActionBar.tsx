import { type ReactNode, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { COPY } from "./copy.ts";
import { type MenuItem, MoreMenu } from "./MoreMenu.tsx";
import { NameForm, type Naming } from "./NameForm.tsx";
import type { ExportFormat } from "./state.ts";
import type { AppearanceState } from "./store.ts";

export type ActionBarProps = {
  name: string;
  /** Text after the name: "Unsaved changes", "Saved", or the built-in note. */
  status: string;
  dirty: boolean;
  busy: boolean;
  /** False when the draft fails the schema; Save and Apply stay off so nothing invalid is sent. */
  valid: boolean;
  /** Saved themes can be exported and deleted; unsaved ones must be saved first. */
  hasSaved: boolean;
  /** Apply and Restore state as the server last reported it, plus whether the restore target went missing. */
  appearance: { current: AppearanceState | null; missingRestore: boolean };
  onDiscard: () => void;
  onSave: () => void;
  onApply: () => void;
  /** Used by the name form: names a new theme and saves (and applies) it in one step. */
  onSaveAs: (name: string, options: { apply: boolean }) => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onExport: (format: ExportFormat) => void;
  onRestore: () => void;
  onUseDefault: () => void;
  /** Status and error lines; they live in the bar so every result is visible without scrolling. */
  notices?: ReactNode;
};

/**
 * The one place to save and apply: `<name> · status` and Discard, Save, Apply,
 * and a menu for the rarer actions. Save and Apply on a theme that is not
 * saved yet ask for a name first, which is how Neutral becomes a new theme.
 * The page keys this on the open theme so a half-filled name form cannot
 * outlive a theme switch.
 */
export function ActionBar(props: ActionBarProps) {
  const [naming, setNaming] = useState<Naming | null>(null);
  const { appearance } = props;
  const needsName = !props.hasSaved;
  // The built-in's own name would make every new theme start as a duplicate of it.
  const suggestedName = props.name === NEUTRAL_PRESET.name ? "" : props.name;
  const saveDisabled =
    props.busy || !props.valid || (!props.dirty && props.hasSaved);
  const applyDisabled =
    props.busy || !props.valid || appearance.current === null;
  const finishNaming = (name: string) => {
    const kind = naming;
    setNaming(null);
    if (kind === "rename") props.onRename(name);
    else if (kind !== null) props.onSaveAs(name, { apply: kind === "apply" });
  };
  const menuItems: MenuItem[] = [
    {
      label: COPY.rename,
      // Renaming the pristine built-in would only edit a draft nobody can save under that name.
      disabled: props.busy || (!props.hasSaved && !props.dirty),
      run: () => setNaming("rename"),
    },
    { label: COPY.duplicate, disabled: props.busy, run: props.onDuplicate },
    {
      label: COPY.remove,
      disabled: props.busy || !props.hasSaved,
      run: props.onDelete,
    },
    {
      label: COPY.exportJson,
      disabled: props.busy || !props.hasSaved,
      run: () => props.onExport("json"),
    },
    {
      label: COPY.exportCss,
      disabled: props.busy || !props.hasSaved,
      run: () => props.onExport("css"),
    },
    {
      label: COPY.restore,
      disabled: props.busy || !appearance.current?.restoreAvailable,
      run: props.onRestore,
    },
    ...(appearance.missingRestore
      ? [
          {
            label: COPY.defaultAction,
            disabled: props.busy,
            run: props.onUseDefault,
          },
        ]
      : []),
  ];
  return (
    <section className="tb-action-bar" aria-label={COPY.actionBarLabel}>
      {naming !== null && (
        <NameForm
          key={naming}
          naming={naming}
          initial={naming === "rename" ? props.name : suggestedName}
          onSubmit={finishNaming}
          onCancel={() => setNaming(null)}
        />
      )}
      {props.notices}
      <div className="tb-action-row">
        <p className="tb-action-status">
          <strong className="tb-action-name">{props.name}</strong>
          <span aria-hidden="true"> · </span>
          <span role="status">{props.status}</span>
        </p>
        <div className="tb-action-buttons">
          <Button
            type="button"
            variant="ghost"
            disabled={props.busy || !props.dirty}
            onClick={props.onDiscard}
          >
            {COPY.discardAction}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={saveDisabled}
            onClick={() => (needsName ? setNaming("save") : props.onSave())}
          >
            {COPY.save}
          </Button>
          <Button
            type="button"
            disabled={applyDisabled}
            onClick={() => (needsName ? setNaming("apply") : props.onApply())}
          >
            {COPY.apply}
          </Button>
          <MoreMenu items={menuItems} />
        </div>
      </div>
      <p className="tb-hint">{COPY.applyHint}</p>
    </section>
  );
}
