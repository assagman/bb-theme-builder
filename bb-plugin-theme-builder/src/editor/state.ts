import { useRpc } from "@get-bb/plugin-sdk/app";
import { useEffect } from "react";
import { describeError } from "../shared/describe-error.ts";
import { sameDraft } from "../theme/schema.ts";
import type {
  rpcContract,
  SaveOutcome,
  ThemeView,
} from "../themes/contract.ts";
import { slugify } from "../themes/ids.ts";
import { buildCopyCss } from "../themes/theme-css.ts";
import { COPY } from "./copy.ts";
import { useDraftPersistence } from "./draft-persistence.ts";
import { LOG_PREFIX } from "./log.ts";
import { sourceFromView, unaskableView } from "./source.ts";
import {
  INITIAL_SOURCE,
  readEditor,
  type Source,
  useEditorField,
} from "./store.ts";

export { TABS, type Tab } from "./store.ts";

/** Formats the page can download, shared with the menu that asks for them. */
export type ExportFormat = "json" | "css";
const DOWNLOAD_CLEANUP_DELAY_MS = 1000;
const JSON_INDENT = 2;
const FOCUS_EVENT = "focus";
const pending = { current: false };
type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;

/**
 * Keeps the dropdown, the appearance and the open theme's history current:
 * read on mount and again whenever the page regains focus, because themes
 * are files other windows and tools can change. The history reply carries
 * the file's hash now, so the page notices an outside change before an
 * Overwrite conflict would. Replies after unmount, or (for history) after
 * another theme was opened, are dropped so they never describe the wrong one.
 */
function useLiveCatalog(rpc: Rpc) {
  const [, setCatalog] = useEditorField("catalog");
  const [, setAppearance] = useEditorField("appearance");
  const [, setHistory] = useEditorField("history");
  const [, setError] = useEditorField("error");
  useEffect(() => {
    let active = true;
    const deliver = <T>(request: Promise<T>, apply: (value: T) => void) =>
      void request.then(
        (value) => {
          if (active) apply(value);
        },
        (cause) => {
          if (active) setError(describeError(cause));
        },
      );
    const load = () => {
      deliver(rpc.call("listThemes", {}), setCatalog);
      deliver(rpc.call("getAppearance", {}), setAppearance);
      const open = readEditor("source");
      if (open.kind === "custom")
        deliver(rpc.call("getThemeHistory", { id: open.id }), (value) => {
          if (readEditor("source") === open) setHistory(value);
        });
    };
    load();
    window.addEventListener(FOCUS_EVENT, load);
    return () => {
      active = false;
      window.removeEventListener(FOCUS_EVENT, load);
    };
  }, [rpc, setCatalog, setAppearance, setHistory, setError]);
}

/**
 * The page's one working copy of a bb theme and every action on it. Opening
 * a theme copies it into the editor; Overwrite and Save as new are the only
 * ways the copy reaches disk.
 */
