import { useRpc } from "@get-bb/plugin-sdk/app";
import { useEffect } from "react";
import { appliedPresetId } from "../appearance/operations.ts";
import type { rpcContract } from "../presets/contract.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { sameDraft, toDraft } from "../theme/schema.ts";
import { swatchOf } from "../theme/swatch.ts";
import {
  MAX_NAME_LENGTH,
  type ThemeDraft,
  type ThemePreset,
} from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { describeError } from "./describe-error.ts";
import { useDraftPersistence } from "./draft-persistence.ts";
import { useEditorField } from "./store.ts";

export { TABS, type Tab } from "./store.ts";

/** Formats the export RPC returns, shared with the menu that asks for them. */
export type ExportFormat = "json" | "css";
const DOWNLOAD_CLEANUP_DELAY_MS = 1000;
const pending = { current: false };
const PRESET_LIMIT_MESSAGE =
  "Theme limit reached. Delete a saved theme before creating another.";
const MISSING_MESSAGE =
  "This theme was deleted in another window. Duplicate your changes to keep them.";
export function useBuilderState() {
  const rpc = useRpc<typeof rpcContract>();
  const [tab, setTab] = useEditorField("tab");
  const [mode, setMode] = useEditorField("mode");
  const [draft, setDraft] = useEditorField("draft");
  const [saved, setSaved] = useEditorField("saved");
  const [presets, setPresets] = useEditorField("presets");
  const [busy, setBusy] = useEditorField("busy");
  const [notice, setNotice] = useEditorField("notice");
  const [message, setMessage] = useEditorField("message");
  const [error, setError] = useEditorField("error");
  const [appearance, setAppearance] = useEditorField("appearance");
  const [missingRestore, setMissingRestore] = useEditorField("missingRestore");
  const dirty = !sameDraft(
    draft,
    saved === null ? NEUTRAL_PRESET : toDraft(saved),
  );
  const { clearDraft } = useDraftPersistence({ dirty });

  async function refreshList() {
    setPresets(await rpc.call("listPresets", {}));
  }
  async function refreshAppearance() {
    setAppearance(await rpc.call("getAppearance", {}));
  }
  /**
   * Runs after every apply/restore attempt, even a failed one: a conflict
   * means the fingerprint is stale, and without a fresh one every retry would
   * conflict again. A failed refresh is logged, not thrown, so it cannot hide
   * the outcome of the attempt itself.
   */
  async function refreshAfterAttempt(operation: string) {
    try {
      await refreshAppearance();
    } catch (cause) {
      console.warn("[theme-builder] appearance refresh failed", {
        operation,
        cause: describeError(cause),
      });
    }
  }
  useEffect(() => {
    let active = true;
    void rpc.call("listPresets", {}).then(
      (values) => {
        if (active) setPresets(values);
      },
      (cause) => {
        if (active) setError(describeError(cause));
      },
    );
    void rpc.call("getAppearance", {}).then(
      (value) => {
        if (active) setAppearance(value);
      },
      (cause) => {
        if (active) setError(describeError(cause));
      },
    );
    return () => {
      active = false;
    };
  }, [rpc]);

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

  /** `target` lets the page name a brand-new theme in the same step as saving it, before the draft state has caught up. */
  async function saveDraft(target: ThemeDraft = draft): Promise<ThemePreset> {
    const result = await rpc.call("savePreset", {
      id: saved?.id ?? null,
      expectedRevision: saved?.revision ?? null,
      draft: target,
    });
    if (result.kind !== "saved")
      throw new Error(
        result.kind === "limit" ? PRESET_LIMIT_MESSAGE : COPY.conflict,
      );
    setSaved(result.preset);
    setDraft(toDraft(result.preset));
    const { id, name, revision } = result.preset;
    setPresets((values) => [
      ...values.filter((value) => value.id !== id),
      { id, name, revision, swatch: swatchOf(result.preset) },
    ]);
    clearDraft();
    setMessage(COPY.saveSuccess);
    return result.preset;
  }

  function select(id: string) {
    if (dirty && !window.confirm(COPY.discard)) return;
    void run(async () => {
      if (id === "") {
        setSaved(null);
        setDraft(structuredClone(NEUTRAL_PRESET));
      } else {
        const preset = await rpc.call("getPreset", { id });
        if (preset === null) throw new Error(MISSING_MESSAGE);
        setSaved(preset);
        setDraft(toDraft(preset));
      }
      await refreshList();
    });
  }

  /** Throws the unsaved edits away, back to the saved preset or the neutral starter. */
  function discard() {
    setDraft(saved === null ? structuredClone(NEUTRAL_PRESET) : toDraft(saved));
    clearDraft();
    setError(null);
    setMessage(null);
    setNotice(null);
  }

  function rename(name: string) {
    setDraft((value) => ({ ...value, name }));
  }

  /** Starts from the neutral starter as an unsaved theme; asking about unsaved edits is the page's job. */
  function newTheme() {
    setSaved(null);
    setDraft(structuredClone(NEUTRAL_PRESET));
    clearDraft();
    setError(null);
    setMessage(null);
    setNotice(null);
  }

  function duplicate() {
    setDraft({
      ...structuredClone(draft),
      name:
        draft.name.slice(0, MAX_NAME_LENGTH - COPY.copySuffix.length) +
        COPY.copySuffix,
    });
    setSaved(null);
    setError(null);
    setMessage(null);
    setNotice(null);
  }

  function remove() {
    if (
      saved === null ||
      !window.confirm(dirty ? COPY.confirmDeleteDirty : COPY.confirmDelete)
    )
      return;
    void run(async () => {
      const result = await rpc.call("deletePreset", {
        id: saved.id,
        expectedRevision: saved.revision,
      });
      if (result.kind === "conflict") throw new Error(COPY.conflict);
      setSaved(null);
      setDraft(structuredClone(NEUTRAL_PRESET));
      setMessage(COPY.deleted);
      await refreshList();
    });
  }

  function download(format: ExportFormat) {
    if (saved === null) return;
    void run(async () => {
      const result = await rpc.call("exportPreset", {
        id: saved.id,
        revision: saved.revision,
      });
      if (result.kind === "conflict") throw new Error(COPY.conflict);
      const blob = new Blob([result[format]], {
        type: format === "json" ? COPY.downloadTypeJson : COPY.downloadTypeCss,
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${result.baseName}.${format}`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_CLEANUP_DELAY_MS);
    });
  }

  async function saveAndApply(target: ThemeDraft, observed: string) {
    const preset = await saveDraft(target);
    try {
      const result = await rpc.call("applyPreset", {
        id: preset.id,
        revision: preset.revision,
        observedFingerprint: observed,
      });
      if (result.kind !== "applied")
        throw new Error(
          "message" in result ? result.message : COPY.unconfirmed,
        );
      setMessage(COPY.applySuccess);
      setMissingRestore(false);
    } catch (cause) {
      setMessage(null);
      throw new Error(COPY.savedApplyFailed + describeError(cause));
    } finally {
      await refreshAfterAttempt("apply");
    }
  }

  function apply() {
    if (appearance === null) return;
    const observed = appearance.fingerprint;
    void run(() => saveAndApply(draft, observed));
  }

  /** Names a not-yet-saved theme and saves it (and applies it when asked) in one step, so the page needs no separate rename-then-save. */
  function saveAs(name: string, options: { apply: boolean }) {
    const target = { ...draft, name };
    if (!options.apply) {
      void run(async () => {
        await saveDraft(target);
      });
      return;
    }
    if (appearance === null) return;
    const observed = appearance.fingerprint;
    void run(() => saveAndApply(target, observed));
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
    rename,
    newTheme,
    appliedPresetId: appliedPresetId(
      appearance?.themeId ?? "",
      presets.map((preset) => preset.id),
    ),
    mode,
    setMode,
    draft,
    setDraft,
    saved,
    presets,
    dirty,
    busy,
    message,
    error,
    select,
    duplicate,
    remove,
    download,
    appearance,
    missingRestore,
    apply,
    restore,
    saveAs,
    save: () => {
      void run(async () => {
        await saveDraft();
      });
    },
  };
}
