import assert from "node:assert/strict";
import {
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { createPresetStore } from "../presets/store.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import type { Appearance } from "./adapter.ts";
import { createAppearanceService } from "./service.ts";

const INITIAL: Appearance = {
  themeId: "default",
  faviconColor: "purple",
  customCss: null,
  resolvedCodeTheme: { dark: "pierre-dark", light: "pierre-light", files: {} },
};
const PREFIX = "theme-builder-service-";

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), PREFIX));
  let current = structuredClone(INITIAL);
  let failSet = false;
  let failRead = false;
  let loseReadback = false;
  let invalidDirectory = false;
  const { bb, harness } = createFakePluginHost({
    sdk: {
      theme: {
        get: async () => {
          if (failRead) throw new Error("Read unavailable");
          return current;
        },
        catalog: async () => ({
          active: current,
          custom: readdirSync(root),
          plugins: [],
          dir: invalidDirectory ? join(root, "blocked") : root,
        }),
        set: async (selection: unknown) => {
          if (failSet) throw new Error("Activation failed");
          const value = selection as {
            themeId: string;
            faviconColor: Appearance["faviconColor"];
          };
          current = {
            ...INITIAL,
            ...value,
            customCss:
              value.themeId === "default"
                ? null
                : readFileSync(join(root, value.themeId, "theme.css"), "utf8"),
          };
          if (loseReadback) failRead = true;
          return current;
        },
      },
    },
  });
  const store = createPresetStore(bb.storage.kv);
  const saved = await store.save({
    id: null,
    expectedRevision: null,
    draft: NEUTRAL_PRESET,
  });
  assert.equal(saved.kind, "saved");
  if (saved.kind !== "saved") throw new Error("Fixture could not save");
  return {
    bb,
    store,
    preset: saved.preset,
    root,
    service: createAppearanceService(bb, store),
    current: () => current,
    external: () => {
      current = { ...INITIAL, themeId: "nord" };
    },
    changeFavicon: () => {
      current = { ...current, faviconColor: "green" };
    },
    missingPrevious: () => {
      current = { ...INITIAL, themeId: "removed-theme" };
    },
    failFiles: () => {
      writeFileSync(join(root, "blocked"), "not a directory");
      invalidDirectory = true;
    },
    failActivation: () => {
      failSet = true;
    },
    loseReadback: () => {
      loseReadback = true;
    },
    recoverReads: () => {
      failRead = false;
      loseReadback = false;
    },
    async cleanup() {
      await harness.lifecycle.dispose();
      rmSync(root, { recursive: true });
    },
  };
}

test("applies immutable CSS, preserves favicon, restores once, and refuses duplicate apply observations", async () => {
  const f = await fixture();
  try {
    const observed = await f.service.get();
    const input = {
      id: f.preset.id,
      revision: f.preset.revision,
      observedFingerprint: observed.fingerprint,
    };
    const result = await f.service.apply(input);
    assert.equal(result.kind, "applied");
    assert.equal(f.current().faviconColor, "purple");
    assert.notEqual(f.current().themeId, "default");
    const css = f.current().customCss;
    await f.store.save({
      id: f.preset.id,
      expectedRevision: 1,
      draft: {
        ...NEUTRAL_PRESET,
        light: { ...NEUTRAL_PRESET.light, canvas: "#123456" },
      },
    });
    assert.equal(f.current().customCss, css);
    assert.equal((await f.service.apply(input)).kind, "conflict");
    assert.equal(
      (await f.store.remove({ id: f.preset.id, expectedRevision: 2 })).kind,
      "deleted",
    );
    assert.equal(f.current().customCss, css);
    const active = await f.service.get();
    assert.equal(active.restoreAvailable, true);
    assert.ok(active.operationId);
    assert.equal(
      (
        await f.service.restore({
          operationId: active.operationId,
          observedFingerprint: active.fingerprint,
        })
      ).kind,
      "restored",
    );
    assert.equal(f.current().themeId, "default");
    assert.equal((await f.service.get()).restoreAvailable, false);
  } finally {
    await f.cleanup();
  }
});

test("refuses restore after an external palette selection", async () => {
  const f = await fixture();
  try {
    await f.service.apply({
      id: f.preset.id,
      revision: 1,
      observedFingerprint: (await f.service.get()).fingerprint,
    });
    const active = await f.service.get();
    assert.ok(active.operationId);
    f.external();
    assert.equal(
      (
        await f.service.restore({
          operationId: active.operationId,
          observedFingerprint: active.fingerprint,
        })
      ).kind,
      "conflict",
    );
    assert.equal(f.current().themeId, "nord");
  } finally {
    await f.cleanup();
  }
});

