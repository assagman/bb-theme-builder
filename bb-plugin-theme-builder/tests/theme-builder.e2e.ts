import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { setTimeout as delay } from "node:timers/promises";
import { COPY } from "../src/editor/copy.ts";
import { DRAFT_STORAGE_KEY } from "../src/editor/draft-storage.ts";
import { generateCss } from "../src/theme/css.ts";
import { NEUTRAL_PRESET } from "../src/theme/defaults.ts";
import { draftSchema, toDraft } from "../src/theme/schema.ts";
import { slugify } from "../src/themes/ids.ts";
import { THEME_MESSAGES } from "../src/themes/messages.ts";
import { EDITS_MARKER } from "../src/themes/theme-css.ts";
import { Browser, type Page } from "./browser.ts";

const CONFIG = {
  url: process.env.BB_THEME_TEST_URL,
  dataDir: process.env.BB_THEME_TEST_DATA_DIR,
  cdp: process.env.BB_THEME_TEST_CDP,
  daemonPort: process.env.BB_THEME_TEST_DAEMON_PORT,
  artifacts: process.env.BB_THEME_TEST_ARTIFACTS,
  cli: process.env.BB_CLI ?? "bb",
};
const ROUTE = "/plugins/theme-builder/builder";
const PLUGIN_ID = "theme-builder";
const RUN = Date.now();
// Save as new turns this name into the theme id; a second save of the same name proves the `-2` rule.
const NAME = `Journey ${RUN}`;
const ID = slugify(NAME);
const SECOND_ID = `${ID}-2`;
const LEGACY_NAME = `Legacy preset ${RUN}`;
const LEGACY_ID = slugify(LEGACY_NAME);
const HAND_ID = `hand-written-${RUN}`;
// The id shape the old Apply wrote; the dropdown must hide it while it is not in use.
const REVISION_ID = "theme-builder-0123456789ab-r1-abcdef012345";
const LIGHT = "#f2f4f6";
const DARK = "#151b25";
const ACCENT = "#3456ab";
const LEGACY_CANVAS = "#fff4e6";
// Distinct values so each step proves its own write, not a leftover.
const OVERWRITE_DARK = "#202630";
const CONFLICT_EDIT = "#eef0f3";
const REPAINT_LIGHT = "#e9edf2";
const OUTSIDE_LIGHT = "#c0ffee";
const FRESH_OUTSIDE_RULE = ".outside-edit { color: red; }\n";
// The page re-reads themes when it regains focus; the journey fires the same event instead of switching windows.
const REFOCUS = "window.dispatchEvent(new Event('focus'))";
const EXPORT_EDIT = "#e4e8ee";
const HAND_PRIMARY = "#2255cc";
const RESTORE_EDIT = "#e8ecf1";
const UNSAVED_EDIT = "#dde2e8";
const RESIZE_EDIT = "#d3d9e0";
const HOST_CANVAS =
  "getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()";
const NAME_INPUT = "#tb-name-input";
const ACTION_NAME = ".tb-action-name";
const THEME_SELECT = "#tb-theme-select";
const MORE_BUTTON = `button[aria-label="${COPY.moreActions}"]`;
// The page shows the server's appearance refusal verbatim, so its leading words are the only signal.
const EXTERNAL_CHANGE_MESSAGE = "Appearance changed";
const RPC_BASE = "/api/v1/plugins/theme-builder/rpc/";
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const DEFAULT_THEME = "default";
const EXTERNAL_THEME = "nord";
const FAVICON = "purple";
const TEMP_ROOTS = [tmpdir(), "/tmp", "/private/tmp"];
const DOWNLOAD_TIMEOUT_MS = 30000;
const DOWNLOAD_POLL_MS = 100;
const MIGRATION_FLAG = "presets-migrated-to-themes";
const LEGACY_REVISION = 3;
// Kept with its "url" so the public-import scan, which reads a quote right after the word as a module specifier, ignores it.
const CSS_IMPORT_RULE = "@import url";
// A hand-written theme in the shape real ones take: comments, one block for every mode, an import, and a rule that styles a part directly.
const HAND_CSS = `/* A theme written by hand, kept verbatim by every save. */
${CSS_IMPORT_RULE}("https://example.invalid/fonts.css");
:root,
.light,
.dark {
  color-scheme: light;
  --canvas: #faf7f0;
  --ink: #2b2620;
  --primary: #7a5520;
}
.dark {
  --canvas: #1d1a16;
}
:root .bb-code-highlight {
  --primary: #aa3300;
}
`;
const FIDELITY_TOKENS = [
  "--background",
  "--foreground",
  "--secondary",
  "--muted",
  "--border",
  "--border-hairline",
  "--border-seam",
  "--input",
  "--ring",
  "--surface-selected",
  "--surface-selected-border",
  "--surface-destructive",
  "--surface-destructive-border",
  "--surface-recessed",
  "--surface-raised",
  "--surface-scrim",
  "--state-hover",
  "--state-active",
  "--sidebar-accent",
  "--sidebar-border",
  "--success",
  "--warning-text",
  "--destructive-text",
  "--diff-added",
  "--diff-removed",
  "--font-sans",
  "--font-mono",
];
const TOKEN_VALUES = `Object.fromEntries(${JSON.stringify(FIDELITY_TOKENS)}.map(key => [key, getComputedStyle(document.documentElement).getPropertyValue(key).replace(/\\s+/g, '')]))`;
const FONT_CHOICES = ["humanist", "menlo"];

