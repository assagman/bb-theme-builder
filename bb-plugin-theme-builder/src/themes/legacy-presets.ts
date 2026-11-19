/**
 * Read-only access to the presets older versions saved in KV. They are only
 * read to migrate them into bb themes and are never written or deleted, so
 * they stay as a backup.
 */
import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { presetSchema } from "../theme/schema.ts";
import { upgradePalettes } from "../theme/sidebar.ts";
import { MAX_PRESETS, type ThemePreset } from "../theme/tokens.ts";

const PRESET_PREFIX = "preset:";
const ID_MISMATCH = "Preset id does not match its storage key";

/** Every stored preset that still validates, oldest key order first; a broken entry is reported, not fatal. */
export async function readLegacyPresets(
  kv: PluginKvStorage,
  onInvalid: (key: string, cause: unknown) => void,
): Promise<ThemePreset[]> {
  const keys = (await kv.list(PRESET_PREFIX)).slice(0, MAX_PRESETS);
  const presets: ThemePreset[] = [];
  for (const key of keys) {
    // Presets saved before the sidebar colors existed gain bb's own sidebar mixes, as the old store did on read.
    const parsed = presetSchema.safeParse(upgradePalettes(await kv.get(key)));
    if (parsed.success && key === PRESET_PREFIX + parsed.data.id)
      presets.push(parsed.data);
    else onInvalid(key, parsed.error ?? new Error(ID_MISMATCH));
  }
  return presets;
}
