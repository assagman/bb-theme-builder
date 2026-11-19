/**
 * Server side of the theme dropdown: lists bb's themes, reads one for the
 * editor, and saves the edited copy by overwriting it or as a new theme,
 * with undo/redo over saved versions. All writes run one at a time so a
 * history step and its file write can never interleave with another save.
 */
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { describeError } from "../shared/describe-error.ts";
import { createSerialExecutor } from "../shared/serial.ts";
import { draftSchema } from "../theme/schema.ts";
import type { ThemeDraft } from "../theme/tokens.ts";
import { type Catalog, takenIn } from "./catalog.ts";
import type {
  HistoryView,
  RepaintResult,
  SaveOutcome,
  ThemeFailure,
  ThemeList,
  ThemeView,
} from "./contract.ts";
import {
  createThemeFile,
  cssHash,
  readThemeFile,
  removeThemeFile,
  replaceThemeFile,
} from "./files.ts";
import {
  ANY_THEME_ID_PATTERN,
  BUILTIN_THEME_IDS,
  LEGACY_REVISION_PATTERN,
  MAX_LISTED_THEMES,
  MAX_PLUGIN_NAME_LENGTH,
  themeKind,
  uniqueThemeId,
} from "./ids.ts";
import { THEME_MESSAGES } from "./messages.ts";
import { buildCopyCss } from "./theme-css.ts";
import type { ThemeStore } from "./theme-store.ts";

/** The part of the appearance service a save needs: repainting the theme bb is using. */
export type Repainter = {
  repaint: (
    themeId: string,
    css: string,
    previousCss: string | null,
  ) => Promise<RepaintResult>;
};

const conflict = (message: string): ThemeFailure => ({
  kind: "conflict",
  message,
});

