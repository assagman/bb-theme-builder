/**
 * Theme id rules shared by the server and the page. Pure (no node imports) so
 * the dropdown filters and the server validates with the same patterns.
 */

/** bb's own themes; they expose no CSS, so copies of them start from Neutral. */
export const BUILTIN_THEME_IDS = [
  "default",
  "nord",
  "dracula",
  "solarized",
  "gruvbox",
  "catppuccin",
];
export const DEFAULT_THEME_ID = "default";
/**
 * Custom theme directory names the plugin will touch. No dots or slashes, so
 * an id can never name a parent or nested path; anything else in the catalog
 * is listed but cannot be opened or written.
 */
export const CUSTOM_THEME_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
/** Any id bb may report (built-in, custom, `plugin:<plugin>:<theme>`); membership in the catalog is checked separately. */
export const ANY_THEME_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9:@._/-]{0,199}$/;
/** Ids the old Apply wrote for every revision; noise in the dropdown unless bb is using one right now. */
export const LEGACY_REVISION_PATTERN =
  /^theme-builder-[a-f0-9]{12}-r[1-9][0-9]*-[a-f0-9]{12}$/;
export const MAX_SLUG_LENGTH = 48;
/** Largest theme.css the plugin reads or writes; real themes are a few KB. */
export const MAX_THEME_CSS_BYTES = 262144;
/** A sha256 in hex: theme file hashes and appearance fingerprints, checked the same way at every boundary. */
export const HASH_PATTERN = /^[a-f0-9]{64}$/;
/** Longest plugin theme name sent to the page; a longer one is cut rather than failing the whole list. */
export const MAX_PLUGIN_NAME_LENGTH = 200;
/** Most custom or plugin themes the dropdown lists, so a crowded theme folder cannot bloat one response. */
export const MAX_LISTED_THEMES = 1000;
const SLUG_FALLBACK = "theme";
const SLUG_SEPARATOR = "-";
const NON_SLUG_RUN = /[^a-z0-9]+/g;
const EDGE_SEPARATORS = /^-+|-+$/g;
const FIRST_SUFFIX = 2;
// Bounded so a pathological catalog cannot spin the save forever.
const MAX_SUFFIX = 10000;
const EXHAUSTED = "No free theme id is left for this name";

/** A theme name as a directory-safe id: lowercase, `-` between words, never empty. */
export function slugify(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(NON_SLUG_RUN, SLUG_SEPARATOR)
    .replace(EDGE_SEPARATORS, "")
    .slice(0, MAX_SLUG_LENGTH)
    .replace(EDGE_SEPARATORS, "");
  return slug === "" ? SLUG_FALLBACK : slug;
}

/**
 * First free id for a name: the slug itself, then `-2`, `-3`… The base is
 * shortened so the suffixed id still fits the slug limit.
 */
export function uniqueThemeId(
  name: string,
  taken: (id: string) => boolean,
): string {
  const base = slugify(name);
  if (!taken(base)) return base;
  for (let suffix = FIRST_SUFFIX; suffix <= MAX_SUFFIX; suffix += 1) {
    const tail = `${SLUG_SEPARATOR}${suffix}`;
    const head = base
      .slice(0, MAX_SLUG_LENGTH - tail.length)
      .replace(EDGE_SEPARATORS, "");
    const id = `${head === "" ? SLUG_FALLBACK : head}${tail}`;
    if (!taken(id)) return id;
  }
  throw new Error(EXHAUSTED);
}

/**
 * What a theme id is to the plugin. `unsupported` is a custom folder bb
 * lists whose name fails the strict pattern, so it is never opened or
 * written; `missing` is an id bb does not list at all.
 */
export type ThemeKind =
  | "builtin"
  | "plugin"
  | "custom"
  | "unsupported"
  | "missing";

/** The part of bb's theme catalog that says which ids exist. */
export type ThemeIds = { custom: string[]; plugins: { id: string }[] };

/** The one place that classifies an id, so listing, opening, saving and Use theme agree on it. */
export function themeKind(catalog: ThemeIds, id: string): ThemeKind {
  if (BUILTIN_THEME_IDS.includes(id)) return "builtin";
  if (catalog.plugins.some((theme) => theme.id === id)) return "plugin";
  if (!catalog.custom.includes(id)) return "missing";
  return CUSTOM_THEME_ID_PATTERN.test(id) ? "custom" : "unsupported";
}
