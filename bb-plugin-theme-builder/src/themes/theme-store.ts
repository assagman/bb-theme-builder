/**
 * Everything the plugin keeps about bb's themes in its own SQLite database:
 * saved versions of custom themes (undo/redo), which themes it owns, and the
 * ledger of presets already migrated. SQLite because 6 full theme files per
 * theme outgrow a KV value, and because each step must be one transaction.
 */
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { HistoryView } from "./contract.ts";

type Storage = BbPluginApi["storage"];
type Database = ReturnType<Storage["database"]>;

/** Saved versions kept before the current one; the newest is the current file. */
export const HISTORY_STEPS = 5;
// Append-only: bb records each statement's hash, so shipped entries are never edited or reordered.
const MIGRATIONS = [
  "CREATE TABLE theme_versions (theme_id TEXT NOT NULL, seq INTEGER NOT NULL, css TEXT NOT NULL, sha256 TEXT NOT NULL, saved_at TEXT NOT NULL, PRIMARY KEY (theme_id, seq))",
  "CREATE TABLE theme_history (theme_id TEXT PRIMARY KEY, position INTEGER NOT NULL)",
  "CREATE TABLE theme_owned (theme_id TEXT PRIMARY KEY, created_at TEXT NOT NULL)",
  "CREATE TABLE preset_migrations (preset_id TEXT PRIMARY KEY, theme_id TEXT NOT NULL)",
];
// A theme's first stored version; later ones count up from here.
const FIRST_SEQ = 1;

/** One stored version of a theme file. */
export type ThemeVersion = { seq: number; css: string; sha256: string };

export function createThemeStore(storage: Storage) {
  // Migrated per handle, because the host reopens the database after a reload.
  const migrated = new WeakSet<Database>();
  function db(): Database {
    const handle = storage.database();
    if (!migrated.has(handle)) {
      storage.migrate(handle, MIGRATIONS);
      migrated.add(handle);
    }
    return handle;
  }
  const now = () => new Date().toISOString();

  function position(id: string): number | null {
    const row = db()
      .prepare("SELECT position FROM theme_history WHERE theme_id = ?")
      .get(id) as { position: number } | undefined;
    return row?.position ?? null;
  }
  function version(id: string, seq: number): ThemeVersion | null {
    const row = db()
      .prepare(
        "SELECT seq, css, sha256 FROM theme_versions WHERE theme_id = ? AND seq = ?",
      )
      .get(id, seq) as ThemeVersion | undefined;
    return row ?? null;
  }
  /** Makes `css` the newest version: drops any redo branch and trims beyond HISTORY_STEPS. */
  function append(id: string, css: string, sha256: string) {
    const handle = db();
    const at = position(id);
    const next = at === null ? FIRST_SEQ : at + 1;
    handle
      .prepare("DELETE FROM theme_versions WHERE theme_id = ? AND seq >= ?")
      .run(id, next);
    handle
      .prepare(
        "INSERT INTO theme_versions (theme_id, seq, css, sha256, saved_at) VALUES (?, ?, ?, ?, ?)",
      )
      .run(id, next, css, sha256, now());
    handle
      .prepare(
        "INSERT INTO theme_history (theme_id, position) VALUES (?, ?) ON CONFLICT(theme_id) DO UPDATE SET position = excluded.position",
      )
      .run(id, next);
    handle
      .prepare("DELETE FROM theme_versions WHERE theme_id = ? AND seq < ?")
      .run(id, next - HISTORY_STEPS);
  }

  /** Marks a theme as created by the plugin, the only kind it may delete. */
  function own(id: string) {
    db()
      .prepare(
        "INSERT OR IGNORE INTO theme_owned (theme_id, created_at) VALUES (?, ?)",
      )
      .run(id, now());
  }

  return {
    /**
     * Brings history in line with the file on disk before any change: the
     * first time it stores the file as version one; when the file was edited
     * outside the builder it stores that edit as a new version, so undo can
     * never lose it.
     */
    sync(id: string, css: string, sha256: string) {
      db().transaction(() => {
        const at = position(id);
        if (at !== null && version(id, at)?.sha256 === sha256) return;
        append(id, css, sha256);
      })();
    },
    /** Stores the file just written as the newest version. */
    record(id: string, css: string, sha256: string) {
      db().transaction(() => append(id, css, sha256))();
    },
    /** The version one step back (-1) or forward (+1), or null at either end. */
    neighbour(id: string, delta: -1 | 1): ThemeVersion | null {
      const at = position(id);
      return at === null ? null : version(id, at + delta);
    },
    moveTo(id: string, seq: number) {
      db()
        .prepare("UPDATE theme_history SET position = ? WHERE theme_id = ?")
        .run(seq, id);
    },
    /**
     * Undo and redo as they will behave for the file now on disk. When it
     * differs from the version at `position` (changed outside the builder),
     * the next step first stores it as a new version and drops any redo
     * branch, so Undo goes back to the version at `position`, Redo returns the
     * outside change afterwards, and nothing is redoable before that.
     */
    view(id: string, disk: { hash: string } | null): HistoryView {
      const hash = disk?.hash ?? null;
      const at = position(id);
      if (at === null)
        return {
          canUndo: false,
          canRedo: false,
          undoSteps: 0,
          redoSteps: 0,
          hash,
        };
      const count = (sql: string) =>
        (db().prepare(sql).get(id, at) as { n: number }).n;
      const changedOutside =
        disk !== null && version(id, at)?.sha256 !== disk.hash;
      const undoSteps = changedOutside
        ? Math.min(
            count(
              "SELECT COUNT(*) AS n FROM theme_versions WHERE theme_id = ? AND seq <= ?",
            ),
            HISTORY_STEPS,
          )
        : count(
            "SELECT COUNT(*) AS n FROM theme_versions WHERE theme_id = ? AND seq < ?",
          );
      const redoSteps = changedOutside
        ? 0
        : count(
            "SELECT COUNT(*) AS n FROM theme_versions WHERE theme_id = ? AND seq > ?",
          );
      return {
        canUndo: undoSteps > 0,
        canRedo: redoSteps > 0,
        undoSteps,
        redoSteps,
        hash,
      };
    },
    /** True when versions remain from a deleted theme, so a new theme does not inherit its undo trail. */
    hasVersions(id: string): boolean {
      return position(id) !== null;
    },
    own,
    disown(id: string) {
      db().prepare("DELETE FROM theme_owned WHERE theme_id = ?").run(id);
    },
    owned(): Set<string> {
      const rows = db().prepare("SELECT theme_id FROM theme_owned").all() as {
        theme_id: string;
      }[];
      return new Set(rows.map((row) => row.theme_id));
    },
    migratedPreset(presetId: string): boolean {
      return (
        db()
          .prepare("SELECT 1 FROM preset_migrations WHERE preset_id = ?")
          .get(presetId) !== undefined
      );
    },
    /** One transaction, so a migrated preset is owned, versioned and marked done together. */
    adoptMigrated(presetId: string, themeId: string, css: string, sha: string) {
      const handle = db();
      handle.transaction(() => {
        own(themeId);
        append(themeId, css, sha);
        handle
          .prepare(
            "INSERT INTO preset_migrations (preset_id, theme_id) VALUES (?, ?)",
          )
          .run(presetId, themeId);
      })();
    },
  };
}
/** The plugin database handle for themes, passed to the service and the preset migration. */
export type ThemeStore = ReturnType<typeof createThemeStore>;
