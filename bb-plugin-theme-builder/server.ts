import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createAppearanceService } from "./src/appearance/service.ts";
import { createGenerationJobs } from "./src/generation/jobs.ts";
import {
  defaultSelection,
  runGenerationThread,
} from "./src/generation/thread.ts";
import { rpcContract } from "./src/presets/contract.ts";
import { createPresetStore } from "./src/presets/store.ts";

export default function plugin(bb: BbPluginApi) {
  const store = createPresetStore(bb.storage.kv);
  const appearance = createAppearanceService(bb, store);
  const generation = createGenerationJobs((input, signal) =>
    runGenerationThread(bb, input, signal),
  );
  bb.onDispose(async () => {
    await generation.close();
    await appearance.close();
    await store.close();
  });
  bb.rpc.register(rpcContract, {
    getGenerationSelection: () => defaultSelection(bb),
    startGeneration: generation.start,
    getGeneration: ({ requestId }) => generation.get(requestId),
    cancelGeneration: ({ requestId }) => {
      generation.cancel(requestId);
      return {};
    },
    listPresets: () => store.list(),
    getPreset: ({ id }) => store.get(id),
    savePreset: (input) => store.save(input),
    deletePreset: (input) => store.remove(input),
    exportPreset: (input) => store.export(input),
    getAppearance: appearance.get,
    applyPreset: appearance.apply,
    restoreAppearance: appearance.restore,
  });
}
