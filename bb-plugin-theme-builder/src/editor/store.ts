import {
  type Dispatch,
  type SetStateAction,
  useCallback,
  useSyncExternalStore,
} from "react";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import type { Mode, ThemeDraft } from "../theme/tokens.ts";
import type {
  AppearanceView,
  HistoryView,
  ThemeList,
} from "../themes/contract.ts";
import { DEFAULT_THEME_ID } from "../themes/ids.ts";

const DEFAULT_MODE: Mode = "light";
/** Tabs of the redesigned page; `ai` first because describing a theme is the main way in. */
export const TABS = ["ai", "edit", "randomize"] as const;
export type Tab = (typeof TABS)[number];
const DEFAULT_TAB: Tab = "ai";
/**
 * Where the working copy came from. `custom` themes have CSS the copy keeps;
 * `builtin` and `plugin` themes expose none, so their copy starts from
 * Neutral; `unsupported` is a custom folder whose name the plugin will not
 * read, which starts from Neutral too; `gone` is a theme deleted while a
 * restored draft still used it.
 */
export type SourceKind =
  | "builtin"
  | "plugin"
  | "custom"
  | "unsupported"
  | "gone";
export type Source = {
  kind: SourceKind;
  id: string;
  /** What the dropdown and action bar call it: the id, or a plugin theme's name. */
  label: string;
  /** The theme's CSS as loaded, null when bb exposes none. */
  css: string | null;
  /** Hash of `css` that Overwrite must send back; null when there is no file. */
  hash: string | null;
  owned: boolean;
  /** The draft as loaded, which "unsaved changes" is measured against. */
  loaded: ThemeDraft;
  /** True when some rules style parts directly and may not follow edits. */
  scopedOverrides: boolean;
};
/**
 * The source before anything was opened. Compared by identity so the page
 * opens the active theme only while nothing else has been chosen.
 */
export const INITIAL_SOURCE: Source = {
  kind: "builtin",
  id: DEFAULT_THEME_ID,
  label: DEFAULT_THEME_ID,
  css: null,
  hash: null,
  owned: false,
  loaded: { ...NEUTRAL_PRESET, name: DEFAULT_THEME_ID },
  scopedOverrides: false,
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
  source: Source;
  /** bb's themes as the dropdown groups them. */
  catalog: ThemeList | null;
  /** Undo and redo availability for the open custom theme, and its file's hash on disk now. */
  history: HistoryView | null;
  busy: boolean;
  message: string | null;
  error: string | null;
  appearance: AppearanceView | null;
  missingRestore: boolean;
};
// Module-level so the draft survives compact-shell remounts; hooks of the page share this one copy.
let retainedEditor: EditorState = {
  tab: DEFAULT_TAB,
  notice: null,
  mode: DEFAULT_MODE,
  draft: structuredClone(INITIAL_SOURCE.loaded),
  source: INITIAL_SOURCE,
  catalog: null,
  history: null,
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
