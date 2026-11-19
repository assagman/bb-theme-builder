import { z } from "zod";
import { draftSchema, idSchema, revisionSchema } from "../theme/schema.ts";
import { upgradePalettes } from "../theme/sidebar.ts";
import type { ThemeDraft } from "../theme/tokens.ts";

/** Versioned so a future draft shape can ignore old entries instead of misreading them. */
export const DRAFT_STORAGE_KEY = "theme-builder.draft.v1";
/** Long enough to coalesce keystrokes and color drags into one write, short enough that a reload loses almost nothing. */
export const DRAFT_SAVE_DEBOUNCE_MS = 500;

const storedDraftSchema = z.strictObject({
  draft: draftSchema,
  baseId: idSchema.nullable(),
  baseRevision: revisionSchema.nullable(),
});
// A draft kept before the sidebar colors existed gains bb's own sidebar mixes, so a reload restores it instead of dropping it.
function upgradeStoredDraft(value: unknown): unknown {
  if (typeof value !== "object" || value === null || !("draft" in value))
    return value;
  return { ...value, draft: upgradePalettes(value.draft) };
}
/** An unsaved draft plus the saved preset (and revision) it was edited from, so a reload can tell what changed. */
export type StoredDraft = {
  draft: ThemeDraft;
  baseId: string | null;
  baseRevision: number | null;
};

/** Raised when the browser refuses a write (quota, private mode); callers keep editing and surface it. */
export class DraftStorageError extends Error {
  // A field rather than a parameter property, which Node's type stripping cannot run.
  readonly operation: string;
  constructor(operation: string, cause: unknown) {
    super(`Draft storage ${operation} failed`, { cause });
    this.name = "DraftStorageError";
    this.operation = operation;
  }
}

// One page owns one draft, so a single pending write is enough and a newer edit simply replaces it.
let pendingTimer: ReturnType<typeof setTimeout> | null = null;
let pendingWrite: (() => void) | null = null;

function cancelPending() {
  if (pendingTimer !== null) clearTimeout(pendingTimer);
  pendingTimer = null;
  pendingWrite = null;
}

/** Corrupt, foreign, or unreadable entries are treated as absent: a draft is a convenience, never a reason to block the page. */
export function loadStoredDraft(): StoredDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
    if (raw === null) return null;
    const parsed = storedDraftSchema.safeParse(
      upgradeStoredDraft(JSON.parse(raw)),
    );
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Debounced so every edit can call it; a failed write goes to `onError`
 * because the timer fires after the caller has returned.
 */
export function saveStoredDraft(
  input: StoredDraft,
  onError: (error: DraftStorageError) => void,
) {
  cancelPending();
  pendingWrite = () => {
    try {
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(input));
    } catch (cause) {
      onError(new DraftStorageError("write", cause));
    }
  };
  pendingTimer = setTimeout(flushStoredDraft, DRAFT_SAVE_DEBOUNCE_MS);
}

/** Writes the waiting draft now; used on unmount so closing the page inside the debounce window loses nothing. */
export function flushStoredDraft() {
  const write = pendingWrite;
  cancelPending();
  write?.();
}

/** Drops the waiting write too, otherwise a saved or discarded draft would come back on the next load. */
export function clearStoredDraft(onError: (error: DraftStorageError) => void) {
  cancelPending();
  try {
    localStorage.removeItem(DRAFT_STORAGE_KEY);
  } catch (cause) {
    onError(new DraftStorageError("clear", cause));
  }
}