assert.ok(
  CONFIG.url &&
    CONFIG.cdp &&
    CONFIG.dataDir &&
    CONFIG.daemonPort &&
    CONFIG.artifacts,
  "Set all BB_THEME_TEST_* variables from README before running this destructive-to-test-data journey.",
);
const TEST_URL = CONFIG.url;
const DATA_DIR = CONFIG.dataDir;
const ARTIFACTS = CONFIG.artifacts;
assert.ok(LOCAL_HOSTS.includes(new URL(TEST_URL).hostname));
assert.ok(LOCAL_HOSTS.includes(new URL(CONFIG.cdp).hostname));
const canonicalTempRoots = TEMP_ROOTS.map((root) => realpathSync(root));
assert.ok(
  isAbsolute(CONFIG.dataDir) &&
    canonicalTempRoots.some((root) =>
      realpathSync(DATA_DIR).startsWith(`${root}/`),
    ),
  "The test data directory must be under the OS temporary directory.",
);
assert.ok(
  isAbsolute(CONFIG.artifacts) &&
    TEMP_ROOTS.some((root) => resolve(ARTIFACTS).startsWith(`${root}/`)),
);
// The journey seeds old presets straight into bb's database, so it must be the disposable one checked above.
const BB_DB = join(realpathSync(DATA_DIR), "bb.db");
const env = {
  ...process.env,
  BB_DATA_DIR: CONFIG.dataDir,
  BB_SERVER_URL: CONFIG.url,
  BB_HOST_DAEMON_PORT: CONFIG.daemonPort,
};
const cli = (...args: string[]) =>
  execFileSync(CONFIG.cli, args, { env, encoding: "utf8" });
const appearance = () =>
  JSON.parse(cli("theme", "show", "--json")) as {
    themeId: string;
    customCss: string | null;
    faviconColor: string;
  };
const THEME_DIR = realpathSync(cli("theme", "dir").trim());
assert.equal(
  THEME_DIR,
  realpathSync(join(CONFIG.dataDir, "theme")),
  "The actual server must use the disposable data directory.",
);
const themeFile = (id: string) => join(THEME_DIR, id, "theme.css");
const readTheme = (id: string) => readFileSync(themeFile(id), "utf8");
// The hash getThemeHistory reports for the file on disk, so the journey checks it names the file as it is now.
const fileHash = (id: string) =>
  createHash("sha256").update(readTheme(id), "utf8").digest("hex");
