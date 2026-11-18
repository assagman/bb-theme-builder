import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { COPY } from "../src/editor/copy.ts";
import { DRAFT_STORAGE_KEY } from "../src/editor/draft-storage.ts";
import { generateCss } from "../src/theme/css.ts";
import { draftSchema } from "../src/theme/schema.ts";
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
const NAME = `Journey ${Date.now()}`;
const LIGHT = "#f2f4f6";
const DARK = "#151b25";
const ACCENT = "#3456ab";
const HOST_CANVAS =
  "getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim()";
const FIRST_NAME = `${NAME} first window`;
const SECOND_NAME = `${NAME} second window`;
const NAME_INPUT = "#tb-name-input";
const ACTION_NAME = ".tb-action-name";
// The plugin has no COPY string or role for this refusal: the page shows the server message verbatim, so its leading words are the only signal.
const EXTERNAL_CHANGE_MESSAGE = "Appearance changed";
// Distinct from LIGHT so each edit step proves its own value, not a leftover.
const RESTORE_EDIT = "#e8ecf1";
const UNSAVED_EDIT = "#dde2e8";
const RESIZE_EDIT = "#d3d9e0";
const RPC_BASE = "/api/v1/plugins/theme-builder/rpc/";
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];
const DEFAULT_THEME = "default";
const EXTERNAL_THEME = "nord";
const FAVICON = "purple";
const TEMP_ROOTS = [tmpdir(), "/tmp", "/private/tmp"];
const DOWNLOAD_TIMEOUT_MS = 30000;
const DOWNLOAD_POLL_MS = 100;
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
assert.equal(
  realpathSync(cli("theme", "dir").trim()),
  realpathSync(join(CONFIG.dataDir, "theme")),
  "The actual server must use the disposable data directory.",
);
// Saved-theme ids are only known to the server, and exports are named after them.
const themeId = async (name: string) => {
  const response = await fetch(`${TEST_URL}${RPC_BASE}listPresets`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  });
  const body = (await response.json()) as {
    ok: boolean;
    result: { id: string; name: string }[];
  };
  assert.ok(response.ok && body.ok, JSON.stringify(body));
  const match = body.result.find((theme) => theme.name === name);
  assert.ok(match, `No saved theme named ${name}`);
  return match.id;
};
const actionName = (page: Page) =>
  page.evaluate<string>(
    `document.querySelector(${JSON.stringify(ACTION_NAME)}).textContent`,
  );
// Rename goes through the More menu's name form, the only place a name is typed now.
const renameTheme = async (page: Page, name: string) => {
  await page.menu(COPY.moreActions, COPY.rename);
  await page.fill(NAME_INPUT, name);
  await page.click(COPY.renameConfirm);
};
const browser = new Browser(CONFIG.cdp);
await browser.connect();
mkdirSync(CONFIG.artifacts, { recursive: true });
assert.ok(
  canonicalTempRoots.some((root) =>
    realpathSync(ARTIFACTS).startsWith(`${root}/`),
  ),
);
const initial = appearance();
const light = await browser.page(CONFIG.url + ROUTE, "light");
const dark = await browser.page(CONFIG.url + ROUTE, "dark");
const evidence: Record<string, unknown> = {
  url: CONFIG.url,
  startedAt: new Date().toISOString(),
};

