import { createHash } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";

const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
const SELECTION_ERROR =
  "The theme selection could not be confirmed. Try again.";

export type ThemeApi = BbPluginApi["sdk"]["theme"];
export type Appearance = Awaited<ReturnType<ThemeApi["get"]>>;
export type ThemeCatalog = Awaited<ReturnType<ThemeApi["catalog"]>>;
export type AppearanceSnapshot = {
  appearance: Appearance;
  fingerprint: string;
};
export type SelectionResult =
  | { kind: "selected"; current: AppearanceSnapshot }
  | { kind: "conflict"; current: AppearanceSnapshot }
  | { kind: "unconfirmed"; current: AppearanceSnapshot; message: string };

export function appearanceFingerprint(appearance: Appearance): string {
  const value = JSON.stringify([
    appearance.themeId,
    appearance.faviconColor,
    appearance.customCss,
    appearance.resolvedCodeTheme,
  ]);
  return createHash(HASH_ALGORITHM).update(value).digest(HASH_ENCODING);
}

export function createAppearanceAdapter(theme: ThemeApi) {
  async function read(): Promise<AppearanceSnapshot> {
    const appearance = await theme.get();
    return { appearance, fingerprint: appearanceFingerprint(appearance) };
  }
  return {
    read,
    catalog: (): Promise<ThemeCatalog> => theme.catalog(),
    async select(
      themeId: string,
      fingerprint: string,
    ): Promise<SelectionResult> {
      const previous = await read();
      if (previous.fingerprint !== fingerprint)
        return { kind: "conflict", current: previous };
      // BB has no CAS argument; this guards visible changes, not concurrent Settings writes.
      let message = SELECTION_ERROR;
      try {
        await theme.set({
          themeId,
          faviconColor: previous.appearance.faviconColor,
        });
      } catch (error) {
        if (error instanceof Error) message = error.message;
      }
      const current = await read();
      if (current.appearance.themeId !== themeId)
        return { kind: "unconfirmed", current, message };
      return { kind: "selected", current };
    },
  };
}
