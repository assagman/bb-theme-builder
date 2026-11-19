import assert from "node:assert/strict";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { COPY } from "../src/editor/copy.ts";
import { DRAFT_STORAGE_KEY } from "../src/editor/draft-storage.ts";
import { Browser } from "./browser.ts";

const CONFIG = {
  url: process.env.BB_THEME_TEST_URL,
  cdp: process.env.BB_THEME_TEST_CDP,
  dataDir: process.env.BB_THEME_TEST_DATA_DIR,
  artifacts: process.env.BB_THEME_TEST_ARTIFACTS,
};
const ROUTE = "/plugins/theme-builder/builder";
const ACCENT = "#A34BC5";
const INVALID_ACCENT = "#bad";
const ROLLS = 3;
const PREVIEW_TIMEOUT_MS = 10000;
const PREVIEW_POLL_MS = 50;
const PANEL = "[role=tabpanel]";
const ACCENT_SELECTOR = `${PANEL} input[placeholder=${JSON.stringify(COPY.accentPlaceholder)}]`;
const ACTION_NAME = ".tb-action-name";
const UI_FONT = "humanist";
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
const failures: unknown[] = [];
const roll = () => page.click(COPY.randomize, PANEL);
const actionName = () =>
  page.evaluate<string>(
    `document.querySelector(${JSON.stringify(ACTION_NAME)}).textContent`,
  );
const lightCanvas = () =>
  page.evaluate<string>("document.querySelector('#light-canvas').value");

// srcdoc updates before its isolated document paints; proof must inspect the rendered palette.
async function renderedPrimary(mode: "light" | "dark", primary: string) {
  const expression = `document.documentElement.classList.contains('dark') === ${mode === "dark"} && getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() === ${JSON.stringify(primary)}`;
  const deadline = Date.now() + PREVIEW_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const rendered = await page.previewEvaluate(expression);
    if (rendered) return;
    await delay(PREVIEW_POLL_MS);
  }
  throw new Error(`The rendered ${mode} preview did not keep the accent`);
}

// Rolls are random, so the proof is that the screen changed and that each step is reversible.
async function rollAndExpectChange() {
  const previous = await preview();
  await roll();
  await page.wait(
    `document.querySelector('iframe').srcdoc !== ${JSON.stringify(previous)}`,
  );
  return preview();
}

try {
  // Fonts and the open theme are the user's own, so a roll must leave them alone.
  await page.tab(COPY.tabLabels.edit);
  const name = await actionName();
  await page.evaluate(
    `(() => { const select = document.querySelector('section[aria-label="Typography"] select'); select.value = ${JSON.stringify(UI_FONT)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
  );
  const appearance = await rpc("getAppearance");
  const savedBefore = await rpc("listThemes");
  await page.tab(COPY.tabLabels.randomize);
  await page.fill(ACCENT_SELECTOR, INVALID_ACCENT);
  await page.status(COPY.accentInvalid);
  assert.equal(
    await page.evaluate(
      `Array.from(document.querySelectorAll(${JSON.stringify(`${PANEL} button`)})).find(b => b.textContent === ${JSON.stringify(COPY.randomize)}).disabled`,
    ),
    true,
  );
  await page.fill(ACCENT_SELECTOR, ACCENT);
  const palettes = [await preview()];
  for (let index = 0; index < ROLLS; index += 1) {
    palettes.push(await rollAndExpectChange());
    await renderedPrimary("light", ACCENT.toLowerCase());
  }
  assert.equal(new Set(palettes).size, ROLLS + 1, "Every roll must differ");
  await page.click(COPY.dark);
  await renderedPrimary("dark", ACCENT.toLowerCase());
  await page.click(COPY.light);
  evidence.accent = `primary keeps the accent in both modes across ${ROLLS} rolls`;
  const shot = await page.send<{ data: string }>("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: true,
  });
  writeFileSync(
    join(CONFIG.artifacts, "generated.png"),
    Buffer.from(shot.data, "base64"),
  );
  // Back walks the trail to the pre-roll palette; Forward returns to the newest roll.
  for (let index = ROLLS - 1; index >= 0; index -= 1) {
    await page.click(COPY.rollBack, PANEL);
    await page.wait(
      `document.querySelector('iframe').srcdoc === ${JSON.stringify(palettes[index])}`,
    );
  }
  for (let index = 1; index <= ROLLS; index += 1) {
    await page.click(COPY.rollForward, PANEL);
    await page.wait(
      `document.querySelector('iframe').srcdoc === ${JSON.stringify(palettes[index])}`,
    );
  }
  evidence.backForward = "Back restores each earlier palette; Forward replays";
  // A blank accent is the free roll.
  await page.fill(ACCENT_SELECTOR, "");
  const free = await rollAndExpectChange();
  evidence.freeAccent = true;
  // Rolls only edit the draft; nothing may be saved or used implicitly.
  assert.deepEqual(await rpc("getAppearance"), appearance);
  assert.deepEqual(await rpc("listThemes"), savedBefore);
  // The draft must outlive a reload, with the notice that says so.
  await page.tab(COPY.tabLabels.edit);
  const canvas = await lightCanvas();
  await page.wait(
    `JSON.parse(localStorage.getItem(${JSON.stringify(DRAFT_STORAGE_KEY)}) ?? 'null')?.draft.light.canvas === ${JSON.stringify(canvas)}`,
  );
  await page.reload();
  await page.status(`${COPY.restored} ${name}`);
  await page.tab(COPY.tabLabels.edit);
  assert.equal(await lightCanvas(), canvas);
  assert.equal(
    await page.evaluate(
      "document.querySelector('section[aria-label=\"Typography\"] select').value",
    ),
    UI_FONT,
  );
  assert.equal(await actionName(), name);
  await page.wait(
    `document.querySelector('iframe').srcdoc === ${JSON.stringify(free)}`,
  );
  await page.status(COPY.dirty);
  evidence.draftReload =
    "rolled palette, open theme, and fonts restored with the notice; nothing saved or used";
  writeFileSync(
    join(CONFIG.artifacts, "evidence.json"),
    JSON.stringify(evidence, null, 2),
  );
  console.log(JSON.stringify(evidence, null, 2));
} catch (cause) {
  failures.push(cause);
} finally {
  try {
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
