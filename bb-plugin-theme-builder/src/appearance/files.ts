import {
  closeSync,
  constants,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { isAbsolute, join } from "node:path";

const THEME_ID_PATTERN =
  /^theme-builder-[a-f0-9]{12}-r[1-9][0-9]*-[a-f0-9]{12}$/;
const MAX_THEME_ID_LENGTH = 64;
const MAX_CSS_BYTES = 262144;
const DIRECTORY_MODE = 0o700;
const FILE_MODE = 0o600;
const CSS_FILE_NAME = "theme.css";
const ENCODING = "utf8";
const ALREADY_EXISTS = "EEXIST";
const INVALID_REVISION = "Invalid generated theme revision";
const INVALID_ROOT =
  "Theme directory must be an absolute, non-symlink directory";

export function writeThemeRevision(
  root: string,
  themeId: string,
  css: string,
): void {
  if (
    !THEME_ID_PATTERN.test(themeId) ||
    themeId.length > MAX_THEME_ID_LENGTH ||
    Buffer.byteLength(css, ENCODING) > MAX_CSS_BYTES
  ) {
    throw new Error(INVALID_REVISION);
  }
  if (!isAbsolute(root)) throw new Error(INVALID_ROOT);
  try {
    mkdirSync(root, { mode: DIRECTORY_MODE });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== ALREADY_EXISTS) throw error;
  }
  const stat = lstatSync(root);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error(INVALID_ROOT);
  const revision = join(realpathSync(root), themeId);
  // Exclusive creation keeps saved edits from mutating an active revision.
  mkdirSync(revision, { mode: DIRECTORY_MODE });
  const file = openSync(
    join(revision, CSS_FILE_NAME),
    constants.O_CREAT |
      constants.O_EXCL |
      constants.O_WRONLY |
      constants.O_NOFOLLOW,
    FILE_MODE,
  );
  try {
    writeFileSync(file, css, ENCODING);
    fsyncSync(file);
  } finally {
    closeSync(file);
  }
}
