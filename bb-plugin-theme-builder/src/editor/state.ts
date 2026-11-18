import { useRpc } from "@get-bb/plugin-sdk/app";
import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useEffect,
  useSyncExternalStore,
} from "react";
import {
  GENERATION_TIMEOUT_MS,
  type GenerationSelection,
  POLL_INTERVAL_MS,
} from "../generation/contract.ts";
import type { rpcContract } from "../presets/contract.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { toDraft } from "../theme/schema.ts";
import {
  MAX_NAME_LENGTH,
  type Mode,
  type ThemeDraft,
  type ThemePreset,
} from "../theme/tokens.ts";
import { COPY } from "./copy.ts";

const DOWNLOAD_CLEANUP_DELAY_MS = 1000;
const DEFAULT_MODE: Mode = "light";
const DEFAULT_VIEW = "edit";
const PRESET_LIMIT_MESSAGE =
  "Preset limit reached. Delete a saved preset before creating another.";
const MISSING_MESSAGE =
  "This preset was deleted in another window. Duplicate your draft to keep it.";
const GENERATED_MESSAGE =
  "Both palettes generated. Review the preview and contrast before saving or applying.";
const CANCELLED_MESSAGE = "Generation cancelled. Your draft is unchanged.";
const UNDO_MESSAGE = "Previous draft restored.";
const GENERATION_FAILED_MESSAGE =
  "Generation could not finish. Your draft is unchanged.";
type Summary = Pick<ThemePreset, "id" | "name" | "revision">;
type AppearanceState = {
  themeId: string;
  fingerprint: string;
  restoreAvailable: boolean;
  operationId: string | null;
};
type EditorState = {
  mode: Mode;
  view: string;
  draft: ThemeDraft;
  saved: ThemePreset | null;
  undo: ThemeDraft | null;
  presets: Summary[];
  busy: boolean;
  generating: boolean;
  message: string | null;
  error: string | null;
  appearance: AppearanceState | null;
  missingRestore: boolean;
};
let retainedEditor: EditorState = {
  mode: DEFAULT_MODE,
  view: DEFAULT_VIEW,
  draft: structuredClone(NEUTRAL_PRESET),
  saved: null,
  undo: null,
  presets: [],
  busy: false,
  generating: false,
  message: null,
  error: null,
  appearance: null,
  missingRestore: false,
};
const editorListeners = new Set<() => void>();
const pending = { current: false };
const generationRequest: {
  current: { id: string; cancelled: boolean } | null;
} = { current: null };
function subscribeEditor(listener: () => void) {
  editorListeners.add(listener);
  return () => {
    editorListeners.delete(listener);
  };
}

// Transactions outlive compact-shell remounts, so their gate and completion share draft ownership.
function useEditorField<K extends keyof EditorState>(
  key: K,
): [EditorState[K], Dispatch<SetStateAction<EditorState[K]>>] {
  const value = useSyncExternalStore(
    subscribeEditor,
    () => retainedEditor[key],
  );
  const setValue = useCallback<Dispatch<SetStateAction<EditorState[K]>>>(
    (next) => {
      const value =
        typeof next === "function" ? next(retainedEditor[key]) : next;
      retainedEditor = { ...retainedEditor, [key]: value };
      for (const listener of editorListeners) listener();
    },
    [key],
  );
  return [value, setValue];
}