test("restore preserves a newer favicon after refreshing the observation", async () => {
  const f = await fixture();
  try {
    await f.service.apply({
      id: f.preset.id,
      revision: 1,
      observedFingerprint: (await f.service.get()).fingerprint,
    });
    f.changeFavicon();
    const active = await f.service.get();
    assert.equal(active.restoreAvailable, true);
    assert.ok(active.operationId);
    assert.equal(
      (
        await f.service.restore({
          operationId: active.operationId,
          observedFingerprint: active.fingerprint,
        })
      ).kind,
      "restored",
    );
    assert.equal(f.current().faviconColor, "green");
  } finally {
    await f.cleanup();
  }
});

test("failed activation keeps the prior restore record", async () => {
  const f = await fixture();
  try {
    await f.service.apply({
      id: f.preset.id,
      revision: 1,
      observedFingerprint: (await f.service.get()).fingerprint,
    });
    const active = await f.service.get();
    assert.ok(active.operationId);
    f.failActivation();
    assert.equal(
      (
        await f.service.apply({
          id: f.preset.id,
          revision: 1,
          observedFingerprint: active.fingerprint,
        })
      ).kind,
      "failed",
    );
    assert.equal((await f.service.get()).operationId, active.operationId);
  } finally {
    await f.cleanup();
  }
});

test("serializes competing apply requests and rejects a duplicate restore", async () => {
  const f = await fixture();
  try {
    const input = {
      id: f.preset.id,
      revision: 1,
      observedFingerprint: (await f.service.get()).fingerprint,
    };
    const results = await Promise.all([
      f.service.apply(input),
      f.service.apply(input),
    ]);
    assert.deepEqual(results.map((result) => result.kind).sort(), [
      "applied",
      "conflict",
    ]);
    const active = await f.service.get();
    assert.ok(active.operationId);
    const restore = {
      operationId: active.operationId,
      observedFingerprint: active.fingerprint,
    };
    assert.equal((await f.service.restore(restore)).kind, "restored");
    assert.equal((await f.service.restore(restore)).kind, "conflict");
  } finally {
    await f.cleanup();
  }
});

test("a failed file write cannot change appearance or create a restore record", async () => {
  const f = await fixture();
  try {
    f.failFiles();
    const result = await f.service.apply({
      id: f.preset.id,
      revision: 1,
      observedFingerprint: (await f.service.get()).fingerprint,
    });
    assert.equal(result.kind, "failed");
    assert.deepEqual(f.current(), INITIAL);
    assert.equal((await f.service.get()).operationId, null);
  } finally {
    await f.cleanup();
  }
});

test("a missing previous theme requires an explicit default fallback", async () => {
  const f = await fixture();
  try {
    f.missingPrevious();
    assert.equal(
      (
        await f.service.apply({
          id: f.preset.id,
          revision: 1,
          observedFingerprint: (await f.service.get()).fingerprint,
        })
      ).kind,
      "applied",
    );
    const active = await f.service.get();
    assert.ok(active.operationId);
    const input = {
      operationId: active.operationId,
      observedFingerprint: active.fingerprint,
    };
    assert.equal((await f.service.restore(input)).kind, "missing");
    assert.equal(f.current().themeId, active.themeId);
    assert.equal(
      (await f.service.restore({ ...input, fallbackToDefault: true })).kind,
      "restored",
    );
    assert.equal(f.current().themeId, "default");
  } finally {
    await f.cleanup();
  }
});

test("reconciles a restore whose activation succeeded before readback was lost", async () => {
  const f = await fixture();
  try {
    await f.service.apply({
      id: f.preset.id,
      revision: 1,
      observedFingerprint: (await f.service.get()).fingerprint,
    });
    const active = await f.service.get();
    assert.ok(active.operationId);
    f.loseReadback();
    assert.equal(
      (
        await f.service.restore({
          operationId: active.operationId,
          observedFingerprint: active.fingerprint,
        })
      ).kind,
      "failed",
    );
    f.recoverReads();
    const recovered = await createAppearanceService(f.bb, f.store).get();
    assert.equal(recovered.themeId, "default");
    assert.equal(recovered.restoreAvailable, false);
    assert.equal(recovered.operationId, null);
  } finally {
    await f.cleanup();
  }
});

test("reconciles a pending apply after losing its readback and recreating the service", async () => {
  const f = await fixture();
  try {
    const observed = await f.service.get();
    f.loseReadback();
    await f.service
      .apply({
        id: f.preset.id,
        revision: 1,
        observedFingerprint: observed.fingerprint,
      })
      .catch(() => undefined);
    f.recoverReads();
    const recovered = await createAppearanceService(f.bb, f.store).get();
    assert.equal(recovered.themeId, f.current().themeId);
    assert.equal(recovered.restoreAvailable, true);
    assert.ok(recovered.operationId);
  } finally {
    await f.cleanup();
  }
});