export function createThemeService(
  bb: BbPluginApi,
  appearance: Repainter,
  store: ThemeStore,
) {
  const serial = createSerialExecutor();
  const warn = (fields: Record<string, unknown>) =>
    bb.log.warn(JSON.stringify(fields));

  /** The file of a theme the plugin may read, or null for any other kind or a theme without a file. */
  function fileOf(catalog: Catalog, id: string) {
    return themeKind(catalog, id) === "custom"
      ? readThemeFile(catalog.dir, id)
      : null;
  }

  /**
   * Reports what landed on disk and repaints bb when the theme is in use; a
   * repaint failure never turns a save into a failure. `previousCss` is the
   * file before the write, which the restore record was taken against.
   */
  async function saved(
    catalog: Catalog,
    id: string,
    previousCss: string | null,
  ): Promise<SaveOutcome> {
    const file = readThemeFile(catalog.dir, id);
    if (file === null) return conflict(THEME_MESSAGES.missing);
    let repaint: RepaintResult = "unconfirmed";
    try {
      repaint = await appearance.repaint(id, file.css, previousCss);
    } catch (cause) {
      warn({ operation: "repaint", themeId: id, cause: describeError(cause) });
    }
    const owned = store.owned().has(id);
    return {
      kind: "saved",
      theme: { kind: "custom", id, ...file, owned },
      repaint,
    };
  }

  /** One boundary per write: runs it alone, and turns any thrown error into a logged, user-safe failure. */
  function guarded(
    operation: string,
    id: string,
    action: () => Promise<SaveOutcome>,
  ): Promise<SaveOutcome> {
    return serial.run(async () => {
      const started = Date.now();
      try {
        return await action();
      } catch (cause) {
        warn({
          operation,
          themeId: id,
          elapsedMs: Date.now() - started,
          cause: describeError(cause),
        });
        return { kind: "failed", message: THEME_MESSAGES.failed };
      }
    });
  }

  /** Reads a theme about to be written, storing the disk file in history first so nothing is lost. */
  async function current(id: string) {
    const catalog = await bb.sdk.theme.catalog();
    const kind = themeKind(catalog, id);
    const file = fileOf(catalog, id);
    if (file !== null) store.sync(id, file.css, file.hash);
    return { catalog, kind, file };
  }

  function step(id: string, delta: -1 | 1) {
    return guarded(delta < 0 ? "undo" : "redo", id, async () => {
      const { catalog, file } = await current(id);
      if (file === null) return conflict(THEME_MESSAGES.missing);
      const target = store.neighbour(id, delta);
      if (target === null)
        return conflict(
          delta < 0 ? THEME_MESSAGES.noUndo : THEME_MESSAGES.noRedo,
        );
      replaceThemeFile(catalog.dir, id, target.css);
      store.moveTo(id, target.seq);
      return saved(catalog, id, file.css);
    });
  }

  return {
    list: () =>
      serial.run(async (): Promise<ThemeList> => {
        const catalog = await bb.sdk.theme.catalog();
        const activeId = catalog.active.themeId;
        const owned = store.owned();
        const custom = catalog.custom
          .filter(
            (id) =>
              themeKind(catalog, id) === "custom" &&
              (!LEGACY_REVISION_PATTERN.test(id) || id === activeId),
          )
          .sort()
          .slice(0, MAX_LISTED_THEMES)
          .map((id) => ({ id, owned: owned.has(id) }));
        const plugins = catalog.plugins
          .filter((theme) => ANY_THEME_ID_PATTERN.test(theme.id))
          .slice(0, MAX_LISTED_THEMES)
          .map((theme) => ({
            id: theme.id,
            name: theme.name.slice(0, MAX_PLUGIN_NAME_LENGTH),
          }));
        return { activeId, builtin: [...BUILTIN_THEME_IDS], custom, plugins };
      }),
    async get({ id }: { id: string }): Promise<ThemeView> {
      const catalog = await bb.sdk.theme.catalog();
      const kind = themeKind(catalog, id);
      if (kind === "builtin") return { kind, id, name: id };
      if (kind === "plugin") {
        const name =
          catalog.plugins.find((theme) => theme.id === id)?.name ?? id;
        return { kind, id, name: name.slice(0, MAX_PLUGIN_NAME_LENGTH) };
      }
      if (kind !== "custom") return { kind, id };
      const file = readThemeFile(catalog.dir, id);
      if (file === null) return { kind: "missing", id };
      return { kind, id, ...file, owned: store.owned().has(id) };
    },
    overwrite: (input: {
      id: string;
      expectedHash: string;
      draft: ThemeDraft;
    }) =>
      guarded("overwrite", input.id, async () => {
        const { catalog, kind, file } = await current(input.id);
        // A custom theme without a file and one bb no longer lists are both gone; any other kind was never writable.
        if (file === null)
          return conflict(
            kind === "custom" || kind === "missing"
              ? THEME_MESSAGES.missing
              : THEME_MESSAGES.notCustom,
          );
        if (file.hash !== input.expectedHash)
          return conflict(THEME_MESSAGES.conflict);
        const css = buildCopyCss(file.css, draftSchema.parse(input.draft));
        // Written before it is recorded: if recording fails, the next sync stores the file anyway.
        replaceThemeFile(catalog.dir, input.id, css);
        store.sync(input.id, css, cssHash(css));
        return saved(catalog, input.id, file.css);
      }),
    saveAs: (input: {
      name: string;
      sourceId: string | null;
      draft: ThemeDraft;
    }) =>
      guarded("saveAs", input.name, async () => {
        const catalog = await bb.sdk.theme.catalog();
        const source =
          input.sourceId === null ? null : fileOf(catalog, input.sourceId);
        const name = input.name.trim();
        const draft = draftSchema.parse({ ...input.draft, name });
        const css = buildCopyCss(source?.css ?? null, draft);
        const id = uniqueThemeId(name, takenIn(catalog, store));
        createThemeFile(catalog.dir, id, css);
        store.own(id);
        store.record(id, css, cssHash(css));
        return saved(catalog, id, null);
      }),
    /** Reads the file too, so the view reflects an outside change and the page can see its loaded hash is stale. */
    history: ({ id }: { id: string }) =>
      serial.run(async (): Promise<HistoryView> => {
        const catalog = await bb.sdk.theme.catalog();
        return store.view(id, fileOf(catalog, id));
      }),
    undo: ({ id }: { id: string }) => step(id, -1),
    redo: ({ id }: { id: string }) => step(id, 1),
    remove: ({ id }: { id: string }) =>
      serial.run(async (): Promise<{ kind: "deleted" } | ThemeFailure> => {
        try {
          const catalog = await bb.sdk.theme.catalog();
          if (themeKind(catalog, id) !== "custom")
            return conflict(THEME_MESSAGES.missing);
          if (!store.owned().has(id)) return conflict(THEME_MESSAGES.notOwned);
          if (catalog.active.themeId === id)
            return conflict(THEME_MESSAGES.active);
          // The final file becomes a version first, so a delete can be recovered from the database.
          const file = readThemeFile(catalog.dir, id);
          if (file !== null) store.sync(id, file.css, file.hash);
          removeThemeFile(catalog.dir, id);
          store.disown(id);
          return { kind: "deleted" };
        } catch (cause) {
          warn({
            operation: "delete",
            themeId: id,
            cause: describeError(cause),
          });
          return { kind: "failed", message: THEME_MESSAGES.deleteFailed };
        }
      }),
    /** Runs work on the same queue as every theme request, so the preset migration finishes before the first list. */
    exclusive: <T>(work: () => Promise<T>) => serial.run(work),
    close: serial.close,
  };
}
