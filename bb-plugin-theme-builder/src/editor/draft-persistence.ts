import { useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import type { rpcContract } from "../presets/contract.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { sameDraft, toDraft } from "../theme/schema.ts";
import type { ThemeDraft, ThemePreset } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { describeError } from "./describe-error.ts";
import {
  clearStoredDraft,
  type DraftStorageError,
  flushStoredDraft,
  loadStoredDraft,
  saveStoredDraft,
} from "./draft-storage.ts";
import { type Notice, readEditor, useEditorField } from "./store.ts";

const LOG_PREFIX = "[theme-builder]";
type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
/**
 * `pending` until the stored draft was considered, `ready` afterwards, and
 * `failed` when it could not be read: then the stored entry must be kept.
 */
type Phase = "pending" | "ready" | "failed";
// Module-level like the editor store: a remounted page must not restore a second time over live edits.
let hydration: Phase = "pending";
// Storage failures repeat on every edit; one log line per page load is enough to diagnose.
let storageFailureLogged = false;

type Restored = {
  draft: ThemeDraft;
  saved: ThemePreset | null;
  notice: Notice;
};

/**
 * Decides what a stored draft becomes. Returns null when nothing should be
 * restored; throws when the base preset cannot be read, so the caller keeps
 * the stored entry for a later attempt.
 */
async function restoreFromStorage(
  rpc: Rpc,
  onStale: () => void,
): Promise<Restored | null> {
  const stored = loadStoredDraft();
  if (stored === null) return null;
  const startDraft = readEditor("draft");
  const startSaved = readEditor("saved");
  // Live edits already held by a remounted page are newer than anything stored.
  if (startSaved !== null || !sameDraft(startDraft, NEUTRAL_PRESET))
    return null;
  const base =
    stored.baseId === null
      ? null
      : await rpc.call("getPreset", { id: stored.baseId });
  // The user may have started editing during the wait; their edits win over the stored copy.
  if (readEditor("draft") !== startDraft || readEditor("saved") !== startSaved)
    return null;
  const baseDraft = base === null ? NEUTRAL_PRESET : toDraft(base);
  if (sameDraft(stored.draft, baseDraft)) {
    onStale();
    return null;
  }
  if (stored.baseId !== null && base === null)
    // The original is gone, so the edits can only continue as a new theme.
    return {
      draft: stored.draft,
      saved: null,
      notice: {
        kind: "restoredDeleted",
        text: `${COPY.restoredDeleted} ${stored.draft.name}`,
      },
    };
  // Keeping the revision the edits started from makes Save report a conflict if the base moved on, instead of overwriting it.
  const saved =
    base === null
      ? null
      : { ...base, revision: stored.baseRevision ?? base.revision };
  return {
    draft: stored.draft,
    saved,
    notice: {
      kind: "restored",
      text: `${COPY.restored} ${stored.draft.name}`,
    },
  };
}

/**
 * Keeps the unsaved draft across reloads: restores it once on mount, writes
 * it (debounced) while it differs from its base, and drops it when clean.
 */
export function useDraftPersistence({ dirty }: { dirty: boolean }) {
  const rpc = useRpc<typeof rpcContract>();
  const [draft, setDraft] = useEditorField("draft");
  const [saved, setSaved] = useEditorField("saved");
  const [, setMessage] = useEditorField("message");
  const [, setNotice] = useEditorField("notice");
  const [phase, setPhase] = useState<Phase>(hydration);
  const settle = useCallback((next: Phase) => {
    hydration = next;
    setPhase(next);
  }, []);
  const reportStorageFailure = useCallback(
    (failure: DraftStorageError) => {
      if (!storageFailureLogged) {
        storageFailureLogged = true;
        console.warn(`${LOG_PREFIX} draft storage failure`, {
          operation: failure.operation,
          cause: describeError(failure.cause),
        });
      }
      setMessage(COPY.draftNotKept);
    },
    [setMessage],
  );
  const clearDraft = useCallback(
    () => clearStoredDraft(reportStorageFailure),
    [reportStorageFailure],
  );

  useEffect(() => {
    if (hydration !== "pending") return;
    let active = true;
    void restoreFromStorage(rpc, clearDraft).then(
      (restored) => {
        if (!active) return;
        if (restored !== null) {
          setSaved(restored.saved);
          setDraft(restored.draft);
          setNotice(restored.notice);
        }
        settle("ready");
      },
      (cause) => {
        if (!active) return;
        // Not clearing here: a transient failure must not cost the user their stored edits.
        console.warn(`${LOG_PREFIX} draft restore failed`, {
          operation: "restore",
          cause: describeError(cause),
        });
        setNotice({ kind: "restoreFailed", text: COPY.restoreFailed });
        settle("failed");
      },
    );
    return () => {
      active = false;
    };
  }, [rpc, clearDraft, settle, setSaved, setDraft, setNotice]);

  useEffect(() => {
    if (phase === "pending") return;
    if (dirty)
      saveStoredDraft(
        {
          draft,
          baseId: saved?.id ?? null,
          baseRevision: saved?.revision ?? null,
        },
        reportStorageFailure,
      );
    else if (phase === "ready") clearDraft();
  }, [phase, dirty, draft, saved, reportStorageFailure, clearDraft]);

  // The debounce timer must not outlive the page, and closing inside its window must not lose the last edit.
  useEffect(() => flushStoredDraft, []);

  return { clearDraft };
}
