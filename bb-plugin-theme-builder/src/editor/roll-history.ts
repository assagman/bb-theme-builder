import { samePalette } from "../theme/schema.ts";
import type { ThemeDraft } from "../theme/tokens.ts";

/** The part of a draft a roll replaces; name and fonts stay the user's. */
export type RollPalette = Pick<ThemeDraft, "light" | "dark">;

/** Rolls kept after the pinned pre-roll palette; the brief caps it so memory and the Back trail stay bounded. */
export const MAX_ROLL_HISTORY = 20;

/** Palettes in roll order plus the one on screen; `index` is -1 while empty. */
export type RollHistory = {
  entries: readonly RollPalette[];
  index: number;
};

/** Start state: no roll yet, so nothing to step through. */
export const EMPTY_ROLL_HISTORY: RollHistory = { entries: [], index: -1 };

/**
 * History as the page may use it. Once the draft no longer shows the current
 * entry (edit, another theme, discard), Back would jump to a palette that is
 * not this theme's past, so the trail is treated as empty.
 */
export function liveHistory(
  history: RollHistory,
  current: RollPalette,
): RollHistory {
  const shown = history.entries[history.index];
  return shown !== undefined && samePalette(shown, current)
    ? history
    : EMPTY_ROLL_HISTORY;
}

/**
 * Adds a roll after the current entry. An empty trail is first seeded with
 * the palette before the roll, so Back returns to the user's own colors.
 * Forward entries are dropped (browser-history semantics) and the oldest rolls
 * fall off past the cap.
 */
export function recordRoll(
  history: RollHistory,
  before: RollPalette,
  rolled: RollPalette,
): RollHistory {
  const base = liveHistory(history, before);
  const kept =
    base.index < 0 ? [before] : base.entries.slice(0, base.index + 1);
  // Entry 0 is pinned: it is the user's own colors, which Back must always be able to reach.
  const [origin = before, ...rolls] = [...kept, rolled];
  const entries = [origin, ...rolls.slice(-MAX_ROLL_HISTORY)];
  return { entries, index: entries.length - 1 };
}

/** Whether a step in that direction lands on an entry, so callers never re-derive the bounds. */
export function canStep(history: RollHistory, delta: -1 | 1): boolean {
  const index = history.index + delta;
  return history.index >= 0 && index >= 0 && index < history.entries.length;
}

/** Moves one entry back or forward; out-of-range moves leave the trail unchanged. */
export function stepHistory(history: RollHistory, delta: -1 | 1): RollHistory {
  return canStep(history, delta)
    ? { ...history, index: history.index + delta }
    : history;
}
