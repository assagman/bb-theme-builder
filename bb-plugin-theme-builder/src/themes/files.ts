/**
 * The only code that touches bb's custom theme directory. Every entry point
 * validates the id, refuses symlinks and non-directory roots, caps sizes,
 * and never deletes recursively, because the directory belongs to the user.
 */
import { createHash, randomUUID } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";
import {
  CUSTOM_THEME_ID_PATTERN,
  MAX_THEME_CSS_BYTES as MAX_CSS_BYTES,
} from "./ids.ts";

const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const CSS_FILE_NAME = "theme.css";
const TEMP_PREFIX = ".theme.css.";
const TEMP_SUFFIX = ".tmp";
const ENCODING = "utf8";
const HASH_ALGORITHM = "sha256";
const HASH_ENCODING = "hex";
const ALREADY_EXISTS = "EEXIST";
const NOT_FOUND = "ENOENT";
// Non-blocking so a FIFO or device planted as theme.css cannot hang the server; fstat then refuses it.
const SAFE_READ =
  constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK;
const EXCLUSIVE_WRITE =
  constants.O_CREAT |
  constants.O_EXCL |
  constants.O_WRONLY |
  constants.O_NOFOLLOW;
const MESSAGES = {
  id: "Invalid custom theme id",
  size: "Theme CSS exceeds the size limit",
  root: "Theme directory must be an absolute, non-symlink directory",
  directory: "Theme folder is not a plain directory",
  file: "theme.css is not a plain file within the size limit",
  extra: "Theme folder holds files other than theme.css",
};

/** A refused or failed theme file operation, with the id and step needed to diagnose it. */
export class ThemeFileError extends Error {
  // Fields rather than parameter properties, which Node's type stripping cannot run.
  readonly operation: string;
  readonly themeId: string;
  constructor(
    operation: string,
    themeId: string,
    message: string,
    cause?: unknown,
  ) {
    super(`${operation} ${themeId}: ${message}`, { cause });
    this.name = "ThemeFileError";
    this.operation = operation;
    this.themeId = themeId;
  }
}

/** Content hash the page sends back on Overwrite, so a file changed elsewhere is never silently replaced. */
export function cssHash(css: string): string {
  return createHash(HASH_ALGORITHM).update(css, ENCODING).digest(HASH_ENCODING);
}

/** Canonical root after proving it is a real directory; created on first use like bb does. */
function themeRoot(operation: string, id: string, root: string): string {
  if (!isAbsolute(root)) throw new ThemeFileError(operation, id, MESSAGES.root);
  try {
    mkdirSync(root, { mode: DIRECTORY_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== ALREADY_EXISTS) throw error;
  }
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new ThemeFileError(operation, id, MESSAGES.root);
  return realpathSync(root);
}

function checkInput(operation: string, id: string, css?: string) {
  if (!CUSTOM_THEME_ID_PATTERN.test(id))
    throw new ThemeFileError(operation, id, MESSAGES.id);
  if (css !== undefined && Buffer.byteLength(css, ENCODING) > MAX_CSS_BYTES)
    throw new ThemeFileError(operation, id, MESSAGES.size);
}

/** The theme's folder, or null when it does not exist; a symlink or file in its place is refused. */
function existingFolder(operation: string, root: string, id: string) {
  checkInput(operation, id);
  const folder = join(themeRoot(operation, id, root), id);
  let stat: ReturnType<typeof lstatSync>;
  try {
    stat = lstatSync(folder);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === NOT_FOUND) return null;
    throw error;
  }
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new ThemeFileError(operation, id, MESSAGES.directory);
  return folder;
}

/** Writes and syncs through a descriptor the caller opened, closing it on every path. */
function writeDescriptor(descriptor: number, css: string) {
  try {
    writeFileSync(descriptor, css, ENCODING);
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/** Current theme.css and its hash, or null when the theme has no folder or file. */
export function readThemeFile(
  root: string,
  id: string,
): { css: string; hash: string } | null {
  const operation = "read";
  const folder = existingFolder(operation, root, id);
  if (folder === null) return null;
  let descriptor: number;
  try {
    descriptor = openSync(join(folder, CSS_FILE_NAME), SAFE_READ);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === NOT_FOUND) return null;
    throw new ThemeFileError(operation, id, MESSAGES.file, error);
  }
  try {
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size > MAX_CSS_BYTES)
      throw new ThemeFileError(operation, id, MESSAGES.file);
    const css = readFileSync(descriptor, ENCODING);
    checkInput(operation, id, css);
    return { css, hash: cssHash(css) };
  } finally {
    closeSync(descriptor);
  }
}

/**
 * True when anything (folder, file, or link) already holds this id's place,
 * including folders bb does not list because they have no theme.css yet, so
 * a new id never collides with them. lstat follows the disk's own case rules.
 */
export function themeFolderExists(root: string, id: string): boolean {
  const operation = "exists";
  checkInput(operation, id);
  try {
    lstatSync(join(themeRoot(operation, id, root), id));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === NOT_FOUND) return false;
    throw new ThemeFileError(operation, id, MESSAGES.directory, error);
  }
}

/** Creates a new theme; exclusive at both levels so an existing theme is never replaced by Save as new. */
export function createThemeFile(root: string, id: string, css: string): void {
  const operation = "create";
  checkInput(operation, id, css);
  const folder = join(themeRoot(operation, id, root), id);
  mkdirSync(folder, { mode: DIRECTORY_MODE });
  writeDescriptor(
    openSync(join(folder, CSS_FILE_NAME), EXCLUSIVE_WRITE, FILE_MODE),
    css,
  );
}

/**
 * Replaces theme.css atomically: a fresh temp file in the same folder,
 * synced, then renamed over the old one, so bb never reads half a theme.
 */
export function replaceThemeFile(root: string, id: string, css: string): void {
  const operation = "replace";
  checkInput(operation, id, css);
  const folder = existingFolder(operation, root, id);
  if (folder === null)
    throw new ThemeFileError(operation, id, MESSAGES.directory);
  const temp = join(folder, `${TEMP_PREFIX}${randomUUID()}${TEMP_SUFFIX}`);
  try {
    writeDescriptor(openSync(temp, EXCLUSIVE_WRITE, FILE_MODE), css);
    renameSync(temp, join(folder, CSS_FILE_NAME));
  } catch (error) {
    try {
      unlinkSync(temp);
    } catch (cleanup) {
      if ((cleanup as NodeJS.ErrnoException).code !== NOT_FOUND)
        throw new ThemeFileError(operation, id, MESSAGES.file, [
          error,
          cleanup,
        ]);
    }
    throw new ThemeFileError(operation, id, MESSAGES.file, error);
  }
}

/** Deletes a theme only when its folder holds nothing but theme.css: one unlink, one rmdir, never recursive. */
export function removeThemeFile(root: string, id: string): void {
  const operation = "remove";
  const folder = existingFolder(operation, root, id);
  if (folder === null) return;
  const entries = readdirSync(folder);
  if (entries.some((entry) => entry !== CSS_FILE_NAME))
    throw new ThemeFileError(operation, id, MESSAGES.extra);
  const file = join(folder, CSS_FILE_NAME);
  if (entries.length > 0) {
    if (!lstatSync(file).isFile())
      throw new ThemeFileError(operation, id, MESSAGES.file);
    unlinkSync(file);
  }
  rmdirSync(folder);
}
