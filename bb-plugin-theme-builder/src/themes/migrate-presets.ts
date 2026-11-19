/**
 * One-time move of the presets older versions kept in KV into bb themes.
 * Run once per plugin start from server.ts, on the theme service's queue,
 * so the dropdown never lists themes while a migration is half done.
 */
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { describeError } from "../shared/describe-error.ts";
import { generateCss } from "../theme/css.ts";
import { toDraft } from "../theme/schema.ts";
import type { ThemePreset } from "../theme/tokens.ts";
import { type Catalog, takenIn } from "./catalog.ts";
import {
  createThemeFile,
  cssHash,
  readThemeFile,
  ThemeFileError,
} from "./files.ts";
import { themeKind, uniqueThemeId } from "./ids.ts";
import { readLegacyPresets } from "./legacy-presets.ts";
import type { ThemeStore } from "./theme-store.ts";

/** KV flag set once every stored preset became a bb theme; per-preset progress lives in SQLite. */
const MIGRATION_FLAG = "presets-migrated-to-themes";
const OPERATION = "migrate";

/**
 * Turns each KV preset into an owned bb theme once. Progress is kept per
 * preset, so a run cut short resumes without duplicates; the presets stay
 * in KV as a backup and the active appearance is never touched. Failures
 * are logged here, the boundary that handles them, and never thrown.
 */
export async function migratePresets(
  bb: BbPluginApi,
  store: ThemeStore,
): Promise<void> {
  const warn = (fields: Record<string, unknown>) =>
    bb.log.warn(JSON.stringify({ operation: OPERATION, ...fields }));

  /**
   * True when a start cut short between writing a migrated theme and
   * recording it left this exact file behind: the resumed run adopts it
   * instead of making a duplicate. A folder that cannot be read safely is
   * never adopted; it is logged and the preset gets another id.
   */
  function leftover(catalog: Catalog, id: string, hash: string): boolean {
    if (themeKind(catalog, id) !== "custom" || store.owned().has(id))
      return false;
    try {
      return readThemeFile(catalog.dir, id)?.hash === hash;
    } catch (cause) {
      if (!(cause instanceof ThemeFileError)) throw cause;
      warn({ themeId: id, cause: describeError(cause) });
      return false;
    }
  }

  /** Turns one preset into an owned bb theme, recording presetId→themeId in the same step. */
  function migratePreset(
    catalog: Catalog,
    preset: ThemePreset,
    created: Set<string>,
  ) {
    const css = generateCss(toDraft(preset));
    const hash = cssHash(css);
    const taken = takenIn(catalog, store, created);
    const id = uniqueThemeId(
      preset.name,
      (candidate) => taken(candidate) && !leftover(catalog, candidate, hash),
    );
    if (!leftover(catalog, id, hash)) createThemeFile(catalog.dir, id, css);
    created.add(id);
    store.adoptMigrated(preset.id, id, css, hash);
  }

  try {
    if ((await bb.storage.kv.get(MIGRATION_FLAG)) === true) return;
    const presets = await readLegacyPresets(bb.storage.kv, (key, cause) =>
      warn({ key, cause: describeError(cause) }),
    );
    const pending = presets.filter(
      (preset) => !store.migratedPreset(preset.id),
    );
    if (pending.length > 0) {
      const catalog = await bb.sdk.theme.catalog();
      const created = new Set<string>();
      for (const preset of pending) migratePreset(catalog, preset, created);
    }
    await bb.storage.kv.set(MIGRATION_FLAG, true);
    bb.log.info(
      JSON.stringify({ operation: OPERATION, migrated: pending.length }),
    );
  } catch (cause) {
    // Left unflagged on purpose: the next start resumes with the presets not yet migrated.
    warn({ cause: describeError(cause) });
  }
}
