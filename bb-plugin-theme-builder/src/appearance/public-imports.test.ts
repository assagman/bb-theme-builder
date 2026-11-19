import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { experimental_scanPublicSdkOnly } from "@get-bb/plugin-sdk/testing";

const PACKAGE_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MANIFEST = new URL("../../package.json", import.meta.url);
const REGEXP_CHARACTERS = /[.*+?^${}()|[\]\\]/g;
const ESCAPE_REPLACEMENT = "\\$&";
const HOST_RUNTIME_IMPORTS = [/^react(?:\/|$)/, /^react-dom(?:\/|$)/];

test("uses only the public SDK, host React runtime, and declared public packages", () => {
  const manifest = JSON.parse(readFileSync(MANIFEST, "utf8")) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };
  const allow = Object.keys({
    ...manifest.dependencies,
    ...manifest.devDependencies,
  }).map(
    (name) =>
      new RegExp(
        `^${name.replace(REGEXP_CHARACTERS, ESCAPE_REPLACEMENT)}(?:/|$)`,
      ),
  );
  const result = experimental_scanPublicSdkOnly(PACKAGE_ROOT, {
    allow: [...allow, ...HOST_RUNTIME_IMPORTS],
  });
  assert.deepEqual(result.privateDependencies, []);
  assert.deepEqual(result.violations, []);
});
