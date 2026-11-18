# Theme Builder

A BB plugin for independent light and dark palettes. Edit colors and system
fonts, review an isolated preview, save presets, and export JSON or CSS. Apply a
palette across BB windows, then restore the previous appearance. The optional
randomizer uses a configured model and preserves explicit Save and Apply
actions.

The implementation is in [`bb-plugin-theme-builder/`](bb-plugin-theme-builder/).
Read the [user and recovery guide](bb-plugin-theme-builder/README.md) before
installation.

## Development

Development takes place directly on `main`. Do not create feature branches or
pull requests unless the owner requests them. Keep changes focused. Sign every
commit with DCO and include a Conventional Commit subject and a purpose-focused
body.

Use Node 24 LTS, npm, BB, and the tools below:

- Gitleaks, Semgrep, OSV-Scanner, Lizard, ShellCheck, shfmt, and
  markdownlint-cli2.
- A separate BB server and browser for the automated smoke journey.
- A signing key that Git can verify without changing repository configuration.

After cloning, review the locked dependencies and install them:

```sh
cd bb-plugin-theme-builder
npm ci --ignore-scripts
cd ..
scripts/setup-hooks
```

Hook setup installs clone-local forwarding scripts. It does not change Git
configuration or replace unrelated hooks. An existing `core.hooksPath` or an
unrecognized active hook stops setup for manual integration.

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

For the complete checks, first start the disposable server and browser described
in the
[browser verification guide](bb-plugin-theme-builder/README.md#browser-verification).
Set their actual values before running this command from the repository root:

```sh
export BB_DATA_DIR=/tmp/bb-theme-builder-dev
export BB_SERVER_URL=http://127.0.0.1:48986
export BB_HOST_DAEMON_PORT=48987
export BB_THEME_TEST_CDP=ws://127.0.0.1:DEBUG_PORT/devtools/browser/SESSION_ID
export BB_THEME_TEST_ARTIFACTS=/tmp/theme-builder-evidence
scripts/check
```

Replace the browser endpoint with the actual endpoint. Use a fresh evidence
directory. The check script verifies the live server data directory before it
installs the plugin. It refuses non-loopback endpoints and non-temporary data.
Never point verification commands at a production instance.

The complete checks include lint, types, existing tests, duplication, dependency
advisories, build, shell analysis, static analysis, Markdown lint, and browser
smoke. Real randomizer checks are separate because they require configured model
access and incur normal usage charges:

```sh
cd bb-plugin-theme-builder
npm run smoke:randomizer
```

## Delivery gates

- `pre-commit` scans staged secrets and whitespace, checks Markdown, and runs
  formatting and lint against an indexed copy rather than unstaged content.
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
