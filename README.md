# Theme Builder

A BB plugin for independent light and dark themes. Pick any bb theme from the
dropdown to open an editable copy, then change it with the **AI**, **Edit**, or
**Randomize** tab. Review an isolated preview, then **Overwrite** the theme or
**Save as new**. Undo and redo saved versions, switch bb to a theme with **Use
theme**, and restore the previous appearance. Export JSON or CSS. Unsaved
changes survive a reload. Only the AI tab needs a configured model.

The implementation is in [`bb-plugin-theme-builder/`](bb-plugin-theme-builder/).
Read the [user and recovery guide](bb-plugin-theme-builder/README.md) before
installation.

## Development

Development takes place directly on `main`. Do not create feature branches or
pull requests unless the owner requests them. Keep changes focused. Sign every
commit with DCO and include a Conventional Commit subject and a purpose-focused
body.

Use mise, Node 24 LTS, npm, BB, and the tools below:

- Gitleaks, Semgrep, OSV-Scanner, Lizard, ShellCheck, shfmt, and
  markdownlint-cli2.
- BB installed, and Google Chrome or Chromium, for the browser smoke journey.
- A signing key that Git can verify without changing repository configuration.

After cloning, trust and install the pinned tools from `mise.toml`, review the
locked dependencies, install them, and turn on the repository hooks:

```sh
mise trust
mise install
cd bb-plugin-theme-builder
npm ci --ignore-scripts
cd ..
scripts/setup-hooks
```

`scripts/setup-hooks` sets clone-local `core.hooksPath=.githooks` so Git runs
the repository's committed hooks directly. It never changes global Git
configuration.

## Local checks

Fast package checks:

```sh
cd bb-plugin-theme-builder
npm run lint
npm run typecheck
npm test
npm run duplicates
npm audit
```

`npm run format` formats package files. `npm run lint` also checks import order.
The lockfile pins the dependency graph. New tooling and security fixes use exact
versions. `.npmrc` enforces a seven-day release age on supporting npm versions.

Run the complete checks from the repository root:

```sh
scripts/check
```

`scripts/check` starts a throwaway BB server and an off-screen browser through
`scripts/disposable-runtime`. They use temporary data under `/tmp` and free
loopback ports, and both are removed when the check ends. The BB you use day to
day is never touched. The check script still verifies the live server data
directory before it installs the plugin, and refuses non-loopback endpoints and
non-temporary data.

To check against a runtime you started yourself, as described in the
[browser verification guide](bb-plugin-theme-builder/README.md#browser-verification),
set `BB_DATA_DIR`, `BB_SERVER_URL`, `BB_HOST_DAEMON_PORT`, `BB_THEME_TEST_CDP`
and `BB_THEME_TEST_ARTIFACTS` first. Never point verification commands at a
production instance.

The complete checks include lint, types, existing tests, duplication, dependency
advisories, build, shell analysis, static analysis, Markdown lint, and browser
smoke for the main journey and the Randomize tab. The Randomize journey needs
no model. To run it alone:

```sh
cd bb-plugin-theme-builder
npm run smoke:randomizer
```

## Delivery gates

- `pre-commit` scans staged secrets and whitespace, checks Markdown, checks
  formatting and linting of indexed package files and
  `scripts/verify-test-environment.mjs` with Biome, and runs ShellCheck and
  `shfmt` on staged repo-owned shell scripts against an indexed copy rather than
  unstaged content.
- `commit-msg` requires the commit convention, a body, and DCO.
- `pre-push` verifies signatures, DCO, messages, and secrets for outgoing
  commits. Shared checks also scan changed lockfile revisions, source, and
  function complexity. Project checks run the complete suite once for each
  distinct pushed tip.

A missing tool, scanner error, unavailable test environment, or failed check
blocks commit or push. Never bypass hooks or add an advisory exception to finish
delivery. Historical lockfiles can block a push even after the current tip
receives a fix. Rewriting unpublished history requires owner approval. Never
rewrite published history or force-push `main`.

Before a push, fetch and rebase onto `origin/main`. Run the checks on the
resulting tree and review the full outgoing patch. Verify the remote commit
after the push. Package publishing, release tags, and production installation
require separate approval.
