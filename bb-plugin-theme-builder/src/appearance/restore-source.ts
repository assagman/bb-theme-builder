import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from "node:fs";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { ThemeCatalog } from "./adapter.ts";

const ENCODING = "utf8";
const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
const MAX_SOURCE_BYTES = 262144;
const CUSTOM_FILES = [
  "theme.css",
  "theme.json",
  "pierre-dark.json",
  "pierre-light.json",
];
const PACKAGE_FILE = "package.json";
const PLUGIN_THEME_PREFIX = "plugin:";
const THEME_ID_SEPARATOR = ":";
const CODE_THEME_SIDES = ["dark", "light"] as const;
const MISSING = "missing";

// Source identities prevent Restore from selecting an ID whose files changed after Apply.
function sourceFile(root: string, entry: string): string | null {
  const file = resolve(root, entry);
  const within = relative(root, file);
  if (!within || within.startsWith("..") || isAbsolute(within))
    throw new Error("Restore source escapes its root");
  let directory = dirname(file);
  while (true) {
    const stat = lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Unsafe restore source directory");
    if (directory === root) break;
    directory = dirname(directory);
  }
  let descriptor: number;
  try {
    descriptor = openSync(file, constants.O_RDONLY | constants.O_NOFOLLOW);
  } catch (cause) {
    if ((cause as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw cause;
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_SOURCE_BYTES)
      throw new Error("Invalid restore source file");
    const data = readFileSync(descriptor, ENCODING);
    if (Buffer.byteLength(data, ENCODING) > MAX_SOURCE_BYTES)
      throw new Error("Restore source grew beyond its limit");
    return data;
  } finally {
    closeSync(descriptor);
  }
}

function codeFiles(declaration: unknown): string[] {
  if (declaration === null || typeof declaration !== "object") return [];
  const values = declaration as Record<string, unknown>;
  return CODE_THEME_SIDES.flatMap((side) => {
    const value = values[side];
    return typeof value === "string" && value.endsWith(".json") ? [value] : [];
  });
}

// Only catalog-owned locations are read; missing or unsafe assets make recovery fail closed.
export async function restoreSourceFingerprint(
  bb: BbPluginApi,
  catalog: ThemeCatalog,
  themeId: string,
): Promise<string | null> {
  try {
    let root: string;
    let paths: string[];
    if (catalog.custom.includes(themeId)) {
      root = resolve(catalog.dir, themeId);
      if (dirname(root) !== resolve(catalog.dir)) return null;
      paths = [...CUSTOM_FILES];
      const manifest = sourceFile(root, CUSTOM_FILES[1]);
      if (manifest !== null)
        paths.push(...codeFiles(JSON.parse(manifest).codeTheme));
    } else {
      const theme = catalog.plugins.find((value) => value.id === themeId);
      if (theme === undefined) return null;
      const { plugins } = await bb.sdk.plugins.list();
      const plugin = plugins.find((value) => value.id === theme.pluginId);
      if (plugin === undefined || !isAbsolute(plugin.rootDir)) return null;
      root = resolve(plugin.rootDir);
      const manifest = sourceFile(root, PACKAGE_FILE);
      if (manifest === null) return null;
      const declaration = JSON.parse(manifest).bb?.themes?.find(
        (value: { id?: string }) =>
          `${PLUGIN_THEME_PREFIX}${theme.pluginId}${THEME_ID_SEPARATOR}${value.id}` ===
          themeId,
      );
      if (typeof declaration?.css !== "string") return null;
      paths = [
        PACKAGE_FILE,
        declaration.css,
        ...codeFiles(declaration.codeTheme),
      ];
    }
    const hash = createHash(HASH_ALGORITHM);
    for (const path of [...new Set(paths)].sort()) {
      hash.update(JSON.stringify([path, sourceFile(root, path) ?? MISSING]));
    }
    return hash.digest(HASH_ENCODING);
  } catch {
    return null;
  }
}