const writeTheme = (id: string, css: string) => {
  mkdirSync(join(THEME_DIR, id), { recursive: true });
  writeFileSync(themeFile(id), css);
};
/** Reads plugin state the page does not show, through the same RPC the page uses. */
async function rpc<T>(method: string, input: unknown = {}): Promise<T> {
  const response = await fetch(`${TEST_URL}${RPC_BASE}${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input),
  });
  const body = (await response.json()) as { ok: boolean; result: T };
  assert.ok(response.ok && body.ok, JSON.stringify(body));
  return body.result;
}
type ThemeList = { custom: { id: string; owned: boolean }[] };
type History = {
  canUndo: boolean;
  canRedo: boolean;
  undoSteps: number;
  redoSteps: number;
  hash: string | null;
};
const history = (id: string) => rpc<History>("getThemeHistory", { id });
// The migration runs on plugin start ahead of every theme request, so one list call waits for it.
const reloadPlugin = () => {
  cli("plugin", "reload", PLUGIN_ID);
  return rpc<ThemeList>("listThemes");
};
/** Runs one statement on the disposable bb database and always closes it. */
function onBbDb<T>(work: (db: DatabaseSync) => T): T {
  const db = new DatabaseSync(BB_DB);
  try {
    return work(db);
  } finally {
    db.close();
  }
}
const clearMigrationFlag = () =>
  onBbDb((db) =>
    db
      .prepare("DELETE FROM plugin_kv WHERE plugin_id = ? AND key = ?")
      .run(PLUGIN_ID, MIGRATION_FLAG),
  );
/**
 * Stores a preset the way older builds did and clears the one-time flag, so
 * the next plugin start runs the migration for it.
 */
function seedLegacyPreset() {
  const now = new Date().toISOString();
  const preset = {
    ...structuredClone(NEUTRAL_PRESET),
    name: LEGACY_NAME,
    id: randomUUID(),
    revision: LEGACY_REVISION,
    createdAt: now,
    updatedAt: now,
  };
  preset.light.canvas = LEGACY_CANVAS;
  onBbDb((db) =>
    db
      .prepare(
        "INSERT OR REPLACE INTO plugin_kv (plugin_id, key, value, updated_at) VALUES (?, ?, ?, ?)",
      )
      .run(PLUGIN_ID, `preset:${preset.id}`, JSON.stringify(preset), RUN),
  );
  clearMigrationFlag();
  return preset;
}
const legacyPresetKept = (presetId: string) =>
  onBbDb(
    (db) =>
      db
        .prepare("SELECT 1 FROM plugin_kv WHERE plugin_id = ? AND key = ?")
        .get(PLUGIN_ID, `preset:${presetId}`) !== undefined,
  );
const actionName = (page: Page) =>
  page.evaluate<string>(
    `document.querySelector(${JSON.stringify(ACTION_NAME)}).textContent`,
  );
const selectExpression = `document.querySelector(${JSON.stringify(THEME_SELECT)})`;
const optionValues = (page: Page) =>
  page.evaluate<string[]>(
    `Array.from(${selectExpression}.options).map(o => o.value)`,
  );
const shellText = (page: Page) =>
  page.evaluate<string>("document.querySelector('.tb-shell').innerText");
const buttonDisabled = (page: Page, label: string) =>
  page.evaluate<boolean>(
    `Array.from(document.querySelectorAll('.tb-shell button')).find(b => b.textContent === ${JSON.stringify(label)}).disabled`,
  );
// Opens More actions, reads one item's state, and closes the menu again so later clicks start from a closed menu.
async function menuItemDisabled(page: Page, label: string) {
  const more = `document.querySelector(${JSON.stringify(MORE_BUTTON)})`;
  await page.evaluate(`${more}.click()`);
  await page.wait("document.querySelector('[role=menu]') !== null");
  const disabled = await page.evaluate<boolean>(
    `Array.from(document.querySelectorAll('[role=menu] button')).find(b => b.textContent === ${JSON.stringify(label)}).disabled`,
  );
  await page.evaluate(`${more}.click()`);
  await page.wait("document.querySelector('[role=menu]') === null");
  return disabled;
}
async function saveAsNew(page: Page, name: string) {
  await page.click(COPY.saveAsNew);
  await page.fill(NAME_INPUT, name);
  await page.click(COPY.save);
  await page.status(COPY.saveSuccess);
}
const overwrite = (page: Page, id: string) =>
  page.click(`${COPY.overwrite} ${id}`);
const canvasIs = (page: Page, mode: "light" | "dark", value: string) =>
  page.wait(
    `document.querySelector('#${mode}-canvas').value === ${JSON.stringify(value)}`,
  );
async function screenshot(page: Page, file: string) {
  const { data } = await page.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(join(ARTIFACTS, file), Buffer.from(data, "base64"));
}
const browser = new Browser(CONFIG.cdp);
await browser.connect();
mkdirSync(CONFIG.artifacts, { recursive: true });
assert.ok(
  canonicalTempRoots.some((root) =>
    realpathSync(ARTIFACTS).startsWith(`${root}/`),
  ),
);
const initial = appearance();
const evidence: Record<string, unknown> = {
  url: CONFIG.url,
  startedAt: new Date().toISOString(),
};
cli("theme", "set", DEFAULT_THEME);
cli("theme", "favicon", "set", FAVICON);
// Seeded before the pages open, so the first load already lists the migrated theme and the hand-written one.
const legacy = seedLegacyPreset();
writeTheme(HAND_ID, HAND_CSS);
writeTheme(REVISION_ID, generateCss(NEUTRAL_PRESET));
const migrated = await reloadPlugin();
const light = await browser.page(CONFIG.url + ROUTE, "light");
const dark = await browser.page(CONFIG.url + ROUTE, "dark");

try {
  // One-time migration: the old preset is an owned bb theme with the CSS the old Apply wrote; the KV copy stays as a backup.
  assert.deepEqual(
    migrated.custom.filter((theme) => theme.id.startsWith(LEGACY_ID)),
    [{ id: LEGACY_ID, owned: true }],
  );
  assert.equal(readTheme(LEGACY_ID), generateCss(toDraft(legacy)));
  assert.equal(legacyPresetKept(legacy.id), true);
  assert.equal(appearance().themeId, DEFAULT_THEME);
  // With the flag gone again, the per-preset record still stops a second copy.
  clearMigrationFlag();
  const rerun = await reloadPlugin();
  assert.deepEqual(
    rerun.custom
      .filter((theme) => theme.id.startsWith(LEGACY_ID))
      .map((theme) => theme.id),
    [LEGACY_ID],
  );
  evidence.migration = {
    themeId: LEGACY_ID,
    cssMatchesGenerated: true,
    keptInKv: true,
    rerunAddsNothing: true,
  };
  console.log("Migration passed");
  await light.reload();
  await dark.reload();
  await light.wait("!document.documentElement.classList.contains('dark')");
  await dark.wait("document.documentElement.classList.contains('dark')");
  // The page opens on the theme in use; the dropdown groups every theme and hides old revision ids.
  await light.wait(
    `${selectExpression}?.value === ${JSON.stringify(DEFAULT_THEME)}`,
  );
  const options = await optionValues(light);
  for (const id of [DEFAULT_THEME, EXTERNAL_THEME, LEGACY_ID, HAND_ID])
    assert.ok(options.includes(id), `Dropdown lacks ${id}`);
  assert.ok(!options.includes(REVISION_ID), "Old revision ids stay hidden");
  const groups = await light.evaluate<string[]>(
    `Array.from(${selectExpression}.querySelectorAll('optgroup')).map(g => g.label)`,
  );
  assert.deepEqual(groups.slice(0, 2), [
    COPY.themeGroups.builtin,
    COPY.themeGroups.custom,
  ]);
  assert.ok(
    (
      await light.evaluate<string>(
        `${selectExpression}.selectedOptions[0].textContent`,
      )
    ).endsWith(COPY.activeSuffix),
  );
  evidence.dropdown = { options: options.length, groups, revisionHidden: true };
  // A built-in theme exposes no CSS: its copy starts from Neutral, says so, and cannot be overwritten or stepped.
  await light.selectTheme(EXTERNAL_THEME);
  await light.status(COPY.builtInNote);
  await light.status(COPY.historyUnavailable);
  assert.equal(await buttonDisabled(light, COPY.undo), true);
  // Overwrite also appears in hint text, so the check looks for the button itself.
  assert.equal(
    await light.evaluate(
      `Array.from(document.querySelectorAll('.tb-shell button')).some(b => b.textContent.startsWith(${JSON.stringify(COPY.overwrite)}))`,
    ),
    false,
  );
  await light.tab(COPY.tabLabels.edit);
  await dark.tab(COPY.tabLabels.edit);
  const before = appearance();
  const hostBefore = await light.evaluate(HOST_CANVAS);
  const networkStart = browser.events.length;
  await light.fill("#light-canvas", LIGHT);
  await canvasIs(light, "light", LIGHT);
  await light.fill("#light-primary", "#fff");
  await light.wait(
    `Array.from(document.querySelectorAll('.tb-shell button')).find(button => button.textContent === ${JSON.stringify(COPY.saveAsNew)}).matches(':disabled')`,
  );
  await light.fill("#light-primary", ACCENT);
  for (const [index, choice] of FONT_CHOICES.entries()) {
    await light.evaluate(
      `(() => { const select = document.querySelectorAll('section[aria-label="Typography"] select')[${index}]; select.value = ${JSON.stringify(choice)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
  }
  await light.click(COPY.dark);
  await light.fill("#dark-canvas", DARK);
  await light.wait(
    `document.querySelector('iframe').srcdoc.includes(${JSON.stringify(DARK)})`,
  );
  assert.equal(await light.evaluate(HOST_CANVAS), hostBefore);
  assert.deepEqual(appearance(), before);
  assert.equal(
    await light.evaluate(
      "document.querySelector('iframe').getAttribute('sandbox')",
    ),
    "",
  );
  assert.equal(
    await light.evaluate("document.querySelector('iframe').contentDocument"),
    null,
  );
  const resources = browser.events
    .slice(networkStart)
    .filter(
      (event) =>
        event.method === "Network.requestWillBeSent" &&
        event.sessionId === light.sessionId,
    )
    .map((event) => (event.params?.request as { url: string }).url);
  assert.ok(
    resources.every(
      (url) =>
        !/^https?:/.test(url) ||
        new URL(url).origin === new URL(TEST_URL).origin,
    ),
    JSON.stringify(resources),
  );
  evidence.preview = {
    opaque: true,
    parentUnchanged: true,
    editRequests: resources,
  };
  console.log("Dropdown and preview isolation passed");
  // Save as new: the id comes from the name, and the working copy now belongs to the new theme.
  await saveAsNew(light, NAME);
  assert.equal(await actionName(light), ID);
  await light.wait(`${selectExpression}.value === ${JSON.stringify(ID)}`);
  const created = readTheme(ID);
  assert.ok(created.includes(LIGHT) && created.includes(DARK));
  assert.ok(!created.includes(EDITS_MARKER));
  assert.deepEqual(await history(ID), {
    canUndo: false,
    canRedo: false,
    undoSteps: 0,
    redoSteps: 0,
    hash: fileHash(ID),
  });
  await light.status(COPY.historyEmpty);
  // The same name again takes the next free id.
  await saveAsNew(light, NAME);
  assert.equal(await actionName(light), SECOND_ID);
  assert.equal(readTheme(SECOND_ID), created);
  evidence.saveAsNew = { id: ID, collision: SECOND_ID };
  // A theme with one saved version changed outside the builder: the page says so, Undo goes back to the save, Redo returns the outside change.
  appendFileSync(themeFile(SECOND_ID), FRESH_OUTSIDE_RULE);
  const freshOutside = readTheme(SECOND_ID);
  assert.deepEqual(await history(SECOND_ID), {
    canUndo: true,
    canRedo: false,
    undoSteps: 1,
    redoSteps: 0,
    hash: fileHash(SECOND_ID),
  });
  await light.evaluate(REFOCUS);
  await light.status(COPY.changedOutside);
  await light.click(COPY.undo);
  await light.status(COPY.undone);
  assert.equal(readTheme(SECOND_ID), created);
  assert.ok(!(await shellText(light)).includes(COPY.changedOutside));
  await light.click(COPY.redo);
  await light.status(COPY.redone);
  assert.equal(readTheme(SECOND_ID), freshOutside);
  evidence.outsideChange =
    "fresh theme edited on disk: notice shown, undo enabled, undo/redo round-trip";
  await light.reload();
  await light.tab(COPY.tabLabels.edit);
  await light.selectTheme(ID);
  await canvasIs(light, "light", LIGHT);
  await light.click(COPY.dark);
  await canvasIs(light, "dark", DARK);
  // An unsaved edit must survive a reload and be announced, with a way to drop it.
  await light.click(COPY.light);
  await light.fill("#light-canvas", RESTORE_EDIT);
  await light.wait(
    `JSON.parse(localStorage.getItem(${JSON.stringify(DRAFT_STORAGE_KEY)}) ?? 'null')?.draft.light.canvas === ${JSON.stringify(RESTORE_EDIT)}`,
  );
  await light.reload();
  await light.status(`${COPY.restored} ${ID}`);
  await light.tab(COPY.tabLabels.edit);
  await canvasIs(light, "light", RESTORE_EDIT);
  await light.status(COPY.dirty);
  await light.dialog(() => light.click(COPY.discardAction), true);
  await canvasIs(light, "light", LIGHT);
  await light.status(COPY.saved);
  evidence.restoredNotice =
    "unsaved edit restored after reload, then discarded";
  // Overwrite from one window; the other still holds the old file's hash, so its overwrite is refused and its draft kept.
  await dark.reload();
  await dark.tab(COPY.tabLabels.edit);
  await dark.selectTheme(ID);
  await light.click(COPY.dark);
  await light.fill("#dark-canvas", OVERWRITE_DARK);
  await overwrite(light, ID);
  await light.status(COPY.saveSuccess);
  const overwritten = readTheme(ID);
  assert.ok(overwritten.startsWith(created.trimEnd()));
  assert.equal(overwritten.split(EDITS_MARKER).length, 2);
  assert.ok(overwritten.includes(`--canvas: ${OVERWRITE_DARK};`));
  assert.deepEqual(await history(ID), {
    canUndo: true,
    canRedo: false,
    undoSteps: 1,
    redoSteps: 0,
    hash: fileHash(ID),
  });
  await dark.fill("#light-canvas", CONFLICT_EDIT);
  await overwrite(dark, ID);
  await dark.status(THEME_MESSAGES.conflict);
  await dark.status(COPY.dirty);
  assert.equal(readTheme(ID), overwritten);
  evidence.overwrite = "copy CSS kept, one edits block, stale hash refused";
  console.log("Save as new, overwrite, and conflict passed");
  // The refused window drops its edits and opens the file as it is now.
  await dark.dialog(() => dark.click(COPY.discardAction), true);
  await dark.selectTheme(ID);
  await dark.click(COPY.dark);
  await canvasIs(dark, "dark", OVERWRITE_DARK);
  await light.click(COPY.useTheme);
  await light.status(COPY.useSuccess);
  // BB defers hidden-window appearance sync; foreground each window before checking its rendered palette.
  await light.send("Page.bringToFront");
  await light.wait(`${HOST_CANVAS} === ${JSON.stringify(LIGHT)}`);
  await dark.send("Page.bringToFront");
  await dark.wait(`${HOST_CANVAS} === ${JSON.stringify(OVERWRITE_DARK)}`);
  const used = appearance();
  assert.equal(used.themeId, ID);
  assert.equal(used.faviconColor, FAVICON);
  await light.click(COPY.light);
  for (const page of [light, dark])
    assert.deepEqual(
      await page.previewEvaluate(TOKEN_VALUES),
      await page.evaluate(TOKEN_VALUES),
    );
  evidence.previewFidelity = `${FIDELITY_TOKENS.length} rendered host/iframe tokens match in both modes for a saved copy with an edits block`;
  await screenshot(light, "desktop.png");
  // Overwriting the theme in use repaints bb at once and keeps Restore.
  await light.send("Page.bringToFront");
  await light.fill("#light-canvas", REPAINT_LIGHT);
  await overwrite(light, ID);
  await light.status(COPY.saveSuccess);
  assert.ok(!(await shellText(light)).includes(COPY.repaintUnconfirmed));
  await light.wait(`${HOST_CANVAS} === ${JSON.stringify(REPAINT_LIGHT)}`);
  const afterRepaint = await rpc<{
    themeId: string;
    restoreAvailable: boolean;
  }>("getAppearance");
  assert.equal(afterRepaint.themeId, ID);
  assert.equal(afterRepaint.restoreAvailable, true);
  evidence.repaint = "overwrite of the active theme repainted; restore kept";
  // Undo writes the earlier version back and repaints; Redo returns.
  await light.click(COPY.undo);
  await light.status(COPY.undone);
  await light.wait(`${HOST_CANVAS} === ${JSON.stringify(LIGHT)}`);
  await canvasIs(light, "light", LIGHT);
  assert.equal(readTheme(ID), overwritten);
  await light.click(COPY.redo);
  await light.status(COPY.redone);
  await light.wait(`${HOST_CANVAS} === ${JSON.stringify(REPAINT_LIGHT)}`);
  const repainted = readTheme(ID);
  // An edit made outside the builder becomes a version before the undo, so Redo can bring it back.
  appendFileSync(
    themeFile(ID),
    `:root, .light {\n  --canvas: ${OUTSIDE_LIGHT};\n}\n`,
  );
  const outside = readTheme(ID);
  await light.click(COPY.undo);
  await light.status(COPY.undone);
  assert.equal(readTheme(ID), repainted);
  await light.click(COPY.redo);
  await light.status(COPY.redone);
  assert.equal(readTheme(ID), outside);
  await canvasIs(light, "light", OUTSIDE_LIGHT);
  assert.equal((await history(ID)).canRedo, false);
  evidence.undoRedo =
    "undo/redo rewrite the file and repaint; an outside edit is kept as a version";
  console.log("Use theme, repaint, and undo/redo passed");
  await light.menu(COPY.moreActions, COPY.restore);
  await light.status(COPY.restoreSuccess);
  assert.equal(appearance().themeId, DEFAULT_THEME);
  await light.click(COPY.useTheme);
  await light.status(COPY.useSuccess);
  cli("theme", "set", EXTERNAL_THEME);
  await light.menu(COPY.moreActions, COPY.restore);
  await light.status(EXTERNAL_CHANGE_MESSAGE);
  assert.equal(appearance().themeId, EXTERNAL_THEME);
  evidence.restore = "restores previous; refuses subsequent external selection";
  // A refused restore refreshes the observed appearance, so Use theme can proceed without a manual refresh.
  await light.click(COPY.useTheme);
  await light.status(COPY.useSuccess);
  const retained = appearance();
  cli("plugin", "disable", PLUGIN_ID);
  assert.deepEqual(appearance(), retained);
  cli("plugin", "enable", PLUGIN_ID);
  await light.reload();
  await light.tab(COPY.tabLabels.edit);
  await light.selectTheme(ID);
  assert.deepEqual(appearance(), retained);
  await light.menu(COPY.moreActions, COPY.restore);
  await light.status(COPY.restoreSuccess);
  assert.equal(appearance().themeId, EXTERNAL_THEME);
  evidence.disableEnable = "theme retained; restore works after re-enable";
  console.log("Restore, external conflicts, and disable/enable passed");
  // Export CSS is exactly what Overwrite then writes.
  await browser.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: CONFIG.artifacts,
    browserContextId: light.contextId,
    eventsEnabled: true,
  });
  await light.click(COPY.light);
  await light.fill("#light-canvas", EXPORT_EDIT);
  await light.menu(COPY.moreActions, COPY.exportJson);
  await light.menu(COPY.moreActions, COPY.exportCss);
  const jsonFile = `${ID}.json`;
  const cssFile = `${ID}.css`;
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  while (
    Date.now() < deadline &&
    !(
      existsSync(join(CONFIG.artifacts, jsonFile)) &&
      existsSync(join(CONFIG.artifacts, cssFile))
    )
  )
    await delay(DOWNLOAD_POLL_MS);
  const downloads = readdirSync(CONFIG.artifacts);
  assert.ok(
    downloads.includes(jsonFile) && downloads.includes(cssFile),
    "Both downloads must complete",
  );
  const exported = draftSchema.parse(
    JSON.parse(readFileSync(join(CONFIG.artifacts, jsonFile), "utf8")),
  );
  assert.equal(exported.uiFont, FONT_CHOICES[0]);
  assert.equal(exported.codeFont, FONT_CHOICES[1]);
  assert.equal(exported.light.canvas, EXPORT_EDIT);
  await overwrite(light, ID);
  await light.status(COPY.saveSuccess);
  assert.equal(
    readFileSync(join(CONFIG.artifacts, cssFile), "utf8"),
    readTheme(ID),
  );
  evidence.exports = { jsonFile, cssFile, matchesSavedFile: true };
  // A hand-written theme keeps its CSS verbatim, warns about directly styled parts, and cannot be deleted here.
  await light.selectTheme(HAND_ID);
  await light.status(COPY.scopedNote);
  assert.equal(
    await light.evaluate(
      `document.querySelector('iframe').srcdoc.includes(${JSON.stringify(CSS_IMPORT_RULE)})`,
    ),
    false,
  );
  assert.equal(await menuItemDisabled(light, COPY.remove), true);
  await light.fill("#light-primary", HAND_PRIMARY);
  await overwrite(light, HAND_ID);
  await light.status(COPY.saveSuccess);
  const hand = readTheme(HAND_ID);
  assert.ok(hand.startsWith(HAND_CSS.trimEnd()));
  assert.equal(hand.split(EDITS_MARKER).length, 2);
  assert.ok(hand.includes(`--primary: ${HAND_PRIMARY};`));
  // A light-only edit must leave the theme's own dark values alone.
  assert.ok(!hand.slice(hand.indexOf(EDITS_MARKER)).includes("\n.dark {"));
  evidence.handWritten = "verbatim CSS, scoped note, not deletable";
  // Declining the discard prompt must keep the unsaved edit and the open theme.
  await light.fill("#light-canvas", UNSAVED_EDIT);
  await light.dialog(() => light.selectTheme(DEFAULT_THEME, HAND_ID), false);
  await canvasIs(light, "light", UNSAVED_EDIT);
  // Delete removes an owned theme that is not in use: one file and its folder.
  await light.dialog(() => light.selectTheme(SECOND_ID), true);
  assert.equal(await menuItemDisabled(light, COPY.remove), false);
  await light.dialog(() => light.menu(COPY.moreActions, COPY.remove), true);
  await light.status(COPY.deleted);
  assert.equal(existsSync(join(THEME_DIR, SECOND_ID)), false);
  await light.wait(
    `!Array.from(${selectExpression}.options).some(o => o.value === ${JSON.stringify(SECOND_ID)})`,
  );
  evidence.themeActions = "delete of an owned theme and discard cancellation";
  console.log("Exports, hand-written theme, and delete passed");
  await light.selectTheme(ID);
  await light.evaluate("document.documentElement.style.zoom = '2'");
  await light.click(COPY.dark);
  await light.click(COPY.light);
  assert.equal(
    await light.evaluate(
      "document.querySelector('.tb-shell').scrollWidth <= document.querySelector('.tb-shell').clientWidth",
    ),
    true,
  );
  await screenshot(light, "zoom.png");
  await light.evaluate("document.documentElement.style.zoom = ''");
  evidence.zoom =
    "200% browser CSS zoom: controls usable, no horizontal overflow";
  await light.fill("#light-canvas", RESIZE_EDIT);
  await light.send("Emulation.setDeviceMetricsOverride", {
    width: 600,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });
  // The stacked layout must keep the unsaved edit and the three tabs.
  assert.equal(
    await light.evaluate("document.querySelectorAll('[role=tab]').length"),
    Object.keys(COPY.tabLabels).length,
  );
  assert.equal(
    await light.evaluate("document.querySelector('#light-canvas').value"),
    RESIZE_EDIT,
    "Changing shell layout must preserve the draft",
  );
  assert.equal(
    await light.evaluate("document.documentElement.scrollWidth <= innerWidth"),
    true,
  );
  assert.equal(
    await light.evaluate(
      "document.querySelector('.tb-shell').scrollWidth <= document.querySelector('.tb-shell').clientWidth",
    ),
    true,
  );
  // Arrow keys move between tabs, as the tabs pattern promises.
  await light.evaluate(
    "document.querySelector('[role=tab][aria-selected=true]').focus()",
  );
  for (const type of ["keyDown", "keyUp"])
    await light.send("Input.dispatchKeyEvent", {
      type,
      key: "ArrowRight",
      code: "ArrowRight",
      windowsVirtualKeyCode: 39,
    });
  // Focus follows the key event after React commits the tab change, so it is awaited rather than read once.
  await light.wait(
    `document.activeElement?.textContent === ${JSON.stringify(COPY.tabLabels.randomize)}`,
  );
  await light.wait(
    "document.querySelector('[role=tab][aria-selected=true]') === document.activeElement",
  );
  await screenshot(light, "compact.png");
  evidence.compactKeyboard = "tabs, no overflow, keyboard focus checked";
  evidence.finishedAt = new Date().toISOString();
  writeFileSync(
    join(CONFIG.artifacts, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  cli("plugin", "enable", PLUGIN_ID);
  cli("theme", "set", initial.themeId);
  cli("theme", "favicon", "set", initial.faviconColor);
  await light.dispose();
  await dark.dispose();
  browser.close();
}
