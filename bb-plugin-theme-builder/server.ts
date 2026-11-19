import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createAppearanceService } from "./src/appearance/service.ts";
import {
  chatSweeperService,
  createChatSessions,
} from "./src/generation/session.ts";
import { defaultSelection } from "./src/generation/thread.ts";
import { rpcContract } from "./src/themes/contract.ts";
import { migratePresets } from "./src/themes/migrate-presets.ts";
import { createThemeService } from "./src/themes/service.ts";
import { createThemeStore } from "./src/themes/theme-store.ts";

// Background service name; one sweeper per plugin load ends chats whose page went away.
const CHAT_SWEEPER = "chat-sweeper";

export default function plugin(bb: BbPluginApi) {
  const appearance = createAppearanceService(bb);
  const store = createThemeStore(bb.storage);
  const themes = createThemeService(bb, appearance, store);
  const chat = createChatSessions(bb, bb.storage.kv);
  bb.background.service(CHAT_SWEEPER, chatSweeperService(bb, chat));
  // Queued ahead of any theme request, so the dropdown already shows migrated presets; it logs its own failures.
  void themes.exclusive(() => migratePresets(bb, store));
  bb.onDispose(async () => {
    await chat.close();
    await themes.close();
    await appearance.close();
  });
  bb.rpc.register(rpcContract, {
    getGenerationSelection: () => defaultSelection(bb),
    chatStart: chat.start,
    chatSend: chat.send,
    chatGet: chat.get,
    chatStop: chat.stop,
    chatEnd: chat.end,
    chatPing: chat.ping,
    listThemes: themes.list,
    getTheme: themes.get,
    overwriteTheme: themes.overwrite,
    saveThemeAs: themes.saveAs,
    getThemeHistory: themes.history,
    undoTheme: themes.undo,
    redoTheme: themes.redo,
    deleteTheme: themes.remove,
    getAppearance: appearance.get,
    useTheme: appearance.select,
    restoreAppearance: appearance.restore,
  });
}
