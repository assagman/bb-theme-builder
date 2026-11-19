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
import { generateCss } from "../src/theme/css.ts";
import { draftSchema } from "../src/theme/schema.ts";
import { Browser } from "./browser.ts";

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
const NAME_SELECTOR = ".tb-edit-column fieldset input";
const PRESET_SELECTOR = ".tb-edit-column select";
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
  await light.click("Refresh appearance");
  await light.status(`Current palette: ${DEFAULT_THEME}`);
  await light.wait("!document.documentElement.classList.contains('dark')");
  await dark.wait("document.documentElement.classList.contains('dark')");
  const before = appearance();
  const hostBefore = await light.evaluate(HOST_CANVAS);
  const networkStart = browser.events.length;
  await light.fill(NAME_SELECTOR, NAME);
  await light.fill('.tb-token input[type="color"]', LIGHT);
  await light.wait(
    `document.querySelector('#light-canvas').value === ${JSON.stringify(LIGHT)}`,
  );
  await light.fill("#light-primary", "#fff");
  await light.wait(
    "Array.from(document.querySelectorAll('.tb-shell button')).find(button => button.textContent === 'Apply').matches(':disabled')",
  );
  await light.fill("#light-primary", ACCENT);
  for (const [index, choice] of FONT_CHOICES.entries()) {
    await light.evaluate(
      `(() => { const select = document.querySelectorAll('section[aria-label="Typography"] select')[${index}]; select.value = ${JSON.stringify(choice)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
  }
  await light.click("Dark");
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
  await light.click("Save");
  await light.status("Preset saved.");
  const id = await light.evaluate<string>(
    `document.querySelector(${JSON.stringify(PRESET_SELECTOR)}).value`,
  );
  evidence.presetId = id;
  await light.reload();
  await light.selectPreset(id);
  await light.wait(
    `document.querySelector('#light-canvas').value === ${JSON.stringify(LIGHT)}`,
  );
  await light.click("Dark");
  assert.equal(
    await light.evaluate("document.querySelector('#dark-canvas').value"),
    DARK,
  );
  await dark.reload();
  await dark.selectPreset(id);
  await dark.fill(NAME_SELECTOR, `${NAME} second window`);
  await light.fill(NAME_SELECTOR, `${NAME} first window`);
  await light.click("Save");
  await light.status("Preset saved.");
  await dark.click("Save");
  await dark.status("This preset changed in another window.");
  assert.equal(
    await dark.evaluate(
      `document.querySelector(${JSON.stringify(NAME_SELECTOR)}).value`,
    ),
    `${NAME} second window`,
  );
  evidence.competingSave = "conflict preserves draft";
  console.log("Persistence and competing saves passed");
  await light.click("Apply");
  await light.status("Palette applied to all bb windows.");
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
  await light.click("Light");
  await dark.click("Dark");
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
  await light.click("Dark");
  await light.fill("#dark-canvas", "#202630");
  await light.click("Save");
  await light.status("Preset saved.");
  assert.deepEqual(appearance(), applied);
  await light.click("Restore previous theme");
  await light.status("Previous palette restored.");
  assert.equal(appearance().themeId, DEFAULT_THEME);
  await light.click("Apply");
  await light.status("Palette applied to all bb windows.");
  cli("theme", "set", EXTERNAL_THEME);
  await light.click("Restore previous theme");
  await light.status("Appearance changed.");
  assert.equal(appearance().themeId, EXTERNAL_THEME);
  evidence.restore = "restores previous; refuses subsequent external selection";
  await light.click("Refresh appearance");
  await light.status(`Current palette: ${EXTERNAL_THEME}`);
  await light.click("Apply");
  await light.status("Palette applied to all bb windows.");
  const retained = appearance();
  cli("plugin", "disable", "theme-builder");
  assert.deepEqual(appearance(), retained);
  cli("plugin", "enable", "theme-builder");
  await light.reload();
  await light.selectPreset(id);
  assert.deepEqual(appearance(), retained);
  await light.click("Restore previous theme");
  await light.status("Previous palette restored.");
  assert.equal(appearance().themeId, EXTERNAL_THEME);
  evidence.disableEnable =
    "preset and applied artifact retained; restore works";
  console.log("Apply, restore, external conflicts, and disable/enable passed");
  await browser.send("Browser.setDownloadBehavior", {
    behavior: "allow",
    downloadPath: CONFIG.artifacts,
    browserContextId: light.contextId,
    eventsEnabled: true,
  });
  await light.click("Export JSON");
  await light.click("Export CSS");
  await light.wait(
    "!document.querySelector('.tb-edit-column fieldset').disabled",
  );
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
  await light.fill(NAME_SELECTOR, `${NAME} unsaved`);
  await light.dialog(() => light.selectPreset("", id), false);
  assert.equal(
    await light.evaluate(
      `document.querySelector(${JSON.stringify(NAME_SELECTOR)}).value`,
    ),
    `${NAME} unsaved`,
  );
  await light.click("Duplicate");
  await light.click("Save");
  await light.status("Preset saved.");
  const duplicateId = await light.evaluate<string>(
    `document.querySelector(${JSON.stringify(PRESET_SELECTOR)}).value`,
  );
  assert.notEqual(duplicateId, id);
  await light.dialog(() => light.click("Delete"), true);
  await light.status("Preset deleted. Applied themes were retained.");
  await light.selectPreset(id);
  evidence.presetActions =
    "rename, duplicate, delete, and discard cancellation passed";
  await light.fill(NAME_SELECTOR, `${NAME} resize draft`);
  await light.evaluate("document.documentElement.style.zoom = '2'");
  await light.click("Dark");
  await light.click("Light");
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
  await light.send("Emulation.setDeviceMetricsOverride", {
    width: 600,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });
  assert.equal(
    await light.evaluate(
      "getComputedStyle(document.querySelector('.tb-view-tabs')).display",
    ),
    "flex",
  );
  await light.click("Preview");
  assert.equal(
    await light.evaluate(
      "getComputedStyle(document.querySelector('.tb-edit-column')).display",
    ),
    "none",
  );
  await light.click("Edit");
  assert.equal(
    await light.evaluate(
      `document.querySelector(${JSON.stringify(NAME_SELECTOR)}).value`,
    ),
    `${NAME} resize draft`,
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
  await light.evaluate(
    `document.querySelector(${JSON.stringify(NAME_SELECTOR)}).focus()`,
  );
  await light.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  await light.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Tab",
    code: "Tab",
    windowsVirtualKeyCode: 9,
  });
  assert.equal(
    await light.evaluate("document.activeElement.textContent"),
    "Light",
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
