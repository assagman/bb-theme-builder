import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../../server.ts";

const APPEARANCE = {
  themeId: "default",
  faviconColor: "purple" as const,
  customCss: null,
  resolvedCodeTheme: { dark: "pierre-dark", light: "pierre-light", files: {} },
};

test("reports current appearance without exposing theme CSS or server paths", async () => {
  const { bb, harness } = createFakePluginHost({
    sdk: { theme: { get: async () => APPEARANCE } },
  });
  try {
    await plugin(bb);
    const result = (await harness.behavior.callRpc(
      "getAppearance",
      {},
    )) as Record<string, unknown>;
    assert.equal(result.themeId, APPEARANCE.themeId);
    assert.equal(typeof result.fingerprint, "string");
    assert.equal(result.restoreAvailable, false);
    assert.equal("customCss" in result, false);
    assert.equal(harness.inspection.sdk.callsTo("theme.set").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});
