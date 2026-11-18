import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useSyncExternalStore,
} from "react";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import type { Swatch } from "../theme/swatch.ts";
import type { Mode, ThemeDraft, ThemePreset } from "../theme/tokens.ts";

const DEFAULT_MODE: Mode = "light";
/** Tabs of the redesigned page; `ai` first because describing a theme is the main way in. */
export const TABS = ["ai", "edit", "randomize"] as const;
export type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "ai";
/** One saved-theme row as the list shows it. */
export type Summary = Pick<ThemePreset, "id" | "name" | "revision"> & {
  swatch: Swatch;
};
export type AppearanceState = {
  themeId: string;
  fingerprint: string;
  restoreAvailable: boolean;
  operationId: string | null;
};
/**
 * A message from draft persistence that the page must treat specially: the
 * kind tells the page when to offer Discard, so it never parses the text.
 */
export type Notice = {
  kind: "restored" | "restoredDeleted" | "restoreFailed";
  text: string;
};
export type EditorState = {
  notice: Notice | null;
  tab: Tab;
  mode: Mode;
  draft: ThemeDraft;
  saved: ThemePreset | null;
  presets: Summary[];
  busy: boolean;
  message: string | null;
  error: string | null;
  appearance: AppearanceState | null;
  missingRestore: boolean;
};
// Module-level so the draft survives compact-shell remounts; hooks of the page share this one copy.
let retainedEditor: EditorState = {
  tab: DEFAULT_TAB,
  notice: null,
  mode: DEFAULT_MODE,
  draft: structuredClone(NEUTRAL_PRESET),
  saved: null,
  presets: [],
  busy: false,
  message: null,
  error: null,
  appearance: null,
  missingRestore: false,
};
const editorListeners = new Set<() => void>();
function subscribeEditor(listener: () => void) {
  editorListeners.add(listener);
  return () => {
    editorListeners.delete(listener);
  };
}

/** Reads the newest value outside render, so async code can tell whether the user acted while it waited. */
export function readEditor<K extends keyof EditorState>(
  key: K,
): EditorState[K] {
  return retainedEditor[key];
}

/** Retained editor field shared by the page, draft persistence, and chat, so all edit the same draft. */
export function useEditorField<K extends keyof EditorState>(
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
