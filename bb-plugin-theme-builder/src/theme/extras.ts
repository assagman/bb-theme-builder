/**
 * The rest of bb's color tokens: the ones bb derives from the core palette
 * (borders, surfaces, states) or fixes on its own (terminal colors). A theme
 * may leave each one out, and bb then paints its own default, so the draft
 * holds only the values the user chose to override. The table and the
 * defaults mirror bb's base stylesheet, so the editor shows the color bb
 * would paint for every token, set or not.
 */
import {
  ALPHA_COLOR_PATTERN,
  COLOR_PATTERN,
  mixOklab,
  type Oklch,
  oklchToHex,
  opaquePart,
  withAlpha,
} from "./color.ts";
import { NEUTRAL_PRESET } from "./defaults.ts";
import { mixOklch } from "./sidebar.ts";
import {
  type Mode,
  type PaletteTokens,
  TOKEN_DEFINITIONS,
  TOKEN_GROUP_COLLAPSED,
  TOKEN_GROUPS,
  TOKEN_KEYS,
  type TokenGroup,
  type TokenKey,
  tokensInGroup,
} from "./tokens.ts";

/** A color bb writes inline as oklch(); kept in that form so it reads like bb's stylesheet. */
type Fixed = { oklch: Oklch } | { hex: string };
/**
 * Extra tokens that other extras follow (Pill border follows Border). Spelled
 * out instead of derived from the table, which would make the table's type
 * depend on itself.
 */
type ExtraRef = "border" | "borderSeam";
type Ref = TokenKey | ExtraRef;
type Source = Ref | Fixed;
/**
 * How bb computes a token's default. `mix` is CSS `color-mix(in <space>,
 * top share, base)`; `alpha` is `color-mix(in oklab, token share, transparent)`,
 * which is the token's color at that opacity.
 */
type Derivation =
  | { ref: Ref }
  | { fixed: Fixed }
  | { mix: "oklch" | "oklab"; top: Source; share: number; base: TokenKey }
  | { alpha: Ref; share: number };
type ByMode = Record<Mode, Derivation>;

const same = (derivation: Derivation): ByMode => ({
  light: derivation,
  dark: derivation,
});
const inkMix = (light: number, dark = light): ByMode => ({
  light: { mix: "oklch", top: "ink", share: light, base: "canvas" },
  dark: { mix: "oklch", top: "ink", share: dark, base: "canvas" },
});
const alphaOf = (token: Ref, light: number, dark = light): ByMode => ({
  light: { alpha: token, share: light },
  dark: { alpha: token, share: dark },
});
const oklch = (l: number, c: number, h: number): Fixed => ({
  oklch: { l, c, h },
});
const fixed = (light: Fixed, dark: Fixed): ByMode => ({
  light: { fixed: light },
  dark: { fixed: dark },
});
// bb's terminal palette, light then dark; fixed hex values with no link to the rest of the theme.
const ansi = (light: string, dark: string): ByMode =>
  fixed({ hex: light }, { hex: dark });

const SEARCH_MATCH_AMBER = oklch(0.8, 0.13, 88);

/** Groups that only hold extra tokens; the shared ones come from tokens.ts. */
export const EXTRA_ONLY_GROUPS = [
  "surfaces",
  "lines",
  "states",
  "terminal",
] as const;
export type ExtraGroup = TokenGroup | (typeof EXTRA_ONLY_GROUPS)[number];
/** Edit tab group order; built from both lists so no group can be left off. */
export const EDIT_GROUPS: readonly ExtraGroup[] = [
  ...TOKEN_GROUPS,
  ...EXTRA_ONLY_GROUPS,
];
/** Groups that start collapsed: rarely edited, and open they would push the common colors out of view. */
export const COLLAPSED_GROUPS: ReadonlySet<ExtraGroup> = new Set<ExtraGroup>([
  TOKEN_GROUP_COLLAPSED,
  ...EXTRA_ONLY_GROUPS,
]);

/**
 * Every bb color token the core palette does not cover, in display order.
 * `satisfies` keeps a mistyped group or source a compile error instead of a
 * row that silently disappears.
 */