export function useBuilderState() {
  const rpc = useRpc<typeof rpcContract>();
  const [mode, setMode] = useEditorField("mode");
  const [view, setView] = useEditorField("view");
  const [draft, setDraft] = useEditorField("draft");
  const [saved, setSaved] = useEditorField("saved");
  const [presets, setPresets] = useEditorField("presets");
  const [busy, setBusy] = useEditorField("busy");
  const [generating, setGenerating] = useEditorField("generating");
  const [undo, setUndo] = useEditorField("undo");
  const [message, setMessage] = useEditorField("message");
  const [error, setError] = useEditorField("error");
  const [appearance, setAppearance] = useEditorField("appearance");
  const [missingRestore, setMissingRestore] = useEditorField("missingRestore");
  const dirty =
    JSON.stringify(draft) !==
    JSON.stringify(saved === null ? NEUTRAL_PRESET : toDraft(saved));
  useEffect(
    () => () => {
      const request = generationRequest.current;
      if (request !== null) {
        request.cancelled = true;
        void rpc
          .call("cancelGeneration", { requestId: request.id })
          .catch(() => {});
      }
    },
    [rpc],
  );

  async function refreshList() {
    setPresets(await rpc.call("listPresets", {}));
  }
  async function refreshAppearance() {
    setAppearance(await rpc.call("getAppearance", {}));
    setMissingRestore(false);
  }
  useEffect(() => {
    let active = true;
    void rpc.call("listPresets", {}).then(
      (values) => {
        if (active) setPresets(values);
      },
      (cause) => {
        if (active) setError(String(cause));
      },
    );
    void rpc.call("getAppearance", {}).then(
      (value) => {
        if (active) setAppearance(value);
      },
      (cause) => {
        if (active) setError(String(cause));
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
    try {
      await action();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function saveDraft(): Promise<ThemePreset> {
    const result = await rpc.call("savePreset", {
      id: saved?.id ?? null,
      expectedRevision: saved?.revision ?? null,
      draft,
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
      { id, name, revision },
    ]);
    setMessage(COPY.saveSuccess);
    return result.preset;
  }

  function select(id: string) {
    if (dirty && !window.confirm(COPY.discard)) return;
    void run(async () => {
      setUndo(null);
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

  function duplicate() {
    setUndo(null);
    setDraft({
      ...structuredClone(draft),
      name:
        draft.name.slice(0, MAX_NAME_LENGTH - COPY.copySuffix.length) +
        COPY.copySuffix,
    });
    setSaved(null);
    setError(null);
    setMessage(null);
  }

  function remove() {
    if (saved === null || !window.confirm(COPY.confirmDelete)) return;
    void run(async () => {
      const result = await rpc.call("deletePreset", {
        id: saved.id,
        expectedRevision: saved.revision,
      });
      if (result.kind === "conflict") throw new Error(COPY.conflict);
      setUndo(null);
      setSaved(null);
      setDraft(structuredClone(NEUTRAL_PRESET));
      setMessage(COPY.deleted);
      await refreshList();
    });
  }

  function download(format: "json" | "css") {
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

  function apply() {
    if (appearance === null) return;
    void run(async () => {
      const preset = await saveDraft();
      try {
        const result = await rpc.call("applyPreset", {
          id: preset.id,
          revision: preset.revision,
          observedFingerprint: appearance.fingerprint,
        });
        if (result.kind !== "applied")
          throw new Error(
            "message" in result ? result.message : COPY.unconfirmed,
          );
        setMessage(COPY.applySuccess);
      } catch (cause) {
        setMessage(null);
        throw new Error(
          COPY.savedApplyFailed +
            (cause instanceof Error ? cause.message : String(cause)),
        );
      }
      await refreshAppearance();
    });
  }

  function restore(fallbackToDefault = false) {
    if (
      appearance?.operationId == null ||
      (fallbackToDefault && !window.confirm(COPY.defaultConfirm))
    )
      return;
    const operationId = appearance.operationId;
    void run(async () => {
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
      setMessage(fallbackToDefault ? COPY.defaultSuccess : COPY.restoreSuccess);
      await refreshAppearance();
    });
  }

  function randomize(
    selection: GenerationSelection,
    accent: string | null,
    description: string | null,
  ) {
    void run(async () => {
      const before = structuredClone(draft);
      const request = { id: crypto.randomUUID(), cancelled: false };
      generationRequest.current = request;
      setGenerating(true);
      try {
        let result = await rpc.call("startGeneration", {
          requestId: request.id,
          selection,
          accent,
          description,
        });
        const deadline = Date.now() + GENERATION_TIMEOUT_MS;
        while (result.kind === "running" && !request.cancelled) {
          if (Date.now() > deadline) throw new Error(GENERATION_FAILED_MESSAGE);
          await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
          result = await rpc.call("getGeneration", { requestId: request.id });
        }
        if (request.cancelled || result.kind === "cancelled") {
          await rpc.call("cancelGeneration", { requestId: request.id });
          setMessage(CANCELLED_MESSAGE);
        } else if (result.kind === "ready") {
          setUndo(before);
          setDraft({ ...before, ...result.palette });
          setMessage(GENERATED_MESSAGE);
        } else
          throw new Error(
            result.kind === "failed"
              ? result.message
              : GENERATION_FAILED_MESSAGE,
          );
      } catch (cause) {
        await rpc
          .call("cancelGeneration", { requestId: request.id })
          .catch(() => {});
        throw cause;
      } finally {
        generationRequest.current = null;
        setGenerating(false);
      }
    });
  }

  function cancelGeneration() {
    const request = generationRequest.current;
    if (request === null) return;
    request.cancelled = true;
    void rpc
      .call("cancelGeneration", { requestId: request.id })
      .catch(() => {});
  }

  function undoRandomization() {
    if (pending.current || undo === null) return;
    setDraft(structuredClone(undo));
    setUndo(null);
    setError(null);
    setMessage(UNDO_MESSAGE);
  }

  return {
    mode,
    setMode,
    view,
    setView,
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
    generating,
    randomize,
    cancelGeneration,
    undoRandomization,
    canUndo: undo !== null,
    appearance,
    missingRestore,
    apply,
    restore,
    refreshAppearance: () => {
      void run(refreshAppearance);
    },
    save: () => {
      void run(async () => {
        await saveDraft();
      });
    },
  };
}
