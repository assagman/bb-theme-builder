import { z } from "zod";
import { draftSchema } from "../theme/schema.ts";
import { upgradePalettes } from "../theme/sidebar.ts";
import type { ThemeDraft } from "../theme/tokens.ts";
import { ANY_THEME_ID_PATTERN, HASH_PATTERN } from "../themes/ids.ts";

/** Versioned so a future draft shape can ignore old entries instead of misreading them. */
export const DRAFT_STORAGE_KEY = "theme-builder.draft.v2";
/**
 * Drafts of the preset era point at presets that are now bb themes under
 * other ids; they cannot be matched, so they are dropped rather than misread.
 */
const LEGACY_DRAFT_KEYS = ["theme-builder.draft.v1"];
/** Long enough to coalesce keystrokes and color drags into one write, short enough that a reload loses almost nothing. */
export const DRAFT_SAVE_DEBOUNCE_MS = 500;

const storedDraftSchema = z.strictObject({
  draft: draftSchema,
  sourceId: z.string().regex(ANY_THEME_ID_PATTERN),
  sourceHash: z.string().regex(HASH_PATTERN).nullable(),
  baseline: draftSchema,
});
// Drafts pass through the sidebar upgrade like every stored palette, so an entry written by an older build still loads.
function upgradeStoredDraft(value: unknown): unknown {
  if (typeof value !== "object" || value === null) return value;
  const record = value as Record<string, unknown>;
  return {
    ...record,
    draft: upgradePalettes(record.draft),
    baseline: upgradePalettes(record.baseline),
  };
}
/**
 * An unsaved draft plus the theme it is a copy of: its id, the file hash it
 * was loaded at (so Overwrite can refuse a file changed since), and the
 * draft as loaded (so "unsaved" still means the same after a reload).
 */
export type StoredDraft = {
  draft: ThemeDraft;
  sourceId: string;
  sourceHash: string | null;
  baseline: ThemeDraft;
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
    for (const key of LEGACY_DRAFT_KEYS) localStorage.removeItem(key);
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
