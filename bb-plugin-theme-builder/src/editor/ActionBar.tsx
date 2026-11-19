import { type ReactNode, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { MAX_NAME_LENGTH } from "../theme/tokens.ts";
import type { AppearanceView } from "../themes/contract.ts";
import { COPY } from "./copy.ts";
import { type MenuItem, MoreMenu } from "./MoreMenu.tsx";
import { NameForm } from "./NameForm.tsx";
import type { ExportFormat } from "./state.ts";
import type { SourceKind } from "./store.ts";

export type ActionBarProps = {
  /** The open theme's name as the dropdown shows it. */
  name: string;
  /** Text after the name: "Unsaved changes", "Saved", or what kind of theme it is. */
  status: string;
  dirty: boolean;
  busy: boolean;
  /** False when the draft fails the schema; nothing that writes is enabled then. */
  valid: boolean;
  /** The theme the copy came from: only custom themes can be overwritten, only owned ones deleted, the active one never. */
  source: { kind: SourceKind; owned: boolean; active: boolean };
  /** Use theme and Restore state as the server last reported it, plus whether the restore target went missing. */
  appearance: { current: AppearanceView | null; missingRestore: boolean };
  onDiscard: () => void;
  onOverwrite: () => void;
  onSaveAs: (name: string) => void;
  onUseTheme: () => void;
  onDelete: () => void;
  onExport: (format: ExportFormat) => void;
  onRestore: () => void;
  onUseDefault: () => void;
  /** Status and error lines; they live in the bar so every result is visible without scrolling. */
  notices?: ReactNode;
};

/**
 * When each primary action is off. Writes need a valid draft and an idle
 * page; Overwrite also needs edits to a custom theme; Use theme switches bb
 * to the saved file, so it waits until the edits are saved.
 */
function primaryDisabled(props: ActionBarProps) {
  const blocked = props.busy || !props.valid;
  return {
    overwrite: blocked || !props.dirty,
    saveAs: blocked,
    use:
      props.busy ||
      props.dirty ||
      props.source.active ||
      props.source.kind === "gone" ||
      props.appearance.current === null,
  };
}

/** The rarer actions behind the More menu, kept apart so each rule for when an action is off reads on its own. */
function moreMenuItems(props: ActionBarProps): MenuItem[] {
  const { appearance, source } = props;
  return [
    {
      label: COPY.remove,
      disabled:
        props.busy ||
        source.kind !== "custom" ||
        !source.owned ||
        source.active,
      run: props.onDelete,
    },
    {
      label: COPY.exportJson,
      disabled: props.busy || !props.valid,
      run: () => props.onExport("json"),
    },
    {
      label: COPY.exportCss,
      disabled: props.busy || !props.valid,
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
}

/**
 * The one place to save: `<name> · status`, then Discard, Overwrite (custom
 * themes only), Save as new, Use theme, and a menu for the rarer actions.
 * The page keys this on the open theme so a half-filled name form cannot
 * outlive a theme switch.
 */
export function ActionBar(props: ActionBarProps) {
  const [naming, setNaming] = useState(false);
  const disabled = primaryDisabled(props);
  const suggestedName = `${props.name}${COPY.copySuffix}`.slice(
    0,
    MAX_NAME_LENGTH,
  );
  return (
    <section className="tb-action-bar" aria-label={COPY.actionBarLabel}>
      {naming && (
        <NameForm
          initial={suggestedName}
          onSubmit={(name) => {
            setNaming(false);
            props.onSaveAs(name);
          }}
          onCancel={() => setNaming(false)}
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
          {props.source.kind === "custom" && (
            <Button
              type="button"
              variant="outline"
              disabled={disabled.overwrite}
              onClick={props.onOverwrite}
            >
              {`${COPY.overwrite} ${props.name}`}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            disabled={disabled.saveAs}
            onClick={() => setNaming(true)}
          >
            {COPY.saveAsNew}
          </Button>
          <Button
            type="button"
            disabled={disabled.use}
            onClick={props.onUseTheme}
          >
            {COPY.useTheme}
          </Button>
          <MoreMenu items={moreMenuItems(props)} />
        </div>
      </div>
      <p className="tb-hint">{COPY.useHint}</p>
    </section>
  );
}
