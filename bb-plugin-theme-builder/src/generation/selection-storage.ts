import { type GenerationSelection, selectionSchema } from "./contract.ts";

/** Same key the one-shot generator used, so a remembered model survives the move to chat. */
export const SELECTION_STORAGE_KEY = "theme-builder.generation-selection.v1";

/** An unreadable or foreign entry means no remembered model, which falls back to the provider default. */
export function loadRememberedSelection(): GenerationSelection | null {
  try {
    const value = localStorage.getItem(SELECTION_STORAGE_KEY);
    return value === null ? null : selectionSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

/** Returns false instead of throwing because a storage restriction must never block generating. */
export function rememberSelection(value: GenerationSelection): boolean {
  try {
    localStorage.setItem(SELECTION_STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
