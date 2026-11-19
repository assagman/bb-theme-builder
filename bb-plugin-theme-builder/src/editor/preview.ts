import { generateCss } from "../theme/css.ts";
import type { Mode, ThemeDraft } from "../theme/tokens.ts";

const PREVIEW_CSS = `
:root {
  --background: var(--canvas); --foreground: var(--ink);
  --card: var(--canvas); --card-foreground: var(--ink); --popover: var(--canvas); --popover-foreground: var(--ink);
  --secondary: color-mix(in oklch,var(--ink) 8%,var(--canvas)); --secondary-foreground: var(--ink);
  --accent: var(--secondary); --accent-foreground: var(--ink);
  --muted: color-mix(in oklch,var(--ink) 11%,var(--canvas));
  --border: color-mix(in oklch,var(--ink) 14%,var(--canvas));
  --border-hairline: color-mix(in oklch,var(--ink) 14.7%,var(--canvas));
  --border-seam: color-mix(in oklch,var(--ink) 9.5%,var(--canvas)); --border-seam-vertical: var(--border-seam);
  --input: color-mix(in oklch,var(--ink) 29.5%,var(--canvas));
  --ring: var(--primary); --sidebar-ring: var(--primary);
  --sidebar: var(--canvas); --sidebar-foreground: var(--ink); --sidebar-accent: var(--secondary); --sidebar-border: var(--border);
  --sidebar-accent-foreground: var(--ink);
  --surface-selected: color-mix(in oklab,var(--primary) 16%,transparent);
  --surface-selected-border: color-mix(in oklab,var(--primary) 35%,transparent);
  --surface-destructive: color-mix(in oklab,var(--destructive) 6%,transparent);
  --surface-destructive-border: color-mix(in oklab,var(--destructive) 25%,transparent);
  --surface-recessed: color-mix(in oklab,var(--ink) 6%,transparent);
  --surface-raised: color-mix(in oklab,var(--ink) 2.5%,transparent);
  --surface-scrim: color-mix(in oklab,var(--canvas) 92%,transparent);
  --state-hover: color-mix(in oklab,var(--ink) 5.9%,transparent);
  --state-active: color-mix(in oklab,var(--ink) 11.8%,transparent);
}
:root.dark {
  --secondary: color-mix(in oklch,var(--ink) 13%,var(--canvas));
  --muted: color-mix(in oklch,var(--ink) 16%,var(--canvas));
  --border: color-mix(in oklch,var(--ink) 19.4%,var(--canvas));
  --border-hairline: color-mix(in oklch,var(--ink) 21%,var(--canvas));
  --border-seam: color-mix(in oklch,var(--ink) 11%,var(--canvas));
  --input: color-mix(in oklch,var(--ink) 32.6%,var(--canvas));
  --sidebar-accent: color-mix(in oklch,var(--ink) 12%,var(--canvas));
  --sidebar-border: color-mix(in oklch,var(--ink) 18.1%,var(--canvas));
  --surface-selected: color-mix(in oklab,var(--primary) 12%,transparent);
  --surface-destructive: color-mix(in oklab,var(--destructive) 8%,transparent);
  --surface-destructive-border: color-mix(in oklab,var(--destructive) 30%,transparent);
  --state-hover: color-mix(in oklab,var(--ink) 13.8%,transparent);
  --state-active: color-mix(in oklab,var(--ink) 22.5%,transparent);
}
* { box-sizing:border-box } body { margin:0;background:var(--background);color:var(--foreground);font:14px/1.6 var(--font-sans) }
header { padding:18px 22px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px }
nav { padding:12px 22px;border-bottom:1px solid var(--border);color:var(--muted-foreground);display:flex;gap:20px;flex-wrap:wrap }
main { padding:22px;max-width:800px;margin:auto } h1 { font-size:22px;line-height:1.3;margin:0 0 16px } p { margin:8px 0 18px }
button,input { font:inherit } button { cursor:pointer;padding:7px 14px;border:1px solid var(--input);border-radius:6px;background:transparent;color:var(--ink) }
button.default { background:var(--foreground);color:var(--background);border-color:var(--foreground) }
.accent-sample { background:var(--primary);color:var(--primary-foreground);padding:2px 7px;border-radius:5px }
button.destructive { background:var(--destructive);color:var(--destructive-foreground);border-color:var(--destructive) }
button:focus-visible,input:focus-visible { outline:2px solid var(--ring);outline-offset:3px }
input { display:block;width:100%;padding:9px;border:1px solid var(--input);border-radius:6px;background:var(--canvas);color:var(--ink);margin:10px 0 16px }
input::placeholder { color:var(--subtle-foreground) } .actions,.badges { display:flex;gap:10px;flex-wrap:wrap;margin:16px 0 }
.meta { color:var(--muted-foreground) } .subtle { color:var(--subtle-foreground) } .readback { color:var(--readback-foreground) }
.badge { border:1px solid currentColor;border-radius:5px;padding:2px 7px;font-size:12px;background:var(--canvas) }
.success { color:var(--success) } .warning { color:var(--warning-text) } .failure { color:var(--destructive-text) } .merged { color:var(--pr-merged) }
.attention { color:var(--attention) } .path { color:var(--file-accent);font-family:var(--font-mono) }
pre { overflow:auto;padding:14px;background:var(--surface-recessed);border:1px solid var(--border);border-radius:6px;font:13px/1.7 var(--font-mono) }
.diff { padding:10px 14px;border:1px solid var(--border);font:13px/1.8 var(--font-mono);background:var(--canvas) }
.added { color:var(--diff-added) } .removed { color:var(--diff-removed) }
`;

const MARKUP = `
<header><strong>Workspace</strong><span class="meta">Preview fixture</span></header>
<nav aria-label="Preview navigation"><strong>Conversation</strong><span>Changes</span><span>Files</span></nav>
<main>
  <p class="meta">Today · Local workspace</p><h1>A calmer place to build.</h1>
  <p>Review the latest changes, leave a note, and keep your next step in view.</p>
  <p class="readback">Completed the requested update. Ready for review.</p>
  <div class="badges"><span class="badge success">Checks passed</span><span class="badge warning">Warning</span><span class="badge failure">Failed</span><span class="badge merged">Merged</span></div>
  <p class="attention">● Review requested</p>
  <label for="note">Message</label><input id="note" placeholder="Add a note…" value="Looks ready for the next step.">
  <div class="actions"><button class="default">Continue</button><button>Review changes</button><button class="destructive">Delete</button><span class="accent-sample">Accent sample</span></div>
  <p class="path">src/workspace.ts</p>
  <p class="subtle">Code font sample · syntax colors are not edited here</p>
  <pre><code>const workspace = {
  name: "Personal workspace",
  ready: true,
};</code></pre>
  <div class="diff"><div class="removed">− const status = "draft";</div><div class="added">+ const status = "ready";</div></div>
</main>`;
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";

export function previewDocument(draft: ThemeDraft, mode: Mode): string {
  return `<!doctype html><html lang="en" class="${mode}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview</title><style>${generateCss(draft)}${PREVIEW_CSS}</style></head><body>${MARKUP}</body></html>`;
}