export function useBuilderState() {
  const rpc = useRpc<typeof rpcContract>();
  const [tab, setTab] = useEditorField("tab");
  const [mode, setMode] = useEditorField("mode");
  const [draft, setDraft] = useEditorField("draft");
  const [source, setSource] = useEditorField("source");
  const [catalog, setCatalog] = useEditorField("catalog");
  const [history, setHistory] = useEditorField("history");
  const [busy, setBusy] = useEditorField("busy");
  const [notice, setNotice] = useEditorField("notice");
  const [message, setMessage] = useEditorField("message");
  const [error, setError] = useEditorField("error");
  const [appearance, setAppearance] = useEditorField("appearance");
  const [missingRestore, setMissingRestore] = useEditorField("missingRestore");
  const dirty = !sameDraft(draft, source.loaded);
  const { clearDraft, phase } = useDraftPersistence({ dirty });
  useLiveCatalog(rpc);

  async function refreshCatalog() {
    const next = await rpc.call("listThemes", {});
    setCatalog(next);
    return next;
  }
  async function refreshHistory(next: Source) {
    setHistory(
      next.kind === "custom"
        ? await rpc.call("getThemeHistory", { id: next.id })
        : null,
    );
  }
  /**
   * Runs after every switch or save, even a failed one: a conflict means the
   * fingerprint is stale, and without a fresh one every retry would conflict.
   * A failure is logged, not thrown, so it cannot hide the attempt's outcome.
   */
  async function refreshAfterAttempt(operation: string) {
    try {
      setAppearance(await rpc.call("getAppearance", {}));
      await refreshCatalog();
    } catch (cause) {
      console.warn(`${LOG_PREFIX} refresh failed`, {
        operation,
        cause: describeError(cause),
      });
    }
  }

  async function run(action: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    setNotice(null);
    try {
      await action();
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  /** Makes a theme as the server has it the working copy, dropping any stored draft of the previous one. */
  function adopt(view: ThemeView): Source {
    const next = sourceFromView(view);
    setSource(next);
    setDraft(structuredClone(next.loaded));
    clearDraft();
    return next;
  }
  /** Built-in themes the server cannot describe are answered locally; the rest come from the server. */
  async function loadView(id: string): Promise<ThemeView> {
    return unaskableView(id) ?? (await rpc.call("getTheme", { id }));
  }
  async function open(id: string) {
    await refreshHistory(adopt(await loadView(id)));
  }

  // With no restored draft and nothing picked yet, the page starts on the theme bb is using.
  const activeId = catalog?.activeId;
  useEffect(() => {
    if (
      phase !== "ready" ||
      activeId === undefined ||
      readEditor("source") !== INITIAL_SOURCE ||
      !sameDraft(readEditor("draft"), INITIAL_SOURCE.loaded)
    )
      return;
    const startDraft = readEditor("draft");
    void run(async () => {
      const view = await loadView(activeId);
      // The user may have edited while the theme loaded; their edit wins over this default, as it does over a restored draft.
      if (
        readEditor("draft") !== startDraft ||
        readEditor("source") !== INITIAL_SOURCE
      )
        return;
      await refreshHistory(adopt(view));
    });
  }, [phase, activeId]);

  /** Shared ending of Overwrite, Save as new, Undo and Redo: the file on disk becomes the working copy. */
  async function afterSave(outcome: SaveOutcome, success: string) {
    try {
      if (outcome.kind !== "saved") throw new Error(outcome.message);
      const next = adopt(outcome.theme);
      setMessage(
        outcome.repaint === "unconfirmed"
          ? `${success} ${COPY.repaintUnconfirmed}`
          : success,
      );
      await refreshHistory(next);
    } finally {
      await refreshAfterAttempt("save");
    }
  }

  /** Returns false when the user declined the discard prompt, so the page keeps state tied to the unchanged theme. */
  function select(id: string): boolean {
    if (dirty && !window.confirm(COPY.discard)) return false;
    void run(() => open(id));
    return true;
  }

  /** Throws the unsaved edits away, back to the theme as loaded. */
  function discard() {
    setDraft(structuredClone(source.loaded));
    clearDraft();
    setError(null);
    setMessage(null);
    setNotice(null);
  }

  function overwrite() {
    const { id, hash } = source;
    if (source.kind !== "custom" || hash === null) return;
    const target = draft;
    void run(async () =>
      afterSave(
        await rpc.call("overwriteTheme", {
          id,
          expectedHash: hash,
          draft: target,
        }),
        COPY.saveSuccess,
      ),
    );
  }

  function saveAs(name: string) {
    const sourceId = source.kind === "custom" ? source.id : null;
    const target = draft;
    void run(async () =>
      afterSave(
        await rpc.call("saveThemeAs", { name, sourceId, draft: target }),
        COPY.saveSuccess,
      ),
    );
  }

  /** Returns false when nothing moved because the discard prompt was declined, so the page keeps the roll trail. */
  function step(direction: "undo" | "redo"): boolean {
    if (source.kind !== "custom") return false;
    if (dirty && !window.confirm(COPY.discard)) return false;
    const { id } = source;
    const undo = direction === "undo";
    void run(async () =>
      afterSave(
        await rpc.call(undo ? "undoTheme" : "redoTheme", { id }),
        undo ? COPY.undone : COPY.redone,
      ),
    );
    return true;
  }

  function useTheme() {
    if (appearance === null) return;
    const observedFingerprint = appearance.fingerprint;
    const themeId = source.id;
    void run(async () => {
      try {
        const result = await rpc.call("useTheme", {
          themeId,
          observedFingerprint,
        });
        if (result.kind !== "applied")
          throw new Error(
            "message" in result ? result.message : COPY.unconfirmed,
          );
        setMessage(COPY.useSuccess);
        setMissingRestore(false);
      } finally {
        await refreshAfterAttempt("use");
      }
    });
  }

  /** Returns false when nothing was deleted because the prompt was declined, so the page keeps the roll trail. */
  function remove(): boolean {
    if (
      source.kind !== "custom" ||
      !window.confirm(dirty ? COPY.confirmDeleteDirty : COPY.confirmDelete)
    )
      return false;
    const { id } = source;
    void run(async () => {
      const result = await rpc.call("deleteTheme", { id });
      if (result.kind !== "deleted") throw new Error(result.message);
      // The deleted theme was never the active one, so bb's current theme is always there to fall back to.
      const next = await refreshCatalog();
      await open(next.activeId);
      setMessage(COPY.deleted);
    });
    return true;
  }

  /** Downloads exactly what Save would write, so an export can be dropped into another bb's theme folder. */
  function download(format: ExportFormat) {
    const body =
      format === "json"
        ? `${JSON.stringify(draft, null, JSON_INDENT)}\n`
        : buildCopyCss(source.css, draft);
    const blob = new Blob([body], {
      type: format === "json" ? COPY.downloadTypeJson : COPY.downloadTypeCss,
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${slugify(source.label)}.${format}`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_CLEANUP_DELAY_MS);
  }

  function restore(fallbackToDefault = false) {
    if (
      appearance?.operationId == null ||
      (fallbackToDefault && !window.confirm(COPY.defaultConfirm))
    )
      return;
    const operationId = appearance.operationId;
    void run(async () => {
      try {
        const result = await rpc.call("restoreAppearance", {
          operationId,
          observedFingerprint: appearance.fingerprint,
          fallbackToDefault,
        });
        setMissingRestore(result.kind === "missing");
        if (result.kind !== "restored")
          throw new Error(
            "message" in result ? result.message : COPY.unconfirmed,
          );
        setMessage(
          fallbackToDefault ? COPY.defaultSuccess : COPY.restoreSuccess,
        );
      } finally {
        await refreshAfterAttempt("restore");
      }
    });
  }

  return {
    tab,
    setTab,
    notice,
    discard,
    mode,
    setMode,
    draft,
    setDraft,
    source,
    catalog,
    history,
    dirty,
    busy,
    message,
    error,
    select,
    overwrite,
    saveAs,
    undo: () => step("undo"),
    redo: () => step("redo"),
    useTheme,
    remove,
    download,
    appearance,
    missingRestore,
    restore,
  };
}
