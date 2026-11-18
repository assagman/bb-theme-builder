import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createAppearanceService } from "./src/appearance/service.ts";
import {
  chatSweeperService,
  createChatSessions,
} from "./src/generation/session.ts";
import { defaultSelection } from "./src/generation/thread.ts";
import { rpcContract } from "./src/presets/contract.ts";
import { createPresetStore } from "./src/presets/store.ts";

// Background service name; one sweeper per plugin load ends chats whose page went away.
const CHAT_SWEEPER = "chat-sweeper";

export default function plugin(bb: BbPluginApi) {
  const store = createPresetStore(bb.storage.kv);
  const appearance = createAppearanceService(bb, store);
  const chat = createChatSessions(bb, bb.storage.kv);
  bb.background.service(CHAT_SWEEPER, chatSweeperService(bb, chat));
  bb.onDispose(async () => {
    await chat.close();
    await appearance.close();
    await store.close();
  });
  bb.rpc.register(rpcContract, {
    getGenerationSelection: () => defaultSelection(bb),
    chatStart: chat.start,
    chatSend: chat.send,
    chatGet: chat.get,
    chatStop: chat.stop,
    chatEnd: chat.end,
    chatPing: chat.ping,
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