export const EXTRA_DEFINITIONS = {
  background: {
    label: "App background",
    css: "--background",
    group: "surfaces",
    derive: same({ ref: "canvas" }),
  },
  card: {
    label: "Card",
    css: "--card",
    group: "surfaces",
    derive: same({ ref: "canvas" }),
  },
  popover: {
    label: "Menu and popover",
    css: "--popover",
    group: "surfaces",
    derive: same({ ref: "canvas" }),
  },
  secondary: {
    label: "Secondary surface",
    css: "--secondary",
    group: "surfaces",
    derive: inkMix(0.08, 0.13),
  },
  accent: {
    label: "Accent surface",
    css: "--accent",
    group: "surfaces",
    derive: inkMix(0.08, 0.13),
  },
  muted: {
    label: "Muted surface",
    css: "--muted",
    group: "surfaces",
    derive: inkMix(0.11, 0.16),
  },
  surfaceRecessed: {
    label: "Recessed wash",
    css: "--surface-recessed",
    group: "surfaces",
    derive: alphaOf("ink", 0.06),
  },
  surfaceRecessedSolid: {
    label: "Recessed solid",
    css: "--surface-recessed-solid",
    group: "surfaces",
    derive: same({ mix: "oklab", top: "ink", share: 0.06, base: "canvas" }),
  },
  surfaceRecessedSoftSolid: {
    label: "Recessed soft solid",
    css: "--surface-recessed-soft-solid",
    group: "surfaces",
    derive: inkMix(0.042),
  },
  surfaceRaised: {
    label: "Raised wash",
    css: "--surface-raised",
    group: "surfaces",
    derive: alphaOf("ink", 0.025),
  },
  surfaceRaisedSolid: {
    label: "Raised solid",
    css: "--surface-raised-solid",
    group: "surfaces",
    derive: same({ mix: "oklab", top: "ink", share: 0.025, base: "canvas" }),
  },
  surfaceScrim: {
    label: "Scrim behind dialogs",
    css: "--surface-scrim",
    group: "surfaces",
    derive: alphaOf("canvas", 0.92),
  },
  // bb paints pills with a two-stop gradient; an override replaces it with one solid color.
  pillSurface: {
    label: "Pill",
    css: "--pill-surface",
    group: "surfaces",
    derive: inkMix(0.044, 0.13),
  },
  pillSurfaceSelected: {
    label: "Selected pill",
    css: "--pill-surface-selected",
    group: "surfaces",
    derive: inkMix(0.118, 0.207),
  },
  foreground: {
    label: "App text",
    css: "--foreground",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  cardForeground: {
    label: "Card text",
    css: "--card-foreground",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  popoverForeground: {
    label: "Menu and popover text",
    css: "--popover-foreground",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  secondaryForeground: {
    label: "Text on secondary surface",
    css: "--secondary-foreground",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  accentForeground: {
    label: "Text on accent surface",
    css: "--accent-foreground",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  pillForeground: {
    label: "Pill text",
    css: "--pill-foreground",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  pillIcon: {
    label: "Pill icon",
    css: "--pill-icon",
    group: "text",
    derive: same({ ref: "ink" }),
  },
  versionUpgrade: {
    label: "Version upgrade text",
    css: "--version-upgrade",
    group: "text",
    derive: inkMix(0.96),
  },
  brandDiscord: {
    label: "Discord link",
    css: "--brand-discord",
    group: "text",
    derive: {
      light: { fixed: oklch(0.5774, 0.2091, 273.85) },
      dark: { ref: "ink" },
    },
  },
  sidebarAccentForeground: {
    label: "Sidebar hover text",
    css: "--sidebar-accent-foreground",
    group: "sidebar",
    derive: same({ ref: "sidebarForeground" }),
  },
  sidebarRing: {
    label: "Sidebar focus ring",
    css: "--sidebar-ring",
    group: "sidebar",
    derive: same({ ref: "primary" }),
  },
  // bb tints search matches with one fixed amber, mixed into Background.
  sidebarSearchMatch: {
    label: "Sidebar search match",
    css: "--sidebar-search-match",
    group: "sidebar",
    derive: {
      light: {
        mix: "oklab",
        top: SEARCH_MATCH_AMBER,
        share: 0.24,
        base: "canvas",
      },
      dark: {
        mix: "oklab",
        top: SEARCH_MATCH_AMBER,
        share: 0.2,
        base: "canvas",
      },
    },
  },
  attentionForeground: {
    label: "Text on attention",
    css: "--attention-foreground",
    group: "status",
    derive: { light: { ref: "ink" }, dark: { ref: "canvas" } },
  },
  successForeground: {
    label: "Success text",
    css: "--success-foreground",
    group: "status",
    derive: {
      light: { fixed: oklch(0.53, 0.14, 155) },
      dark: { ref: "success" },
    },
  },
  surfaceAttention: {
    label: "Attention wash",
    css: "--surface-attention",
    group: "status",
    derive: alphaOf("attention", 0.14, 0.12),
  },
  surfaceDestructive: {
    label: "Destructive wash",
    css: "--surface-destructive",
    group: "status",
    derive: alphaOf("destructive", 0.06, 0.08),
  },
  surfaceDestructiveBorder: {
    label: "Destructive border",
    css: "--surface-destructive-border",
    group: "status",
    derive: alphaOf("destructive", 0.25, 0.3),
  },
  border: {
    label: "Border",
    css: "--border",
    group: "lines",
    derive: inkMix(0.14, 0.194),
  },
  borderHairline: {
    label: "Hairline",
    css: "--border-hairline",
    group: "lines",
    derive: inkMix(0.147, 0.21),
  },
  borderSeam: {
    label: "Seam",
    css: "--border-seam",
    group: "lines",
    derive: inkMix(0.095, 0.11),
  },
  borderSeamVertical: {
    label: "Vertical seam",
    css: "--border-seam-vertical",
    group: "lines",
    derive: same({ ref: "borderSeam" }),
  },
  input: {
    label: "Input border",
    css: "--input",
    group: "lines",
    derive: inkMix(0.295, 0.326),
  },
  pillSurfaceBorder: {
    label: "Pill border",
    css: "--pill-surface-border",
    group: "lines",
    derive: same({ ref: "border" }),
  },
  pillSurfaceSelectedBorder: {
    label: "Selected pill border",
    css: "--pill-surface-selected-border",
    group: "lines",
    derive: inkMix(0.192, 0.252),
  },
  stateHover: {
    label: "Hover",
    css: "--state-hover",
    group: "states",
    derive: alphaOf("ink", 0.059, 0.138),
  },
  stateActive: {
    label: "Pressed and open row",
    css: "--state-active",
    group: "states",
    derive: alphaOf("ink", 0.118, 0.225),
  },
  surfaceSelected: {
    label: "Selection",
    css: "--surface-selected",
    group: "states",
    derive: alphaOf("primary", 0.16, 0.12),
  },
  surfaceSelectedBorder: {
    label: "Selection border",
    css: "--surface-selected-border",
    group: "states",
    derive: alphaOf("primary", 0.35),
  },
  ring: {
    label: "Focus ring",
    css: "--ring",
    group: "states",
    derive: same({ ref: "primary" }),
  },
  timelineAccent: {
    label: "Timeline accent",
    css: "--timeline-accent",
    group: "states",
    derive: fixed(oklch(0.55, 0.1, 250), oklch(0.72, 0.09, 250)),
  },
  ansi0: {
    label: "Black",
    css: "--ansi-0",
    group: "terminal",
    derive: ansi("#000000", "#858585"),
  },
  ansi1: {
    label: "Red",
    css: "--ansi-1",
    group: "terminal",
    derive: ansi("#a11616", "#d85e5e"),
  },
  ansi2: {
    label: "Green",
    css: "--ansi-2",
    group: "terminal",
    derive: ansi("#13704a", "#0dbc79"),
  },
  ansi3: {
    label: "Yellow",
    css: "--ansi-3",
    group: "terminal",
    derive: ansi("#7f6a00", "#e5e510"),
  },
  ansi4: {
    label: "Blue",
    css: "--ansi-4",
    group: "terminal",
    derive: ansi("#1f5ca6", "#3c88dc"),
  },
  ansi5: {
    label: "Magenta",
    css: "--ansi-5",
    group: "terminal",
    derive: ansi("#8a2f8a", "#c85ac8"),
  },
  ansi6: {
    label: "Cyan",
    css: "--ansi-6",
    group: "terminal",
    derive: ansi("#0b6f88", "#11a8cd"),
  },
  ansi7: {
    label: "White",
    css: "--ansi-7",
    group: "terminal",
    derive: ansi("#3d3d3d", "#e5e5e5"),
  },
  ansi8: {
    label: "Bright black",
    css: "--ansi-8",
    group: "terminal",
    derive: ansi("#3a3a3a", "#9a9a9a"),
  },
  ansi9: {
    label: "Bright red",
    css: "--ansi-9",
    group: "terminal",
    derive: ansi("#d32f2f", "#ff6f6f"),
  },
  ansi10: {
    label: "Bright green",
    css: "--ansi-10",
    group: "terminal",
    derive: ansi("#197c52", "#23d18b"),
  },
  ansi11: {
    label: "Bright yellow",
    css: "--ansi-11",
    group: "terminal",
    derive: ansi("#a35f00", "#f5f543"),
  },
  ansi12: {
    label: "Bright blue",
    css: "--ansi-12",
    group: "terminal",
    derive: ansi("#2666b0", "#5aaaf2"),
  },
  ansi13: {
    label: "Bright magenta",
    css: "--ansi-13",
    group: "terminal",
    derive: ansi("#9b349b", "#d670d6"),
  },
  ansi14: {
    label: "Bright cyan",
    css: "--ansi-14",
    group: "terminal",
    derive: ansi("#0f7798", "#29b8db"),
  },
  ansi15: {
    label: "Bright white",
    css: "--ansi-15",
    group: "terminal",
    derive: ansi("#1f1f1f", "#ffffff"),
  },
} as const satisfies Record<
  string,
  { label: string; css: string; group: ExtraGroup; derive: ByMode }
>;
export type ExtraKey = keyof typeof EXTRA_DEFINITIONS;
// Fails to compile when ExtraRef names a token the table no longer has.
const EXTRA_REFS_EXIST: Record<ExtraRef, ExtraKey> = {
  border: "border",
  borderSeam: "borderSeam",
};
void EXTRA_REFS_EXIST;
export const EXTRA_KEYS = Object.keys(EXTRA_DEFINITIONS) as ExtraKey[];
/** One mode's overrides; a missing key means "let bb derive it". */
export type ExtraTokens = Partial<Record<ExtraKey, string>>;
export type ThemeExtras = Record<Mode, ExtraTokens>;

/** Extra tokens of one group in display order, shared by the Edit tab rows and its search. */
export const extrasInGroup = (group: ExtraGroup): ExtraKey[] =>
  EXTRA_KEYS.filter((key) => EXTRA_DEFINITIONS[key].group === group);

const isCore = (key: Ref, palette: PaletteTokens): key is TokenKey =>
  Object.hasOwn(palette, key);

/** Raised when the token table makes a token follow itself, which would otherwise overflow the stack with no hint. */
export class ExtraCycleError extends Error {
  constructor(key: string, mode: Mode) {
    super(`Extra token ${key} follows itself in ${mode} mode`);
    this.name = "ExtraCycleError";
  }
}

/**
 * The palette with each color that is not `#rrggbb` (a hex field mid-typing,
 * or cleared) replaced by Neutral's, so the color math never throws during
 * render and the rows keep showing real colors until the field is valid.
 */
function completePalette(palette: PaletteTokens, mode: Mode): PaletteTokens {
  const complete = { ...palette };
  // Walk the full key list, not the input's own keys, so a missing color is filled too.
  for (const key of TOKEN_KEYS)
    if (!COLOR_PATTERN.test(complete[key] ?? ""))
      complete[key] = NEUTRAL_PRESET[mode][key];
  return complete;
}

/**
 * The color bb paints for every extra token in one mode: the override when
 * the user set one, else bb's own default computed from the palette (and from
 * other extras, so overriding Border also moves Pill border).
 */
export function resolveExtras(
  input: PaletteTokens,
  overrides: ExtraTokens,
  mode: Mode,
): Record<ExtraKey, string> {
  const palette = completePalette(input, mode);
  const resolved: Partial<Record<ExtraKey, string>> = {};
  const resolving = new Set<ExtraKey>();
  const value = (key: Ref): string =>
    isCore(key, palette) ? palette[key] : resolveOne(key);
  const fixedHex = (color: Fixed) =>
    "hex" in color ? color.hex : oklchToHex(color.oklch);
  const source = (from: Source) =>
    typeof from === "string" ? opaquePart(value(from)) : fixedHex(from);
  function resolveOne(key: ExtraKey): string {
    const known = resolved[key];
    if (known !== undefined) return known;
    if (resolving.has(key)) throw new ExtraCycleError(key, mode);
    resolving.add(key);
    const override = overrides[key];
    const rule: Derivation = EXTRA_DEFINITIONS[key].derive[mode];
    let color: string;
    if (override !== undefined && ALPHA_COLOR_PATTERN.test(override))
      color = override;
    else if ("ref" in rule) color = value(rule.ref);
    else if ("fixed" in rule) color = fixedHex(rule.fixed);
    else if ("alpha" in rule) color = withAlpha(value(rule.alpha), rule.share);
    else {
      const top = source(rule.top);
      const base = opaquePart(value(rule.base));
      color =
        rule.mix === "oklch"
          ? mixOklch(top, base, rule.share)
          : mixOklab(top, base, rule.share);
    }
    resolved[key] = color;
    return color;
  }
  for (const key of EXTRA_KEYS) resolveOne(key);
  return resolved as Record<ExtraKey, string>;
}

/** Overrides of one mode, empty for drafts saved before extras existed. */
export const extrasOf = (
  extras: ThemeExtras | undefined,
  mode: Mode,
): ExtraTokens => extras?.[mode] ?? {};

/**
 * Sets or clears one override and drops the whole field when nothing is left,
 * so a draft with no overrides compares equal to one saved before they existed.
 */
export function withExtra(
  extras: ThemeExtras | undefined,
  mode: Mode,
  key: ExtraKey,
  value: string | undefined,
): ThemeExtras | undefined {
  const next: ThemeExtras = {
    light: { ...extrasOf(extras, "light") },
    dark: { ...extrasOf(extras, "dark") },
  };
  if (value === undefined) delete next[mode][key];
  else next[mode][key] = value;
  const count = Object.keys(next.light).length + Object.keys(next.dark).length;
  return count === 0 ? undefined : next;
}

/**
 * Sidebar hover text the writers add on their own: bb's default follows Text,
 * while the builder lets the sidebar have its own text color, so the hover
 * row must follow Sidebar text instead. Undefined once the user overrides it.
 */
export function autoHoverText(
  palette: PaletteTokens,
  overrides: ExtraTokens,
): string | undefined {
  return overrides.sidebarAccentForeground === undefined
    ? palette.sidebarForeground
    : undefined;
}

/** True when a parsed Sidebar hover text is just the writers' own automatic line, which must stay automatic. */
export const isAutoHoverText = (palette: PaletteTokens, value: string) =>
  value === palette.sidebarForeground;

const CORE_GROUPS = new Set<string>(TOKEN_GROUPS);
const isCoreGroup = (group: string): group is TokenGroup =>
  CORE_GROUPS.has(group);
/** Search matches the label a user reads or the `--token` name a theme file uses; `query` is already lowercase. */
const matches = (query: string, token: { label: string; css: string }) =>
  query === "" ||
  token.label.toLowerCase().includes(query) ||
  token.css.includes(query);

/** Edit tab groups with the rows that match a search, in display order; groups with no match are left out. */
export function visibleGroups(query: string) {
  return EDIT_GROUPS.map((group) => ({
    group,
    core: isCoreGroup(group)
      ? tokensInGroup(group).filter((key) =>
          matches(query, TOKEN_DEFINITIONS[key]),
        )
      : [],
    extras: extrasInGroup(group).filter((key) =>
      matches(query, EXTRA_DEFINITIONS[key]),
    ),
  })).filter(({ core, extras }) => core.length + extras.length > 0);
}
