import assert from "node:assert/strict";
import { realpathSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, relative } from "node:path";

const CONFIG = {
  url: process.env.BB_SERVER_URL,
  dataDir: process.env.BB_DATA_DIR,
  browser: process.env.BB_THEME_TEST_CDP,
  artifacts: process.env.BB_THEME_TEST_ARTIFACTS,
};
const LOOPBACK = new Set(["127.0.0.1", "localhost", "[::1]"]);
const CONFIG_ROUTE = "/api/v1/system/config";
const TIMEOUT_MS = 10_000;
const HTTP_PROTOCOLS = new Set(["http:", "https:"]);
const WS_PROTOCOLS = new Set(["ws:", "wss:"]);
const TEMP_ROOTS = [tmpdir(), "/tmp"].map((root) => realpathSync(root));
const PARENT = "..";
const MESSAGES = {
  required:
    "Set the disposable runtime, browser, and evidence environment variables.",
  endpoint:
    "Verification endpoints must use loopback addresses and the expected protocols.",
  directory:
    "Verification data must be in a child of the OS temporary directory.",
  identity:
    "The live server data directory differs from BB_DATA_DIR; refusing installation.",
};

// Check the live data identity before installing full-trust code, not after a smoke test starts.
assert.ok(Object.values(CONFIG).every(Boolean), MESSAGES.required);
const server = new URL(CONFIG.url);
const browser = new URL(CONFIG.browser);
assert.ok(
  LOOPBACK.has(server.hostname) && HTTP_PROTOCOLS.has(server.protocol),
  MESSAGES.endpoint,
);
assert.ok(
  LOOPBACK.has(browser.hostname) && WS_PROTOCOLS.has(browser.protocol),
  MESSAGES.endpoint,
);
const dataDir = realpathSync(CONFIG.dataDir);
assert.ok(
  TEMP_ROOTS.some((root) => {
    const within = relative(root, dataDir);
    return within && !within.startsWith(PARENT) && !isAbsolute(within);
  }),
  MESSAGES.directory,
);
const response = await fetch(new URL(CONFIG_ROUTE, server), {
  signal: AbortSignal.timeout(TIMEOUT_MS),
});
assert.ok(response.ok, MESSAGES.identity);
const actual = await response.json();
assert.equal(realpathSync(actual.dataDir), dataDir, MESSAGES.identity);
console.log("Disposable runtime identity verified before installation.");
