import assert from "node:assert/strict";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { Browser } from "./browser.ts";

const CONFIG = {
  url: process.env.BB_THEME_TEST_URL,
  cdp: process.env.BB_THEME_TEST_CDP,
  dataDir: process.env.BB_THEME_TEST_DATA_DIR,
  artifacts: process.env.BB_THEME_TEST_ARTIFACTS,
};
const ROUTE = "/plugins/theme-builder/builder";
const ACCENT = "#A34BC5";
const DEADLINE_MS = 210000;
const POLL_MS = 1000;
const PREVIEW_TIMEOUT_MS = 10000;
const PREVIEW_POLL_MS = 50;
const ACCENT_SELECTOR = "#tb-generation-accent";
const NAME_SELECTOR = ".tb-edit-column fieldset input";
const PICKER = 'button[aria-label="Provider, model and reasoning"]';
const PREFERENCE_KEY = "theme-builder.generation-selection.v1";
const NAME = "Randomizer browser journey";
const UI_FONT = "humanist";
const UNKNOWN_MODEL = "unavailable-model-for-recovery-test";
const ERROR_MESSAGES = [
  "Generation failed.",
  "Generation timed out.",
  "Generation could not finish.",
];
const LOCAL_HOSTS = ["127.0.0.1", "localhost", "[::1]"];

