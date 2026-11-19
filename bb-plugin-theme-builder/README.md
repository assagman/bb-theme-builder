# Theme Builder

Create independent light and dark palettes from **Theme Builder** in bb’s
sidebar.
Draft colors appear only inside the sandboxed **Preview**. The editor uses the
host
theme, so draft colors cannot hide its controls. The preview is a representative
fixture, not a bb session.

## Use

1. Start with **Neutral starter**, or select a saved preset. Choose **Light** or
   **Dark**, edit colors and fonts, and expand **Advanced colors** for secondary
   text, status, and diff colors.
2. Check **Text contrast** for both modes. Warnings name foreground/background
pairs
below 4.5:1; these checks do not certify the whole application’s accessibility.
3. **Save** persists without changing appearance. **Duplicate** creates a local
copy;
   save it to retain it. Edit names before saving. Switching presets asks before
discarding dirty edits. Browser reload can discard unsaved edits; saved presets
   survive server restart.
4. **Apply** saves the valid draft and activates a new immutable revision.
**Applies to all bb windows.** Each window keeps its light/dark preference and
   the favicon selection is preserved.
5. **Restore previous theme** reselects the palette immediately before the
latest
   successful Apply. If appearance changed elsewhere, restore refuses;
   **Refresh appearance** lets you review the current selection. If a custom or
   plugin theme's source files changed after Apply, Restore leaves appearance
   unchanged and offers the explicit default-theme fallback.
6. **Export JSON** and **Export CSS** download the saved revision, even with
newer
   unsaved edits. JSON contains schema version, name, palettes, and font keys;
   neither download includes server paths, IDs, or timestamps in its content.

Narrow layouts use **Edit** and **Preview** tabs. Hex text fields offer a
keyboard
alternative to native color pickers. All colors are opaque six-digit hex; fonts
are
fixed local/system stacks whose availability varies by OS. No preview resources
or
fonts are downloaded.

Code syntax retains bb’s default `pierre-light` /`pierre-dark` fallback. The
plain code
sample demonstrates font choice; accent does not rewrite syntax colors.
Diff/status
controls set public semantic tokens. Syntax editing, terminal ANSI colors, CSS
import,
and plugin-package export are outside v1.

## Randomize with an LLM

Open **AI theme randomizer**, choose a provider/model with bb’s picker, and
click
**Randomize**. Your model and reasoning selection is remembered in this browser.
The provider must already be configured in bb; normal provider usage charges and
limits apply. Leave **Optional accent hex** blank for a new color direction, or
enter a six-digit hex such as `#7c3aed` to keep that exact accent in both modes.

Generation replaces only the draft’s light/dark colors, preserving its name and
fonts. Review Preview and Text contrast, then Save or Apply explicitly. **Undo
randomization** restores the draft from before the latest successful generation,
including unsaved edits. Selecting, duplicating, or deleting a preset clears
Undo.
Cancel and errors leave the draft intact. Navigating away or a layout remount
during
generation cancels the request; completed drafts and Undo survive compact-layout
remounts. Reload still discards unsaved drafts.

The public SDK has no general inference call. Generation uses a temporary
personal
bb thread with the chosen model and `accept-edits` permissions, a text-only
prompt,
and no project source or draft data supplied by the plugin. It asks the model
not
to use tools, but this is a normal bb agent session, not a tool-free sandbox:
bb’s
configured instructions and provider permissions still apply. Approval requests
stop generation rather than being approved automatically. The thread is archived
after completion; its prompt and response remain in bb’s history. Each request
has a three-minute deadline, and only one generation runs per plugin instance.
Stopping or archiving can fail if the server or host is unavailable. Each
cleanup
step has a five-second limit. Cleanup failures are logged with the thread ID and
never discard completed output. Inspect and stop remaining threads through bb.
A stalled transport cannot keep generation marked as running after its deadline.
Completed results remain available across requests for up to ten minutes, with
at most 32 requests retained per plugin instance. After a server crash, inspect
any remaining
**Theme Builder palette generation** thread before retrying.

Responses are bounded and validated as palette JSON; model CSS, HTML, extra
keys,
and incomplete palettes are rejected. A fresh variation seed encourages
diversity
but cannot guarantee unique or accessible results. Contrast warnings remain the
review mechanism. No additional dependencies, provider credentials, or API-key
settings are introduced by Theme Builder.

## Install and build

Current browser verification uses bb **0.43.0** with public Plugin SDK
**0.4.47**.
The SDK pin and engine ranges come from the original bb 0.42.1 scaffold. Use a
disposable development server first.
This repository has not been published to a marketplace.

From this package directory, after reviewing the locked dependencies:

```sh
npm ci --ignore-scripts
npm run lint
npm run typecheck
npm test
npm run build
bb plugin install .
```

The bb commands use your configured data directory. For development, explicitly
set
`BB_DATA_DIR` , `BB_SERVER_URL` , and `BB_HOST_DAEMON_PORT` to the disposable
instance
for **every** bb command. First build can install bb’s pinned esbuild/Tailwind
toolchain there; approve that download separately. `bb plugin new` scaffolds and
installs packages, so do not use it as an inspection command.

