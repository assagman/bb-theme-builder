import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import {
  createFakePluginHost,
  makeThreadResponse,
} from "@get-bb/plugin-sdk/testing";
import { defaultSelection, runGenerationThread } from "./thread.ts";

const PROVIDER = "fixture";
const MODEL = "fixture-model";
const PERSONAL_PROJECT = {
  id: "personal",
  kind: "personal" as const,
  name: "Personal",
  sources: [],
  createdAt: 0,
  updatedAt: 0,
  gitRemoteUrl: null,
};
const SELECTION = {
  providerId: PROVIDER,
  model: MODEL,
  reasoningLevel: "low" as const,
};
const CATALOG = {
  modelLoadError: null,
  permissionCeiling: "full" as const,
  selectedOnlyModels: [],
  providers: [
    {
      id: PROVIDER,
      displayName: "Fixture",
      available: true,
      pluginId: "fixture",
      logoUrl: null,
      composerActions: [],
      maintenance: { health: false, installation: false, usage: false },
      capabilities: {
        modelCatalogScope: "host" as const,
        permissionModes: ["accept-edits" as const],
        supportsFork: false,
        supportsNativeUserQuestion: false,
        supportsServiceTier: false,
        supportsSessionRewind: false,
        supportsThreadArchive: false,
        supportsThreadRename: false,
      },
    },
  ],
  models: [
    {
      id: MODEL,
      model: MODEL,
      displayName: MODEL,
      description: "",
      isDefault: true,
      defaultReasoningEffort: "low" as const,
      supportedReasoningEfforts: [
        { reasoningEffort: "low" as const, description: "" },
      ],
    },
  ],
};

test("uses the selected model in a personal thread, then reads output and archives it", async () => {
  const thread = makeThreadResponse({ status: "idle" });
  const { bb, harness } = createFakePluginHost({
    sdk: {
      providers: { models: async () => CATALOG },
      projects: { list: async () => [PERSONAL_PROJECT] },
      threads: {
        spawn: async () => thread,
        get: async () => thread,
        output: async () => ({ output: "palette" }),
        archive: async () => ({ archived: 1 }),
      },
    },
  });
  try {
    const input = {
      requestId: randomUUID(),
      selection: SELECTION,
      accent: null,
    };
    assert.equal(
      await runGenerationThread(bb, input, new AbortController().signal),
      "palette",
    );
    const [[spawn]] = harness.inspection.sdk.callsTo("threads.spawn");
    assert.ok(
      typeof spawn === "object" &&
        spawn !== null &&
        "model" in spawn &&
        "permissionMode" in spawn &&
        "environment" in spawn,
    );
    assert.equal(spawn.model, MODEL);
    assert.equal(spawn.permissionMode, "accept-edits");
    assert.deepEqual(spawn.environment, {
      type: "host",
      workspace: { type: "personal" },
    });
    assert.equal(harness.inspection.sdk.callsTo("threads.archive").length, 1);
    assert.equal(harness.inspection.sdk.callsTo("theme.set").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("rejects forged model choices before spawning a thread", async () => {
  const { bb, harness } = createFakePluginHost({
    sdk: { providers: { models: async () => CATALOG } },
  });
  try {
    await assert.rejects(
      runGenerationThread(
        bb,
        {
          requestId: randomUUID(),
          selection: { ...SELECTION, model: "unknown" },
          accent: null,
        },
        new AbortController().signal,
      ),
    );
    assert.equal(harness.inspection.sdk.callsTo("threads.spawn").length, 0);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("cancellation during spawn stops and archives the late-created thread", async () => {
  const controller = new AbortController();
  const thread = makeThreadResponse({ status: "active" });
  const { bb, harness } = createFakePluginHost({
    sdk: {
      providers: { models: async () => CATALOG },
      projects: { list: async () => [PERSONAL_PROJECT] },
      threads: {
        spawn: async () => {
          controller.abort();
          return thread;
        },
        stop: async () => ({ ok: true }),
        archive: async () => ({ archived: 1 }),
      },
    },
  });
  try {
    await assert.rejects(
      runGenerationThread(
        bb,
        { requestId: randomUUID(), selection: SELECTION, accent: null },
        controller.signal,
      ),
    );
    assert.equal(harness.inspection.sdk.callsTo("threads.stop").length, 1);
    assert.equal(harness.inspection.sdk.callsTo("threads.archive").length, 1);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("model discovery falls through empty and failed providers to a usable selection", async () => {
  const providers = ["empty", "broken", PROVIDER].map((id) => ({
    ...CATALOG.providers[0],
    id,
  }));
  const { bb, harness } = createFakePluginHost({
    sdk: {
      providers: {
        models: async (args) => {
          if (args?.providerId === "broken") throw new Error("unavailable");
          return {
            ...CATALOG,
            providers,
            models: args?.providerId === PROVIDER ? CATALOG.models : [],
          };
        },
      },
    },
  });
  try {
    assert.deepEqual(await defaultSelection(bb), SELECTION);
  } finally {
    await harness.lifecycle.dispose();
  }
});

test("a failed stop does not skip archiving the generation thread", async () => {
  const controller = new AbortController();
  const thread = makeThreadResponse({ status: "active" });
  const { bb, harness } = createFakePluginHost({
    sdk: {
      providers: { models: async () => CATALOG },
      projects: { list: async () => [PERSONAL_PROJECT] },
      threads: {
        spawn: async () => {
          controller.abort();
          return thread;
        },
        stop: async () => {
          throw new Error("already stopped");
        },
        archive: async () => ({ archived: 1 }),
      },
    },
  });
  try {
    await assert.rejects(
      runGenerationThread(
        bb,
        { requestId: randomUUID(), selection: SELECTION, accent: null },
        controller.signal,
      ),
    );
    assert.equal(harness.inspection.sdk.callsTo("threads.archive").length, 1);
  } finally {
    await harness.lifecycle.dispose();
  }
});
