import { Button } from "../../components/ui/button.tsx";
import type { HistoryView, ThemeList } from "../themes/contract.ts";
import { COPY, SELECT_CLASS } from "./copy.ts";
import type { Source } from "./store.ts";

const SELECT_ID = "tb-theme-select";
const HINT_ID = "tb-theme-history-hint";

type Option = { id: string; label: string };

/** Dropdown groups in display order; empty groups are left out so the list holds only real choices. */
function groupsOf(catalog: ThemeList | null, source: Source) {
  const mark = (id: string, label: string): Option => ({
    id,
    label: id === catalog?.activeId ? `${label}${COPY.activeSuffix}` : label,
  });
  const groups: { label: string; options: Option[] }[] = [
    {
      label: COPY.themeGroups.builtin,
      options: (catalog?.builtin ?? []).map((id) => mark(id, id)),
    },
    {
      label: COPY.themeGroups.custom,
      options: (catalog?.custom ?? []).map(({ id }) => mark(id, id)),
    },
    {
      label: COPY.themeGroups.plugins,
      options: (catalog?.plugins ?? []).map(({ id, name }) => mark(id, name)),
    },
  ].filter((group) => group.options.length > 0);
  // The open theme must always be selectable as the value, even before the list catches up or after it was deleted.
  const listed = groups.some((group) =>
    group.options.some((option) => option.id === source.id),
  );
  return { groups, missing: listed ? null : mark(source.id, source.label) };
}

/** True when the open theme's file is no longer the one the page loaded, so Overwrite would be refused. */
function changedOutside(source: Source, history: HistoryView | null) {
  return (
    source.kind === "custom" &&
    history?.hash != null &&
    history.hash !== source.hash
  );
}

/** Why Undo and Redo are off, so a disabled button is never left unexplained. */
function historyHint(source: Source, history: HistoryView | null) {
  if (source.kind !== "custom") return COPY.historyUnavailable;
  if (history !== null && !history.canUndo && !history.canRedo)
    return COPY.historyEmpty;
  return null;
}

/**
 * Every bb theme in one dropdown at the top of the page, with Undo and Redo
 * of the open theme's saved versions beside it. Picking a theme opens an
 * editable copy; asking about unsaved edits is the state layer's job.
 */
export function ThemePicker({
  catalog,
  source,
  history,
  busy,
  onSelect,
  onUndo,
  onRedo,
  onReload,
}: {
  catalog: ThemeList | null;
  source: Source;
  history: HistoryView | null;
  busy: boolean;
  onSelect: (id: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  /** Opens the theme again from disk; asking about unsaved edits is the state layer's job. */
  onReload: () => void;
}) {
  const { groups, missing } = groupsOf(catalog, source);
  const hint = historyHint(source, history);
  const custom = source.kind === "custom";
  return (
    <section className="tb-picker" aria-label={COPY.themeLabel}>
      <div className="tb-picker-row">
        <label className="tb-heading" htmlFor={SELECT_ID}>
          {COPY.themeLabel}
        </label>
        <select
          id={SELECT_ID}
          className={`${SELECT_CLASS} tb-picker-select`}
          value={source.id}
          disabled={busy}
          onChange={(event) => onSelect(event.target.value)}
        >
          {missing !== null && (
            <option value={missing.id}>{missing.label}</option>
          )}
          {groups.map((group) => (
            <optgroup key={group.label} label={group.label}>
              {group.options.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <fieldset
          className="tb-picker-history"
          aria-label={COPY.historyLabel}
          aria-describedby={hint === null ? undefined : HINT_ID}
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !custom || !history?.canUndo}
            onClick={onUndo}
          >
            {COPY.undo}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy || !custom || !history?.canRedo}
            onClick={onRedo}
          >
            {COPY.redo}
          </Button>
        </fieldset>
      </div>
      {hint !== null && (
        <p id={HINT_ID} className="tb-hint">
          {hint}
        </p>
      )}
      {(source.kind === "builtin" || source.kind === "plugin") && (
        <p className="tb-hint">{COPY.builtInNote}</p>
      )}
      {source.kind === "unsupported" && (
        <p className="tb-hint">{COPY.unsupportedNote}</p>
      )}
      {source.scopedOverrides && <p className="tb-hint">{COPY.scopedNote}</p>}
      {changedOutside(source, history) && (
        <p role="status" className="tb-hint tb-picker-changed">
          <span>{COPY.changedOutside}</span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={onReload}
          >
            {COPY.reloadTheme}
          </Button>
        </p>
      )}
    </section>
  );
}