Tests use Node’s built-in runner and the SDK harness. Node 24 LTS or newer with
TypeScript stripping is suitable. The packaged desktop runtime can have a
different
native SQLite ABI from shell Node; use the packaged runtime to start a
development
copy of the packaged server.

The npm lockfile records the scaffold dependency graph. `.npmrc` requests a
seven-day
minimum release age on supporting npm versions. Review advisories before
dependency
changes; run `npm audit` and the public-import test alongside typecheck/build. A
clean
audit is an advisory check, not a security guarantee. The editor and browser
journey
introduce no additional runtime libraries.

## Recovery and retention

A failed theme-file write leaves appearance unchanged. If saving succeeds but
Apply
fails, the editor says the preset was saved. If activation is uncertain, refresh
appearance; persisted pending operations reconcile against the actual selected
CSS
and code-theme identity. Success requires selection readback.

A missing or changed previous theme produces a separate **Use default theme**
action.
Existing custom-theme recovery records without a source fingerprint also require
this explicit fallback. Built-in recovery records remain compatible. Restore
never silently picks default or overwrites an already-observed external
selection.
A changed favicon is preserved after refreshing the observation. For load/build
failures, inspect `bb plugin list` and `bb plugin logs theme-builder` , correct
the
reported error, then use `bb plugin reload theme-builder` . If the page opens
before
plugin startup completes, use **Refresh appearance** once it is running. Normal
bb theme settings
remain available independently. Save completion and pending-operation locks
survive
compact-layout remounts, so a delayed save cannot create a second preset.

Presets live independently in plugin KV: maximum 100 presets, 80-character
names,
32 KB per preset, schema version 1. Saves/deletes serialize within the plugin
and
compare revisions; conflicts preserve the client’s draft. Teardown drains queued
operations. No additional database or worker is created.

Each Apply creates a unique directory under the **server’s catalog-reported
theme
directory**. Display names never enter paths. Existing paths and symlinks are
refused;
complete CSS is written before selection. Theme IDs stay within 64 characters.
Files
are independent of the plugin manifest and survive disabling the builder.
Deleting
a preset retains generated artifacts and restore targets. No automatic pruning:
disk use grows by one small CSS file and directory per Apply, including possible
unselected artifacts after failures. Do not remove a selected or needed restore
theme.

`bb.sdk.theme.set({ themeId, faviconColor })` has **no atomic
compare-and-swap**.
Read-before-write detects visible changes, but another Settings/CLI operation
can
race between the check and selection. The plugin serializes its own operations;
it cannot lock other appearance writers. Preview derivations and builtin restore
availability are verified against 0.42.1 and need rechecking on upgrades. As
full-trust
local code, filesystem checks cannot exclude a hostile OS process replacing
ancestor
directories during an operation.

## Browser verification

`tests/theme-builder.e2e.ts` drives the real built plugin using Chrome DevTools
Protocol and Node’s WebSocket implementation, without a new browser dependency.
Start a clean Chrome debug session and a separate bb server with its own
temporary
data directory and ports; build and install the plugin there. Then run:

```sh
BB_THEME_TEST_URL=http://127.0.0.1:48986 \
BB_THEME_TEST_DATA_DIR=/tmp/bb-theme-builder-dev \
BB_THEME_TEST_DAEMON_PORT=48987 \
BB_THEME_TEST_CDP=ws://127.0.0.1:DEBUG_PORT/devtools/browser/SESSION_ID \
BB_THEME_TEST_ARTIFACTS=/tmp/theme-builder-evidence \
node tests/theme-builder.e2e.ts
```

Replace the debug URL with the actual endpoint. The script refuses non-loopback
endpoints and non-temporary data directories, then verifies the server’s actual
theme directory. It creates test presets/artifacts, changes disposable
appearance,
and restores the initial selection on exit. Use a fresh artifact directory per
run.
Do not point it at production.

The journey covers both modes, isolated edits without network requests,
save/reload,
competing clients, immutable Apply, Restore, external changes, disable/enable,
downloads, preview/host token parity, compact layout, and keyboard focus.
Screenshots
and a JSON report stay outside Git. To verify restart, apply a saved preset,
stop
only the disposable server, restart with the same data directory, reopen the
preset,
refresh appearance, verify the selected palette and both modes, then Restore.

No production instance, package installation, theme selection, or data was used
for
development testing. Development and checked delivery use `main` directly. Local
hooks and all checks
must pass before a push. Publishing and production installation require separate
approval.
See the [contributor guide](../README.md#development) for hook setup and
delivery gates.

With the same disposable instance and `BB_THEME_TEST_*` environment, run
`node tests/randomizer.e2e.ts` to exercise real model selection, preference
reload,
accent-locked and unrestricted LLM generations, Save/Apply/Restore, Undo,
compact
layout, cancellation, and unavailable-model recovery. This test sends actual LLM
requests through a configured provider. Unit tests cover malformed output,
strict
RPC validation, request coalescing, timeout, and thread cleanup failures.