try {
  cli("theme", "set", DEFAULT_THEME);
  cli("theme", "favicon", "set", FAVICON);
  // The page reads appearance on load, so reload instead of a manual refresh.
  await light.reload();
  await dark.reload();
  assert.equal(appearance().themeId, DEFAULT_THEME);
  await light.wait("!document.documentElement.classList.contains('dark')");
  await dark.wait("document.documentElement.classList.contains('dark')");
  await light.tab(COPY.tabLabels.edit);
  await dark.tab(COPY.tabLabels.edit);
  const before = appearance();
  const hostBefore = await light.evaluate(HOST_CANVAS);
  const networkStart = browser.events.length;
  await light.fill('.tb-token input[type="color"]', LIGHT);
  await light.wait(
    `document.querySelector('#light-canvas').value === ${JSON.stringify(LIGHT)}`,
  );
  await light.fill("#light-primary", "#fff");
  await light.wait(
    `Array.from(document.querySelectorAll('.tb-shell button')).find(button => button.textContent === ${JSON.stringify(COPY.apply)}).matches(':disabled')`,
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
  const editNetwork = browser.events
    .slice(networkStart)
    .filter(
      (event) =>
        event.method === "Network.requestWillBeSent" &&
        event.sessionId === light.sessionId,
    );
  const resources = editNetwork.map(
    (event) => (event.params?.request as { url: string }).url,
  );
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
  console.log("Preview isolation passed");
  // The edited Neutral theme is unsaved, so Save asks for a name first.
  await light.click(COPY.save);
  await light.fill(NAME_INPUT, NAME);
  await light.click(COPY.save);
  await light.status(COPY.saveSuccess);
  assert.equal(await actionName(light), NAME);
  evidence.themeName = NAME;
  await light.reload();
  await light.tab(COPY.tabLabels.edit);
  await light.selectTheme(NAME);
  await light.wait(
    `document.querySelector('#light-canvas').value === ${JSON.stringify(LIGHT)}`,
  );
  await light.click(COPY.dark);
  assert.equal(
    await light.evaluate("document.querySelector('#dark-canvas').value"),
    DARK,
  );
  // An unsaved edit must survive a reload and be announced, with a way to drop it.
  await light.click(COPY.light);
  await light.fill("#light-canvas", RESTORE_EDIT);
  await light.wait(
    `JSON.parse(localStorage.getItem(${JSON.stringify(DRAFT_STORAGE_KEY)}) ?? 'null')?.draft.light.canvas === ${JSON.stringify(RESTORE_EDIT)}`,
  );
  await light.reload();
  await light.status(`${COPY.restored} ${NAME}`);
  await light.tab(COPY.tabLabels.edit);
  await light.wait(
    `document.querySelector('#light-canvas').value === ${JSON.stringify(RESTORE_EDIT)}`,
  );
  await light.status(COPY.dirty);
  await light.dialog(() => light.click(COPY.discardAction), true);
  await light.wait(
    `document.querySelector('#light-canvas').value === ${JSON.stringify(LIGHT)}`,
  );
  await light.status(COPY.saved);
  evidence.restoredNotice =
    "unsaved edit restored after reload, then discarded";
  await dark.reload();
  await dark.tab(COPY.tabLabels.edit);
  await dark.selectTheme(NAME);
  await renameTheme(dark, SECOND_NAME);
  await renameTheme(light, FIRST_NAME);
  await light.click(COPY.save);
  await light.status(COPY.saveSuccess);
  await dark.click(COPY.save);
  await dark.status(COPY.conflict);
  assert.equal(await actionName(dark), SECOND_NAME);
  evidence.competingSave = "conflict preserves draft";
  console.log("Persistence and competing saves passed");
  await light.click(COPY.apply);
  await light.status(COPY.applySuccess);
  // BB defers hidden-window appearance sync; foreground each window before checking its rendered palette.
  await light.send("Page.bringToFront");
  await light.wait(`${HOST_CANVAS} === ${JSON.stringify(LIGHT)}`);
  await dark.send("Page.bringToFront");
  await dark.wait(`${HOST_CANVAS} === ${JSON.stringify(DARK)}`);
  const applied = appearance();
  assert.equal(applied.faviconColor, FAVICON);
  evidence.appliedThemeId = applied.themeId;
  assert.equal(
    await light.evaluate("document.documentElement.classList.contains('dark')"),
    false,
  );
  assert.equal(
    await dark.evaluate("document.documentElement.classList.contains('dark')"),
    true,
  );
  await light.click(COPY.light);
  await dark.click(COPY.dark);
  for (const page of [light, dark])
    assert.deepEqual(
      await page.previewEvaluate(TOKEN_VALUES),
      await page.evaluate(TOKEN_VALUES),
    );
  evidence.previewFidelity = `${FIDELITY_TOKENS.length} rendered host/iframe tokens match in both modes, including focus, fonts, statuses, and diffs`;
  const desktop = await light.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(
    join(CONFIG.artifacts, "desktop.png"),
    Buffer.from(desktop.data, "base64"),
  );
  await light.click(COPY.dark);
  await light.fill("#dark-canvas", "#202630");
  await light.click(COPY.save);
  await light.status(COPY.saveSuccess);
  assert.deepEqual(appearance(), applied);
  await light.menu(COPY.moreActions, COPY.restore);
  await light.status(COPY.restoreSuccess);
  assert.equal(appearance().themeId, DEFAULT_THEME);
  await light.click(COPY.apply);
  await light.status(COPY.applySuccess);
  cli("theme", "set", EXTERNAL_THEME);
  await light.menu(COPY.moreActions, COPY.restore);
  await light.status(EXTERNAL_CHANGE_MESSAGE);
  assert.equal(appearance().themeId, EXTERNAL_THEME);
  evidence.restore = "restores previous; refuses subsequent external selection";
  // A refused restore refreshes the observed appearance, so Apply can proceed without a manual refresh.
  await light.click(COPY.apply);
  await light.status(COPY.applySuccess);
  const retained = appearance();
  cli("plugin", "disable", "theme-builder");
  assert.deepEqual(appearance(), retained);
  cli("plugin", "enable", "theme-builder");
  await light.reload();
  await light.tab(COPY.tabLabels.edit);
  await light.selectTheme(FIRST_NAME);
  assert.deepEqual(appearance(), retained);
  await light.menu(COPY.moreActions, COPY.restore);
  await light.status(COPY.restoreSuccess);
  assert.equal(appearance().themeId, EXTERNAL_THEME);
  evidence.disableEnable = "theme and applied artifact retained; restore works";
  console.log("Apply, restore, external conflicts, and disable/enable passed");
  await browser.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: CONFIG.artifacts,
    browserContextId: light.contextId,
    eventsEnabled: true,
  });
  await light.menu(COPY.moreActions, COPY.exportJson);
  await light.menu(COPY.moreActions, COPY.exportCss);
  const id = await themeId(FIRST_NAME);
  const downloadPrefix = `theme-builder-${id.replaceAll("-", "").slice(0, 12)}`;
  const deadline = Date.now() + DOWNLOAD_TIMEOUT_MS;
  while (
    Date.now() < deadline &&
    readdirSync(CONFIG.artifacts).filter(
      (file) => file.startsWith(downloadPrefix) && /\.(json|css)$/.test(file),
    ).length < 2
  )
    await delay(DOWNLOAD_POLL_MS);
  const downloads = readdirSync(CONFIG.artifacts).filter((file) =>
    file.startsWith(downloadPrefix),
  );
  const jsonFile = downloads.find(
    (file) => file.endsWith(".json") && file.startsWith("theme-builder-"),
  );
  const cssFile = downloads.find(
    (file) => file.endsWith(".css") && file.startsWith("theme-builder-"),
  );
  assert.ok(jsonFile && cssFile, "Both downloads must complete");
  const exported = draftSchema.parse(
    JSON.parse(readFileSync(join(CONFIG.artifacts, jsonFile), "utf8")),
  );
  assert.equal(exported.uiFont, FONT_CHOICES[0]);
  assert.equal(exported.codeFont, FONT_CHOICES[1]);
  assert.equal(
    readFileSync(join(CONFIG.artifacts, cssFile), "utf8"),
    generateCss(exported),
  );
  evidence.exports = { jsonFile, cssFile, deterministicParity: true };
  // Declining the discard prompt must keep the unsaved edit and the open theme.
  // A background page drops confirm() dialogs at once, so the window must be foremost for the prompt checks.
  await light.send("Page.bringToFront");
  await light.tab(COPY.tabLabels.edit);
  await light.click(COPY.light);
  await light.fill("#light-canvas", UNSAVED_EDIT);
  await light.dialog(
    () => light.selectTheme(COPY.neutralBuiltIn, FIRST_NAME),
    false,
  );
  assert.equal(
    await light.evaluate("document.querySelector('#light-canvas').value"),
    UNSAVED_EDIT,
  );
  await light.menu(COPY.moreActions, COPY.duplicate);
  await light.click(COPY.save);
  await light.click(COPY.save);
  await light.status(COPY.saveSuccess);
  const duplicateId = await themeId(`${FIRST_NAME}${COPY.copySuffix}`);
  assert.notEqual(duplicateId, id);
  await light.dialog(() => light.menu(COPY.moreActions, COPY.remove), true);
  await light.status(COPY.deleted);
  await light.selectTheme(FIRST_NAME);
  evidence.themeActions =
    "rename, duplicate, delete, and discard cancellation passed";
  await light.evaluate("document.documentElement.style.zoom = '2'");
  await light.click(COPY.dark);
  await light.click(COPY.light);
  assert.equal(
    await light.evaluate(
      "document.querySelector('.tb-shell').scrollWidth <= document.querySelector('.tb-shell').clientWidth",
    ),
    true,
  );
  const zoom = await light.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(
    join(CONFIG.artifacts, "zoom.png"),
    Buffer.from(zoom.data, "base64"),
  );
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
  await light.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "ArrowRight",
    code: "ArrowRight",
    windowsVirtualKeyCode: 39,
  });
  await light.send("Input.dispatchKeyEvent", {
    type: "keyUp",
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
  const { data } = await light.send<{ data: string }>(
    "Page.captureScreenshot",
    { format: "png", captureBeyondViewport: false },
  );
  writeFileSync(
    join(CONFIG.artifacts, "compact.png"),
    Buffer.from(data, "base64"),
  );
  evidence.compactKeyboard = "tabs, no overflow, keyboard focus checked";
  evidence.finishedAt = new Date().toISOString();
  writeFileSync(
    join(CONFIG.artifacts, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} finally {
  cli("plugin", "enable", "theme-builder");
  cli("theme", "set", initial.themeId);
  cli("theme", "favicon", "set", initial.faviconColor);
  await light.dispose();
  await dark.dispose();
  browser.close();
}
