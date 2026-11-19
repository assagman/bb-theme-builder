import assert from "node:assert/strict";
import { test } from "node:test";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "../../server.ts";
import { generateCss } from "../theme/css.ts";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { toDraft } from "../theme/schema.ts";
import { createPresetStore } from "./store.ts";

const FIRST_NAME = "First window";
const SECOND_NAME = "Second window";
const OVERSIZE_LENGTH = 32769;

test("one of two competing saves wins and the other receives an explicit conflict", async () => {
  const { bb, harness } = createFakePluginHost();
  try {
    const store = createPresetStore(bb.storage.kv);
    const initial = await store.save({
      id: null,
      expectedRevision: null,
      draft: NEUTRAL_PRESET,
    });
    assert.equal(initial.kind, "saved");
    if (initial.kind !== "saved") throw new Error("Creation failed");
    const input = {
      id: initial.preset.id,
      expectedRevision: initial.preset.revision,
    };
    const results = await Promise.all([
      store.save({ ...input, draft: { ...NEUTRAL_PRESET, name: FIRST_NAME } }),
      store.save({ ...input, draft: { ...NEUTRAL_PRESET, name: SECOND_NAME } }),
    ]);
    assert.deepEqual(results.map((result) => result.kind).sort(), [
      "conflict",
      "saved",
    ]);
    assert.equal((await store.get(input.id))?.revision, 2);
    assert.equal((await store.get(input.id))?.name, FIRST_NAME);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("the RPC boundary rejects unsupported schemas and oversized input without persisting it", async () => {
  const { bb, harness } = createFakePluginHost();
  try {
    plugin(bb);
    for (const draft of [
      { ...NEUTRAL_PRESET, schemaVersion: 99 },
      { ...NEUTRAL_PRESET, name: "x".repeat(OVERSIZE_LENGTH) },
    ]) {
      await assert.rejects(
        harness.behavior.callRpc("savePreset", {
          id: null,
          expectedRevision: null,
          draft,
        }),
      );
    }
    assert.deepEqual(await harness.behavior.callRpc("listPresets", {}), []);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("exports saved values without timestamps or paths, and requires the current revision", async () => {
  const { bb, harness } = createFakePluginHost();
  try {
    const store = createPresetStore(bb.storage.kv);
    const saved = await store.save({
      id: null,
      expectedRevision: null,
      draft: NEUTRAL_PRESET,
    });
    assert.equal(saved.kind, "saved");
    if (saved.kind !== "saved") throw new Error("Creation failed");
    const exported = await store.export({
      id: saved.preset.id,
      revision: saved.preset.revision,
    });
    assert.equal(exported.kind, "exported");
    if (exported.kind !== "exported") throw new Error("Export failed");
    assert.deepEqual(JSON.parse(exported.json), toDraft(saved.preset));
    assert.equal(exported.css, generateCss(toDraft(saved.preset)));
    assert.match(exported.baseName, /^[a-z0-9-]+$/);
    assert.equal(
      (await store.export({ id: saved.preset.id, revision: 2 })).kind,
      "conflict",
    );
    const reopened = createPresetStore(bb.storage.kv);
    assert.deepEqual(await reopened.get(saved.preset.id), saved.preset);
    assert.equal(
      (await reopened.remove({ id: saved.preset.id, expectedRevision: 2 }))
        .kind,
      "conflict",
    );
    assert.equal(
      (await reopened.remove({ id: saved.preset.id, expectedRevision: 1 }))
        .kind,
      "deleted",
    );
    assert.equal(await reopened.get(saved.preset.id), null);
  } finally {
    await harness.lifecycle.dispose();
  }
});
