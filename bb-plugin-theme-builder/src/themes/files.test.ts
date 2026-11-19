import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { createThemeFile } from "./files.ts";

const FIXTURE = {
  prefix: "theme-builder-files-",
  id: "theme-builder-0123456789ab-r1-abcdef012345",
  css: ":root, .light { --canvas: #ffffff; }\n.dark { --canvas: #101010; }\n",
  outside: "outside",
};

test("creates a complete theme and refuses to overwrite it", () => {
  const root = mkdtempSync(join(tmpdir(), FIXTURE.prefix));
  try {
    createThemeFile(root, FIXTURE.id, FIXTURE.css);
    assert.equal(
      readFileSync(join(root, FIXTURE.id, "theme.css"), "utf8"),
      FIXTURE.css,
    );
    assert.throws(() => createThemeFile(root, FIXTURE.id, FIXTURE.css));
    assert.equal(
      readFileSync(join(root, FIXTURE.id, "theme.css"), "utf8"),
      FIXTURE.css,
    );
  } finally {
    rmSync(root, { recursive: true });
  }
});

test("rejects traversal and symlinked theme directories", () => {
  const root = mkdtempSync(join(tmpdir(), FIXTURE.prefix));
  const outside = mkdtempSync(join(tmpdir(), FIXTURE.outside));
  try {
    assert.throws(() => createThemeFile(root, "../escape", FIXTURE.css));
    symlinkSync(outside, join(root, FIXTURE.id));
    assert.throws(() => createThemeFile(root, FIXTURE.id, FIXTURE.css));
    assert.throws(() => readFileSync(join(outside, "theme.css")));
  } finally {
    rmSync(root, { recursive: true });
    rmSync(outside, { recursive: true });
  }
});

test("rejects a symlinked theme root", () => {
  const root = mkdtempSync(join(tmpdir(), FIXTURE.prefix));
  const link = join(root, "linked");
  try {
    symlinkSync(root, link);
    assert.throws(() => createThemeFile(link, FIXTURE.id, FIXTURE.css));
  } finally {
    rmSync(root, { recursive: true });
  }
});
