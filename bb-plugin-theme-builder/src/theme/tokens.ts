export const SCHEMA_VERSION = 1;
export const MAX_PRESETS = 100;
export const MAX_NAME_LENGTH = 80;
export const MAX_PRESET_BYTES = 32768;
export const MAX_REVISION = 2147483647;
export const INITIAL_REVISION = 1;
export const MODES = ["light", "dark"] as const;
export type Mode = (typeof MODES)[number];

export const TOKEN_DEFINITIONS = {
  canvas: { label: "Background", css: "--canvas", basic: true },
  ink: { label: "Text", css: "--ink", basic: true },
  primary: { label: "Accent", css: "--primary", basic: true },
  primaryForeground: {
    label: "Accent text",
    css: "--primary-foreground",
    basic: true,
  },
  mutedForeground: {
    label: "Secondary text",
    css: "--muted-foreground",
    basic: false,
  },
  subtleForeground: {
    label: "Subtle text",
    css: "--subtle-foreground",
    basic: false,
  },
  readbackForeground: {
    label: "Readback text",
    css: "--readback-foreground",
    basic: false,
  },
  destructive: {
    label: "Destructive fill",
    css: "--destructive",
    basic: false,
  },
  destructiveForeground: {
    label: "Destructive button text",
    css: "--destructive-foreground",
    basic: false,
  },
  destructiveText: {
    label: "Destructive text",
    css: "--destructive-text",
    basic: false,
  },
  warning: { label: "Warning fill", css: "--warning", basic: false },
  warningText: { label: "Warning text", css: "--warning-text", basic: false },
  attention: { label: "Attention", css: "--attention", basic: false },
  success: { label: "Success", css: "--success", basic: false },
  diffAdded: { label: "Added lines", css: "--diff-added", basic: false },
  diffRemoved: { label: "Removed lines", css: "--diff-removed", basic: false },
  prMerged: { label: "Merged pull request", css: "--pr-merged", basic: false },
  fileAccent: { label: "File paths", css: "--file-accent", basic: false },
} as const;
export type TokenKey = keyof typeof TOKEN_DEFINITIONS;
export type PaletteTokens = Record<TokenKey, string>;
export const TOKEN_KEYS = Object.keys(TOKEN_DEFINITIONS) as TokenKey[];

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
};
export type ThemePreset = ThemeDraft & {
  id: string;
  revision: number;
  createdAt: string;
  updatedAt: string;
};
