import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createAppearanceAdapter } from "./adapter.ts";

const INITIAL = {
  themeId: "default",
  faviconColor: "purple" as const,
  customCss: null,
  resolvedCodeTheme: { dark: "pierre-dark", light: "pierre-light", files: {} },
};
const TARGET = "theme-builder-0123456789ab-r1-abcdef012345";
const CSS = ":root { --canvas: #ffffff; }";

test("activates with the existing favicon and verifies by reading appearance", async () => {
  let current: Omit<typeof INITIAL, "customCss"> & {
    customCss: string | null;
  } = INITIAL;
  const { bb, harness } = createFakePluginHost({
    sdk: {
      theme: {
        get: async () => current,
        set: async (selection: unknown) => {
          assert.deepEqual(selection, {
            themeId: TARGET,
            faviconColor: INITIAL.faviconColor,
          });
          current = { ...current, themeId: TARGET, customCss: CSS };
          return current;
        },
      },
    },
  });
  try {
    const adapter = createAppearanceAdapter(bb.sdk.theme);
    const observed = await adapter.read();
    const result = await adapter.select(TARGET, observed.fingerprint);
    assert.equal(result.kind, "selected");
    assert.equal(harness.inspection.sdk.callsTo("theme.get").length, 3);
    assert.deepEqual(harness.inspection.sdk.callsTo("theme.set")[0], [
      { themeId: TARGET, faviconColor: INITIAL.faviconColor },
    ]);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("refuses stale observations without changing appearance", async () => {
  const { bb, harness } = createFakePluginHost({
    sdk: { theme: { get: async () => INITIAL } },
  });
  try {
    const adapter = createAppearanceAdapter(bb.sdk.theme);
    const result = await adapter.select(TARGET, "stale");
    assert.equal(result.kind, "conflict");
    assert.equal(harness.inspection.sdk.callsTo("theme.set").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("does not report success when selection readback disagrees", async () => {
  const { bb, harness } = createFakePluginHost({
    sdk: {
      theme: {
        get: async () => INITIAL,
        set: async () => ({ ...INITIAL, themeId: TARGET, customCss: CSS }),
      },
    },
  });
  try {
    const adapter = createAppearanceAdapter(bb.sdk.theme);
    const result = await adapter.select(
      TARGET,
      (await adapter.read()).fingerprint,
    );
    assert.equal(result.kind, "unconfirmed");
  } finally {
    await harness.lifecycle.dispose();
  }
});
