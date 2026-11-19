/**
 * Server-side questions about bb's theme catalog that need more than the id
 * rules in ids.ts: which ids a new theme may not take.
 */
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { themeFolderExists } from "./files.ts";
import { themeKind } from "./ids.ts";
import type { ThemeStore } from "./theme-store.ts";

/** bb's theme catalog as the SDK reports it. */
export type Catalog = Awaited<
  ReturnType<BbPluginApi["sdk"]["theme"]["catalog"]>
>;

/**
 * Ids a new theme may not take: any id bb knows, ids made earlier in the
 * same run (`extra`), ids whose versions outlive a deleted theme, and
 * folders bb does not list yet. Compared case-blind because the theme
 * folder may live on a case-insensitive disk.
 */
export function takenIn(
  catalog: Catalog,
  store: ThemeStore,
  extra: Set<string> = new Set(),
) {
  const lower = {
    custom: [...catalog.custom, ...extra].map((id) => id.toLowerCase()),
    plugins: catalog.plugins.map((theme) => ({ id: theme.id.toLowerCase() })),
  };
  // Versions left by a deleted theme stay recoverable, so its id is not handed to a new one; an unlisted folder still occupies its name.
  return (id: string) =>
    themeKind(lower, id.toLowerCase()) !== "missing" ||
    store.hasVersions(id) ||
    themeFolderExists(catalog.dir, id);
}
