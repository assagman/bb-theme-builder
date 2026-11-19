import { randomUUID } from "node:crypto";
import type { PluginKvStorage } from "@get-bb/plugin-sdk";
import { generateCss } from "../theme/css.ts";
import {
  draftSchema,
  idSchema,
  presetSchema,
  revisionSchema,
  toDraft,
} from "../theme/schema.ts";
import {
  INITIAL_REVISION,
  MAX_PRESETS,
  MAX_REVISION,
  type ThemeDraft,
  type ThemePreset,
} from "../theme/tokens.ts";
import { createSerialExecutor } from "./serial.ts";

const PRESET_PREFIX = "preset:";
const EXPORT_PREFIX = "theme-builder-";
const EXPORT_KEY_LENGTH = 12;
const JSON_INDENT = 2;
const IDENTITY_ERROR = "Saved preset identity does not match its storage key";

export type SaveInput = {
  id: string | null;
  expectedRevision: number | null;
  draft: ThemeDraft;
};
export type SaveResult =
  | { kind: "saved"; preset: ThemePreset }
  | { kind: "conflict" }
  | { kind: "limit" };
export type ExportResult =
  | { kind: "exported"; json: string; css: string; baseName: string }
  | { kind: "conflict" };
export function createPresetStore(kv: PluginKvStorage) {
  const serial = createSerialExecutor();
  async function get(id: string): Promise<ThemePreset | null> {
    const value = await kv.get(PRESET_PREFIX + idSchema.parse(id));
    if (value === undefined) return null;
    const preset = presetSchema.parse(value);
    if (preset.id !== id) throw new Error(IDENTITY_ERROR);
    return preset;
  }
  return {
    get,
    close: serial.close,
    async list() {
      const keys = (await kv.list(PRESET_PREFIX)).slice(0, MAX_PRESETS);
      const presets = await Promise.all(
        keys.map((key) => get(key.slice(PRESET_PREFIX.length))),
      );
      return presets
        .filter((preset): preset is ThemePreset => preset !== null)
        .map(({ id, name, revision }) => ({ id, name, revision }));
    },
    save(input: SaveInput): Promise<SaveResult> {
      return serial.run(async () => {
        const draft = draftSchema.parse(input.draft);
        const previous = input.id === null ? null : await get(input.id);
        if (input.id === null) {
          if (input.expectedRevision !== null) return { kind: "conflict" };
          if ((await kv.list(PRESET_PREFIX)).length >= MAX_PRESETS)
            return { kind: "limit" };
        } else if (
          previous === null ||
          previous.revision !== input.expectedRevision ||
          previous.revision >= MAX_REVISION
        ) {
          return { kind: "conflict" };
        }
        const now = new Date().toISOString();
        const id = previous?.id ?? randomUUID();
        if (
          previous === null &&
          (await kv.get(PRESET_PREFIX + id)) !== undefined
        )
          return { kind: "conflict" };
        const preset = presetSchema.parse({
          ...draft,
          name: draft.name.trim(),
          id,
          revision:
            previous === null
              ? INITIAL_REVISION
              : previous.revision + INITIAL_REVISION,
          createdAt: previous?.createdAt ?? now,
          updatedAt: now,
        });
        // Serial requests keep the read/check/write sequence indivisible to other builder saves.
        await kv.set(PRESET_PREFIX + id, preset);
        return { kind: "saved", preset };
      });
    },
    remove(input: {
      id: string;
      expectedRevision: number;
    }): Promise<{ kind: "deleted" } | { kind: "conflict" }> {
      return serial.run(async () => {
        const preset = await get(input.id);
        if (
          preset === null ||
          preset.revision !== revisionSchema.parse(input.expectedRevision)
        )
          return { kind: "conflict" };
        await kv.delete(PRESET_PREFIX + preset.id);
        return { kind: "deleted" };
      });
    },
    async export(input: {
      id: string;
      revision: number;
    }): Promise<ExportResult> {
      const preset = await get(input.id);
      if (
        preset === null ||
        preset.revision !== revisionSchema.parse(input.revision)
      )
        return { kind: "conflict" };
      const draft = toDraft(preset);
      return {
        kind: "exported",
        json: `${JSON.stringify(draft, null, JSON_INDENT)}\n`,
        css: generateCss(draft),
        baseName: `${EXPORT_PREFIX}${preset.id.replaceAll("-", "").slice(0, EXPORT_KEY_LENGTH)}-r${preset.revision}`,
      };
    },
  };
}
export type PresetStore = ReturnType<typeof createPresetStore>;
