/**
 * Turns what the server says about a theme into the editor's working-copy
 * source. Shared by opening a theme, saving, undo/redo and draft restore so
 * every path reads a theme the same way.
 */
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { MAX_NAME_LENGTH, type ThemeDraft } from "../theme/tokens.ts";
import type { ThemeView } from "../themes/contract.ts";
import { ANY_THEME_ID_PATTERN } from "../themes/ids.ts";
import { parseThemeCss } from "../themes/theme-css.ts";
import type { Source } from "./store.ts";

/** Neutral under the theme's name, the start for themes whose colours bb does not expose. */
function neutralNamed(name: string): ThemeDraft {
  return {
    ...structuredClone(NEUTRAL_PRESET),
    name: name.slice(0, MAX_NAME_LENGTH),
  };
}

/** A source for a theme that no longer exists: only Save as new can keep its edits. */
export function goneSource(id: string, loaded: ThemeDraft): Source {
  return {
    kind: "gone",
    id,
    label: id,
    css: null,
    hash: null,
    owned: false,
    loaded,
    scopedOverrides: false,
  };
}

/**
 * The view of an id the server cannot be asked about: bb may list a custom
 * folder whose name fails even the loose id pattern the RPC accepts, and it
 * is no more editable than one the server reports as unsupported.
 */
export function unaskableView(id: string): ThemeView | null {
  return ANY_THEME_ID_PATTERN.test(id) ? null : { kind: "unsupported", id };
}

export function sourceFromView(view: ThemeView): Source {
  if (view.kind === "missing")
    return goneSource(view.id, neutralNamed(view.id));
  if (view.kind !== "custom") {
    const label = "name" in view ? view.name : view.id;
    return {
      kind: view.kind,
      id: view.id,
      label,
      css: null,
      hash: null,
      owned: false,
      loaded: neutralNamed(label),
      scopedOverrides: false,
    };
  }
  const parsed = parseThemeCss(view.css, view.id);
  return {
    kind: "custom",
    id: view.id,
    label: view.id,
    css: view.css,
    hash: view.hash,
    owned: view.owned,
    loaded: parsed.draft,
    scopedOverrides: parsed.scopedOverrides,
  };
}