assert.ok(
  CONFIG.url && CONFIG.cdp && CONFIG.dataDir && CONFIG.artifacts,
  "Set BB_THEME_TEST_URL/CDP/DATA_DIR/ARTIFACTS to a disposable instance.",
);
assert.ok(LOCAL_HOSTS.includes(new URL(CONFIG.url).hostname));
assert.ok(LOCAL_HOSTS.includes(new URL(CONFIG.cdp).hostname));
assert.ok(realpathSync(CONFIG.dataDir).startsWith(`${realpathSync("/tmp")}/`));
const configuration = await (
  await fetch(`${CONFIG.url}/api/v1/system/config`)
).json();
assert.equal(realpathSync(configuration.dataDir), realpathSync(CONFIG.dataDir));
mkdirSync(CONFIG.artifacts, { recursive: true });
assert.ok(
  realpathSync(CONFIG.artifacts).startsWith(`${realpathSync("/tmp")}/`),
);
const rpc = async (method: string, input = {}) => {
  const response = await fetch(
    `${CONFIG.url}/api/v1/plugins/theme-builder/rpc/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    },
  );
  const body = await response.json();
  assert.ok(response.ok && body.ok, JSON.stringify(body));
  return body.result;
};
const browser = new Browser(CONFIG.cdp);
await browser.connect();
const page = await browser.page(CONFIG.url + ROUTE, "light");
const preview = () =>
  page.evaluate<string>("document.querySelector('iframe').srcdoc");
const evidence: Record<string, unknown> = {};
let applied = false;
const failures: unknown[] = [];

async function generation() {
  await page.click("Randomize");
  const deadline = Date.now() + DEADLINE_MS;
  while (Date.now() < deadline) {
    const text = await page.evaluate<string>(
      "document.querySelector('.tb-shell').innerText",
    );
    if (text.includes("Both palettes generated.")) return;
    assert.ok(!ERROR_MESSAGES.some((message) => text.includes(message)), text);
    await delay(POLL_MS);
  }
  throw new Error("Real LLM generation timed out");
}

// srcdoc updates before its isolated document paints; proof must inspect the rendered palette.
async function renderedPreview(mode: "light" | "dark") {
  const canvas = await page.evaluate<string>(
    `document.querySelector('#${mode}-canvas').value`,
  );
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  const expression = `document.documentElement.classList.contains('dark') === ${mode === "dark"} && getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() === ${JSON.stringify(ACCENT.toLowerCase())} && getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim() === ${JSON.stringify(canvas)}`;
  while (Date.now() < deadline) {
    if (await page.previewEvaluate(expression)) return;
    await delay(PREVIEW_POLL_MS);
  }
  throw new Error("The rendered preview did not reflect the generated palette");
}

try {
  await page.wait(`document.querySelector(${JSON.stringify(PICKER)}) !== null`);
  await page.evaluate(
    `document.querySelector(${JSON.stringify(PICKER)}).click()`,
  );
  await page.wait(
    "document.querySelectorAll('[role=dialog] [role=option]').length > 1",
  );
  await page.evaluate(
    "document.querySelectorAll('[role=dialog] [role=option]')[1].click()",
  );
  await page.send("Input.dispatchKeyEvent", {
    type: "keyDown",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  await page.send("Input.dispatchKeyEvent", {
    type: "keyUp",
    key: "Escape",
    code: "Escape",
    windowsVirtualKeyCode: 27,
  });
  const selection = await page.evaluate<string>(
    `localStorage.getItem(${JSON.stringify(PREFERENCE_KEY)})`,
  );
  assert.ok(selection);
  await page.reload();
  assert.equal(
    await page.evaluate(
      `localStorage.getItem(${JSON.stringify(PREFERENCE_KEY)})`,
    ),
    selection,
  );
  evidence.selection = JSON.parse(selection);
  await page.fill(NAME_SELECTOR, NAME);
  await page.evaluate(
    `(() => { const select = document.querySelector('section[aria-label="Typography"] select'); select.value = ${JSON.stringify(UI_FONT)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  await page.fill(ACCENT_SELECTOR, "#bad");
  assert.equal(
    await page.evaluate(
      "Array.from(document.querySelectorAll('.tb-shell button')).find(b => b.textContent === 'Randomize').disabled",
    ),
    true,
  );
  await page.fill(ACCENT_SELECTOR, ACCENT);
  const before = await preview();
  const appearance = await rpc("getAppearance");
  const savedBefore = await rpc("listPresets");
  await generation();
  assert.equal(
    await page.evaluate("document.querySelector('#light-primary').value"),
    ACCENT.toLowerCase(),
  );
  await renderedPreview("light");
  await page.click("Dark");
  await renderedPreview("dark");
  assert.equal(
    await page.evaluate("document.querySelector('#dark-primary').value"),
    ACCENT.toLowerCase(),
  );
  await page.click("Light");
  await renderedPreview("light");
  assert.equal(
    await page.evaluate(
      `document.querySelector(${JSON.stringify(NAME_SELECTOR)}).value`,
    ),
    NAME,
  );
  assert.equal(
    await page.evaluate(
      "document.querySelector('section[aria-label=\"Typography\"] select').value",
    ),
    UI_FONT,
  );
  assert.notEqual(await preview(), before);
  assert.deepEqual(await rpc("getAppearance"), appearance);
  assert.deepEqual(await rpc("listPresets"), savedBefore);
  evidence.accent =
    "both modes exact; uppercase accepted; draft name/fonts retained; no implicit save/apply";
  const shot = await page.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  writeFileSync(
    join(CONFIG.artifacts, "generated.png"),
    Buffer.from(shot.data, "base64"),
  );
  await page.click("Save");
  await page.status("Preset saved.");
  await page.click("Apply");
  applied = true;
  await page.status("Palette applied to all bb windows.");
  await page.click("Restore previous theme");
  await page.status("Previous palette restored.");
  applied = false;
  assert.equal((await rpc("getAppearance")).themeId, appearance.themeId);
  await page.click("Undo randomization");
  assert.equal(await preview(), before);
  evidence.applyRestoreUndo = true;
  await page.fill(ACCENT_SELECTOR, "");
  await generation();
  assert.notEqual(await preview(), before);
  evidence.freeAccent = true;
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: 600,
    height: 850,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await page.click("Preview");
  await page.click("Edit");
  assert.equal(
    await page.evaluate(
      "document.querySelector('.tb-shell').scrollWidth <= document.querySelector('.tb-shell').clientWidth",
    ),
    true,
  );
  await page.click("Undo randomization");
  assert.equal(await preview(), before);
  await page.click("Randomize");
  await page.click("Cancel generation");
  await page.status("Generation cancelled.");
  assert.equal(await preview(), before);
  evidence.cancelAndRemount = true;
  await page.reload();
  // The picker repairs stale selections, so emulate a model disappearing after selection.
  await page.send("Fetch.enable", {
    patterns: [
      { urlPattern: "*/rpc/startGeneration", requestStage: "Request" },
    ],
  });
  const eventStart = browser.events.length;
  const failedBefore = await preview();
  await page.click("Randomize");
  const requestDeadline = Date.now() + DEADLINE_MS;
  let paused: (typeof browser.events)[number] | undefined;
  while (Date.now() < requestDeadline) {
    paused = browser.events
      .slice(eventStart)
      .find(
        (event) =>
          event.sessionId === page.sessionId &&
          event.method === "Fetch.requestPaused",
      );
    if (paused) break;
    await delay(POLL_MS);
  }
  assert.ok(paused?.params);
  const request = paused.params.request as { postData: string };
  const input = JSON.parse(request.postData);
  input.selection.model = UNKNOWN_MODEL;
  await page.send("Fetch.continueRequest", {
    requestId: paused.params.requestId,
    postData: Buffer.from(JSON.stringify(input)).toString("base64"),
  });
  await page.send("Fetch.disable");
  await page.status("Generation failed.");
  assert.equal(await preview(), failedBefore);
  evidence.unavailableModel = "error preserves draft";
  writeFileSync(
    join(CONFIG.artifacts, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (cause) {
  failures.push(cause);
} finally {
  try {
    if (applied) {
      const current = await rpc("getAppearance");
      await rpc("restoreAppearance", {
        operationId: current.operationId,
        observedFingerprint: current.fingerprint,
      });
    }
    await page.dispose();
  } catch (cleanupFailure) {
    // Preserve both failures, then report them outside finally so cleanup cannot replace the original cause.
    failures.push(cleanupFailure);
  } finally {
    browser.close();
  }
}
if (failures.length > 0)
  throw new AggregateError(failures, "Randomizer journey failed");
