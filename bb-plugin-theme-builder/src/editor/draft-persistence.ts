import { useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useState } from "react";
import { describeError } from "../shared/describe-error.ts";
import { sameDraft } from "../theme/schema.ts";
import type { ThemeDraft } from "../theme/tokens.ts";
import type { rpcContract } from "../themes/contract.ts";
import { COPY } from "./copy.ts";
import {
  clearStoredDraft,
  type DraftStorageError,
  flushStoredDraft,
  loadStoredDraft,
  saveStoredDraft,
} from "./draft-storage.ts";
import { LOG_PREFIX } from "./log.ts";
import { goneSource, sourceFromView } from "./source.ts";
import {
  INITIAL_SOURCE,
  type Notice,
  readEditor,
  type Source,
  useEditorField,
} from "./store.ts";

type Rpc = ReturnType<typeof useRpc<typeof rpcContract>>;
/**
 * `pending` until the stored draft was considered, `ready` afterwards, and
 * `failed` when it could not be read: then the stored entry must be kept.
 */
export type Phase = "pending" | "ready" | "failed";
// Module-level like the editor store: a remounted page must not restore a second time over live edits.
let hydration: Phase = "pending";
// Storage failures repeat on every edit; one log line per page load is enough to diagnose.
let storageFailureLogged = false;

type Restored = {
  draft: ThemeDraft;
  source: Source;
  notice: Notice;
};

/**
 * Decides what a stored draft becomes. Returns null when nothing should be
 * restored; throws when the source theme cannot be read, so the caller keeps
 * the stored entry for a later attempt.
 */
async function restoreFromStorage(
  rpc: Rpc,
  onStale: () => void,
): Promise<Restored | null> {
  const stored = loadStoredDraft();
  if (stored === null) return null;
  const startDraft = readEditor("draft");
  const startSource = readEditor("source");
  // Live edits or a theme opened by a remounted page are newer than anything stored.
  if (
    startSource !== INITIAL_SOURCE ||
    !sameDraft(startDraft, INITIAL_SOURCE.loaded)
  )
    return null;
  const view = await rpc.call("getTheme", { id: stored.sourceId });
  // The user may have acted during the wait; their choice wins over the stored copy.
  if (
    readEditor("draft") !== startDraft ||
    readEditor("source") !== startSource
  )
    return null;
  const fresh = sourceFromView(view);
  // A file changed since keeps the hash the edits started from, so Overwrite reports a conflict instead of replacing the newer file.
  const source =
    fresh.kind === "gone"
      ? goneSource(stored.sourceId, stored.baseline)
      : fresh.hash === stored.sourceHash
        ? fresh
        : { ...fresh, hash: stored.sourceHash, loaded: stored.baseline };
  if (sameDraft(stored.draft, source.loaded)) {
    onStale();
    return null;
  }
  const notice: Notice =
    source.kind === "gone"
      ? {
          kind: "restoredDeleted",
          text: `${COPY.restoredDeleted} ${source.label}`,
        }
      : { kind: "restored", text: `${COPY.restored} ${source.label}` };
  return { draft: stored.draft, source, notice };
}

/**
 * Keeps the unsaved draft across reloads: restores it once on mount, writes
 * it (debounced) while it differs from its base, and drops it when clean.
 */
export function useDraftPersistence({ dirty }: { dirty: boolean }) {
  const rpc = useRpc<typeof rpcContract>();
  const [draft, setDraft] = useEditorField("draft");
  const [source, setSource] = useEditorField("source");
  const [, setMessage] = useEditorField("message");
  const [, setNotice] = useEditorField("notice");
  const [, setHistory] = useEditorField("history");
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
          setSource(restored.source);
          setDraft(restored.draft);
          setNotice(restored.notice);
          // The restored copy's Undo/Redo depend on its saved versions; without this they stay disabled until the next focus.
          const open = restored.source;
          if (open.kind === "custom")
            void rpc.call("getThemeHistory", { id: open.id }).then(
              (history) => {
                if (active && readEditor("source") === open)
                  setHistory(history);
              },
              (cause) =>
                console.warn(`${LOG_PREFIX} history fetch failed`, {
                  operation: "restoreHistory",
                  id: open.id,
                  cause: describeError(cause),
                }),
            );
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
  }, [rpc, clearDraft, settle, setSource, setDraft, setNotice, setHistory]);

  useEffect(() => {
    if (phase === "pending") return;
    if (dirty)
      saveStoredDraft(
        {
          draft,
          sourceId: source.id,
          sourceHash: source.hash,
          baseline: source.loaded,
        },
        reportStorageFailure,
      );
    else if (phase === "ready") clearDraft();
  }, [phase, dirty, draft, source, reportStorageFailure, clearDraft]);

  // The debounce timer must not outlive the page, and closing inside its window must not lose the last edit.
  useEffect(() => flushStoredDraft, []);

  return { clearDraft, phase };
}
