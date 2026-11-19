import type { ThemeExtras } from "./extras.ts";

export const SCHEMA_VERSION = 1;
export const MAX_PRESETS = 100;
export const MAX_NAME_LENGTH = 80;
export const MAX_PRESET_BYTES = 32768;
export const MAX_REVISION = 2147483647;
export const INITIAL_REVISION = 1;
export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

/**
 * Purpose groups of the Edit tab, in display order. Colors are grouped by what
 * they style so a user finds "the red ones" without knowing token names.
 */
export const TOKEN_GROUPS = [
  "basics",
  "sidebar",
  "text",
  "status",
  "code",
] as const;
export type TokenGroup = (typeof TOKEN_GROUPS)[number];

/**
 * Group that starts collapsed: its colors are rarely edited, so hiding them
 * keeps the common ones in view. Typed as TokenGroup so renaming a group fails
 * to compile instead of silently opening every group.
 */
export const TOKEN_GROUP_COLLAPSED: TokenGroup = "code";

/**
 * Every token belongs to exactly one group; `satisfies` makes the compiler
 * reject a mistyped group, which would otherwise drop the token from the Edit
 * tab without any error.
 */
export const TOKEN_DEFINITIONS = {
  canvas: { label: "Background", css: "--canvas", group: "basics" },
  ink: { label: "Text", css: "--ink", group: "basics" },
  primary: { label: "Accent", css: "--primary", group: "basics" },
  primaryForeground: {
    label: "Accent text",
    css: "--primary-foreground",
    group: "basics",
  },
  // The left side panel has its own surface in bb, so a theme can keep the main screen and still recolor the panel.
  sidebar: { label: "Sidebar background", css: "--sidebar", group: "sidebar" },
  sidebarForeground: {
    label: "Sidebar text",
    css: "--sidebar-foreground",
    group: "sidebar",
  },
  sidebarAccent: {
    label: "Sidebar hover",
    css: "--sidebar-accent",
    group: "sidebar",
  },
  sidebarBorder: {
    label: "Sidebar border",
    css: "--sidebar-border",
    group: "sidebar",
  },
  mutedForeground: {
    label: "Secondary text",
    css: "--muted-foreground",
    group: "text",
  },
  subtleForeground: {
    label: "Subtle text",
    css: "--subtle-foreground",
    group: "text",
  },
  readbackForeground: {
    label: "Readback text",
    css: "--readback-foreground",
    group: "text",
  },
  destructive: {
    label: "Destructive fill",
    css: "--destructive",
    group: "status",
  },
  destructiveForeground: {
    label: "Destructive button text",
    css: "--destructive-foreground",
    group: "status",
  },
  destructiveText: {
    label: "Destructive text",
    css: "--destructive-text",
    group: "status",
  },
  warning: { label: "Warning fill", css: "--warning", group: "status" },
  warningText: {
    label: "Warning text",
    css: "--warning-text",
    group: "status",
  },
  attention: { label: "Attention", css: "--attention", group: "status" },
  success: { label: "Success", css: "--success", group: "status" },
  diffAdded: { label: "Added lines", css: "--diff-added", group: "code" },
  diffRemoved: { label: "Removed lines", css: "--diff-removed", group: "code" },
  prMerged: { label: "Merged pull request", css: "--pr-merged", group: "code" },
  fileAccent: { label: "File paths", css: "--file-accent", group: "code" },
} as const satisfies Record<
  string,
  { label: string; css: string; group: TokenGroup }
>;
export type TokenKey = keyof typeof TOKEN_DEFINITIONS;
export type PaletteTokens = Record<TokenKey, string>;
export const TOKEN_KEYS = Object.keys(TOKEN_DEFINITIONS) as TokenKey[];

/**
 * Tokens of one group in definition order; shared by the row list and the
 * group failure count so both always see the same membership.
 */
export const tokensInGroup = (group: TokenGroup): TokenKey[] =>
  TOKEN_KEYS.filter((key) => TOKEN_DEFINITIONS[key].group === group);

export const UI_FONTS = {
  system: {
    label: "System sans",
    stack: "system-ui, -apple-system, sans-serif",
  },
  humanist: {
    label: "Humanist sans",
    stack: '"Trebuchet MS", system-ui, sans-serif',
  },
  serif: { label: "Classic serif", stack: 'Georgia, "Times New Roman", serif' },
} as const;
export const CODE_FONTS = {
  system: {
    label: "System mono",
    stack: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  menlo: { label: "Menlo", stack: "Menlo, Monaco, monospace" },
  consolas: { label: "Consolas", stack: 'Consolas, "Courier New", monospace' },
} as const;

export type ThemeDraft = {
  schemaVersion: typeof SCHEMA_VERSION;
  name: string;
  light: PaletteTokens;
  dark: PaletteTokens;
  uiFont: keyof typeof UI_FONTS;
  codeFont: keyof typeof CODE_FONTS;
  /** Overrides of bb's derived color tokens; absent when the theme keeps all of bb's own. */
  extras?: ThemeExtras;
};
export type ThemePreset = ThemeDraft & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
