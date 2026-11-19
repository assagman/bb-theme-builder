# Theme Builder

Create independent light and dark themes from **Theme Builder** in bb’s
sidebar. Draft colors appear only inside the sandboxed **Preview**. The editor
uses the host theme, so draft colors cannot hide its controls. The preview is a
representative fixture, not a bb session.

## Page layout

The page has four parts. All of them work on one working copy of a theme.

- **Theme** is a dropdown at the top. It lists every bb theme in groups:
  **Built-in**, **Your themes**, and **Plugin themes**. The theme that bb uses
  now is marked **(in use)**. Pick a theme to open an editable copy of it.
  **Undo** and **Redo** beside it step through the saved versions of the open
  theme.
- **Three tabs** let you change the copy: **AI**, **Edit**, and
  **Randomize**. They all change the same draft. Switch tabs at any time.
- **Preview** shows the copy as a whole bb window: icon rail, sidebar,
  thread with composer, and a side panel. Choose **Light** or **Dark** to see
  each mode.
- **The action bar** is the one place to save. It shows the theme name and its
  state (**Unsaved changes**, **Saved**, **Built-in theme**, or **Plugin
  theme**). It has **Discard**, **Overwrite**, **Save as new…**, **Use
  theme**, and a **More actions** menu.

## Use

1. Pick a theme in the dropdown. The page opens on the theme bb uses now.
2. Change the copy.
   - **AI**: choose a model, describe the theme in plain words, and select
     **Generate**. Then keep talking to the agent to tweak the result. See
     [AI tab](#ai-tab).
   - **Edit**: change colors and fonts by hand. See [Edit tab](#edit-tab).
   - **Randomize**: get a full theme with one click. See
     [Randomize tab](#randomize-tab).
3. Check the result in **Preview**.
4. Save the copy.
   - **Overwrite** saves it over your own theme. It is there only for your
     custom themes, not for built-in or plugin themes.
   - **Save as new…** asks for a name and keeps the copy as a new theme. The
     theme’s file name is made from the name: lowercase letters, digits, and
     `-`. When the name is taken, the builder adds `-2`, `-3`, and so on. The
     working copy then belongs to the new theme.
5. Select **Use theme** to switch all bb windows to the saved theme.
6. **More actions** has **Delete**, **Export JSON**, **Export CSS**, and
   **Restore previous theme**.

Picking another theme, **Undo**, or **Redo** asks before it discards unsaved
edits. Saving never changes appearance by itself, except that an
**Overwrite**, **Undo**, or **Redo** of the theme in use repaints bb at once.
Each window keeps its light/dark preference, and the favicon selection stays.

### Copies keep the theme’s own CSS

A copy of your own theme keeps its CSS exactly as written. The builder reads
the colors from its top-level `:root`, `.light`, and `.dark` rules, in source
order. It understands `#rgb` and `#rrggbb` values; other forms keep the
Neutral value in the editor. A save appends one block marked
`/* theme-builder:edits */` with only the values you changed, per mode. A
light edit never applies in dark mode, so a dark value the builder cannot read
stays as it is. Each later save replaces that block and keeps any CSS you
wrote after it, so a theme never has more than one. A marker that is not
followed by the builder's own rules is treated as your CSS and kept. When
other rules of a theme style parts of bb directly, the page says so: those
parts may not follow your edits. A custom theme whose folder name the builder
cannot use opens as a Neutral copy, and the page says so.

bb does not expose the colors of built-in and plugin themes, so their copies
start from Neutral, and the page says so. Save such a copy as a new theme.

### Undo and redo

**Overwrite**, **Undo**, and **Redo** keep up to five saved versions before
the current one, per theme. **Undo** writes the previous saved version back to
the theme file; **Redo** goes forward again. A new save after an undo drops
the versions ahead of it. If the theme file was edited outside the builder,
the builder first keeps that edit as a version, so an undo never loses it:
**Undo** goes back to your last save and **Redo** returns the outside edit.
When the page notices such an edit, it says so and offers **Reload theme**. The
buttons are off, with a reason, for built-in and plugin themes and when there
is nothing to step to.

### Delete

**Delete** removes only themes made in the builder: with **Save as new** or by
the move of older saved themes. It never deletes the theme in use and asks
first. The last version stays in the builder’s history.

### Themes from older versions

Older versions of the builder kept saved themes inside the plugin. On the first
start, each of them becomes a bb theme under a file name made from its name.
This happens once and does not change appearance. The old copies stay inside
the plugin as a backup.

### Unsaved changes survive a reload

This browser keeps your unsaved draft. After a reload, the page restores it and
shows a notice such as “Restored unsaved changes to …”. The notice has a
**Discard** button that drops the restored edits. If the original theme was
deleted in another window, the edits come back with the notice that says so;
save them as a new theme. If the theme file changed since the edits started,
**Overwrite** refuses, so the newer file is never replaced silently. If the
browser cannot store the draft, the page tells you. Save the theme to keep it
for good. Saved themes survive a server restart.

### Edit tab

The tab lists every bb color token. Each row shows a plain name and the
`--token` name that a `theme.css` file uses. **Find a color** filters the
rows by either name. Colors are in groups: **Basics**, **Sidebar**, **Text**,
**Status**, **Code & git**, **Surfaces**, **Borders & lines**, **Hover,
selection & focus**, and **Terminal**. **Sidebar** sets the left side panel
apart from the main screen: its background, text, row hover, and border.
Themes saved before this group existed get bb's own sidebar colors, so they
look the same as before. The last five groups start closed. Each color has a
picker and a hex field.

bb works out most tokens from the palette (for example, borders mix Text into
Background). These rows say **auto** and show bb's value as a hint. Type or
pick a color to override one; `#rrggbbaa` adds transparency. **Auto** gives
the token back to bb. The theme file holds only the tokens you override, so
the rest keep following the palette. A pill override replaces bb's gradient
with one solid color.
A badge on the color row shows its contrast ratio and a pass or fail mark.
A group title shows how many of its colors fail. Contrast checks do not
certify the accessibility of the whole application. Choose **Light** or
**Dark** to edit each mode. **UI font** and **Code font** are under
**Typography**.

### Randomize tab

Type an accent as a six-digit hex such as `#7c3aed`, or leave it blank.
Select **Randomize** to get a full light and dark theme at once. When you give
an accent, the primary color keeps that exact accent in both modes. A blank
accent gives a new color direction.

No model is needed. The roll runs in the page and sends nothing to a provider.
**Back** and **Forward** walk through your rolls. **Back** can return to the
colors you had before the first roll. The trail is kept when you change tabs.
It is cleared when you pick, save as new, undo, redo, delete, or discard a
theme, because the rolls then belong to a different theme. **Edit this** and **Refine
with AI** continue from the rolled theme.

A roll replaces only the light and dark colors. The name and fonts stay.

### AI tab

Choose a provider and model, describe the theme (up to 600 characters), and
select **Generate**. Describe a mood, references, or named colors, or leave it
blank for a surprise. **Keep accent** locks one accent hex in both modes. After
the first reply, the **Message to the agent** box lets you ask for changes, for
example “make dark mode less contrasty”. Each agent reply that has colors puts
them in the draft. **Use this version** returns the draft to an earlier reply.
**Stop** ends the current answer. **New chat** ends the conversation; the theme
you have stays in the draft. A reload keeps the open conversation.

The provider must already be configured in bb. Normal provider usage charges
and limits apply. Your model and reasoning selection is remembered in this
browser. A reply replaces only the light and dark colors, never the name or
fonts. Review **Preview** and the contrast badges, then save explicitly.

The public SDK has no general inference call. The AI tab uses one personal bb
agent thread with the chosen model and `accept-edits` permissions and a
text-only prompt. The plugin supplies no project source or draft data. Your
messages are the only user text sent to the provider. Control characters are
replaced, and the text is fenced as design input so it cannot override the
JSON-only rules. These are model instructions, not a hard boundary:
`accept-edits` is the most restrictive mode bb offers, so file edits in the
personal workspace would be approved automatically. Do not paste descriptions
from untrusted sources. The prompt asks the model not to use tools, but this is
a normal bb agent session, not a tool-free sandbox: bb’s configured
instructions and provider permissions still apply. Approval requests stop the
turn rather than being approved automatically.

Each answer has a three-minute deadline, and a chat keeps at most 40 turns.
The server ends a conversation when the page has been closed for five minutes
or no message was sent for 30 minutes, so no agent thread outlives its page.
The thread is archived when the conversation ends; its prompts and replies
remain in bb’s history. Each cleanup step has a five-second limit. Cleanup
failures are logged with the thread ID and never discard the draft. Inspect and
stop remaining threads through bb. After a server crash, inspect any remaining
**Theme Builder chat** thread before retrying.

Responses are bounded and validated as palette JSON; model CSS, HTML, extra
keys, and incomplete palettes are rejected. Contrast badges remain the review
mechanism. No additional dependencies, provider credentials, or API-key
settings are introduced by Theme Builder.

### Use theme, restore, and export

**Use theme** switches bb to the saved theme, so it is off while the copy has
unsaved edits. **Restore previous theme** (in **More actions**) reselects the
theme that was in use before the latest successful **Use theme**. An overwrite
of the theme in use keeps Restore available. If appearance changed elsewhere,
restore refuses and the page reads the current selection again, so you can
review it and try again. If a custom or plugin theme’s source files changed
after **Use theme**, Restore leaves appearance unchanged and offers the
explicit **Use bb default theme** fallback.

**Export JSON** downloads the draft as shown. **Export CSS** downloads exactly
the CSS a save would write. JSON contains schema version, name, palettes, font
keys, and any token overrides; neither download includes server paths or
timestamps in its content.

Hex text fields offer a keyboard alternative to native color pickers. Palette
colors are opaque six-digit hex; overrides of auto tokens may add an alpha
pair; fonts are fixed local/system stacks whose
availability varies by OS. No preview resources or fonts are downloaded. Below
900 px of width the preview moves under the editor, and the page does not
scroll sideways.

Code syntax retains bb’s default `pierre-light` /`pierre-dark` fallback. The
plain code sample demonstrates font choice; accent does not rewrite syntax
colors. Diff/status controls set public semantic tokens. Syntax editing,
CSS import, and plugin-package export are outside v1.

## Install and build

Current browser verification uses bb **0.50.1** with public Plugin SDK
**0.4.47**. The SDK pin and engine ranges come from the original bb 0.42.1
scaffold. Use a disposable development server first. This repository has not
been published to a marketplace.

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
set `BB_DATA_DIR`, `BB_SERVER_URL`, and `BB_HOST_DAEMON_PORT` to the disposable
instance for **every** bb command. First build can install bb’s pinned
esbuild/Tailwind toolchain there; approve that download separately.
`bb plugin new` scaffolds and installs packages, so do not use it as an
inspection command.

Tests use Node’s built-in runner and the SDK harness. Node 24 LTS or newer with
TypeScript stripping is suitable. The packaged desktop runtime can have a
different native SQLite ABI from shell Node; use the packaged runtime to start a
development copy of the packaged server.

The npm lockfile records the scaffold dependency graph. `.npmrc` requests a
seven-day minimum release age on supporting npm versions. Review advisories
before dependency changes; run `npm audit` and the public-import test alongside
typecheck/build. A clean audit is an advisory check, not a security guarantee.
The editor and browser journey introduce no additional runtime libraries.

## Recovery and retention

Every save writes the whole theme file at once: a new temporary file in the
theme’s folder, synced, then renamed over `theme.css`, so bb never reads half a
theme. **Overwrite** sends the hash of the file the page loaded. If the file
changed since, the save is refused and the draft is kept; save it as a new
theme or pick the theme again. If a save succeeds but bb does not confirm the
repaint, the page says so.

If **Use theme** is uncertain, reload the page; persisted pending operations
reconcile against the actual selected CSS and code-theme identity. Success
requires selection readback. A missing or changed previous theme produces a
separate **Use bb default theme** action in **More actions**. Existing
custom-theme recovery records without a source fingerprint also require this
explicit fallback. Built-in recovery records remain compatible. Restore never
silently picks default or overwrites an already-observed external selection. A
changed favicon is preserved after the page reads appearance again. For
load/build failures, inspect `bb plugin list` and
`bb plugin logs theme-builder`, correct the reported error, then use
`bb plugin reload theme-builder`. If the page opens before plugin startup
completes, reload the page once it is running. Normal bb theme settings remain
available independently.

Themes are ordinary bb custom themes in the **server’s catalog-reported theme
directory**: one folder per theme with one `theme.css` of at most 256 KB.
They survive disabling or removing the builder. The builder touches only
folder names of letters, digits, `-`, and `_`, and refuses symlinks, a
symlinked or non-directory theme root, and files over the size limit. Delete
removes one `theme.css` and its then-empty folder, never recursively. Saved
versions for undo, the list of themes the builder made, and the progress of
the one-time move of older themes live in the plugin’s own SQLite database:
at most six versions per theme. Writes run one at a time within the plugin.
Teardown drains queued operations.

`bb.sdk.theme.set({ themeId, faviconColor })` has **no atomic
compare-and-swap**. Read-before-write detects visible changes, but another
Settings/CLI operation can race between the check and selection. The plugin
serializes its own operations; it cannot lock other appearance writers. Preview
derivations and builtin restore availability are verified against 0.50.1 and
need rechecking on upgrades. As full-trust local code, filesystem checks cannot
exclude a hostile OS process replacing ancestor directories during an operation.

## Browser verification

`tests/theme-builder.e2e.ts` and `tests/randomizer.e2e.ts` drive the real built
plugin using Chrome DevTools Protocol and Node’s WebSocket implementation,
without a new browser dependency. Start a separate bb server with temporary
data and ports. Build and install the plugin there. Keep a separate headed
Chrome session open for the whole journey. On macOS, these automation flags
prevent background-window throttling from hiding appearance updates or
delaying preview paint:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --remote-debugging-port=48988 \
  --user-data-dir=/tmp/bb-theme-builder-browser \
  --no-first-run \
  --disable-background-timer-throttling \
  --disable-backgrounding-occluded-windows \
  --disable-renderer-backgrounding \
  about:blank
```

Use a clean profile, not your normal browser profile. Get the actual websocket
endpoint from `http://127.0.0.1:48988/json/version`. Then run:

```sh
BB_THEME_TEST_URL=http://127.0.0.1:48986 \
BB_THEME_TEST_DATA_DIR=/tmp/bb-theme-builder-dev \
BB_THEME_TEST_DAEMON_PORT=48987 \
BB_THEME_TEST_CDP=ws://127.0.0.1:DEBUG_PORT/devtools/browser/SESSION_ID \
BB_THEME_TEST_ARTIFACTS=/tmp/theme-builder-evidence \
npm run smoke
```

Replace the debug URL with the actual endpoint. The script refuses non-loopback
endpoints and non-temporary data directories, then verifies the server’s actual
theme directory. It creates test themes/artifacts, changes disposable
appearance, and restores the initial selection on exit. Use a fresh artifact
directory per run. Do not point it at production.

The journey covers the one-time move of older saved themes, the dropdown
groups and hidden revision ids, a copy of a built-in theme, both modes,
isolated edits without network requests, **Save as new**, reload, the
restored-changes notice and its Discard action, a copy of a hand-written theme
that keeps its CSS, **Overwrite** and its conflict between two windows, **Use
theme**, the repaint after an overwrite of the theme in use, **Undo** and
**Redo** including an outside edit, Restore, external changes,
disable/enable, downloads, preview/host token parity, declined discard prompts,
delete, 200% zoom, compact layout, and keyboard tab navigation. It writes
test themes into the disposable theme directory and test records into the
disposable bb database. Screenshots and a JSON report stay outside Git. To
verify restart, use a saved theme, stop only the disposable server, restart
with the same data directory, reload the page, verify the selected palette and
both modes, then Restore.

No production instance, package installation, theme selection, or data was used
for development testing. Development and checked delivery use `main` directly.
Local hooks and all checks must pass before a push. Publishing and production
installation require separate approval. See the
[contributor guide](../README.md#development) for hook setup and delivery gates.

With the same disposable instance and `BB_THEME_TEST_*` environment, run
`npm run smoke:randomizer` for the **Randomize** tab. It needs no model and
starts no agent thread. It enters an accent and rolls three times. It checks
that the primary color keeps the accent in both modes, that **Back** and
**Forward** replay each palette, that a blank accent rolls freely, and that
nothing is saved or used. Then it reloads the page and checks that the draft
and the restored-changes notice persist. The **AI** tab is not part of the smoke
checks, because it needs a configured provider and incurs normal usage charges.
Unit tests cover malformed output, strict RPC validation, request coalescing,
timeouts, and thread cleanup failures.
