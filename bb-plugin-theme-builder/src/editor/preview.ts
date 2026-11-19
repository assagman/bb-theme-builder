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
  --surface-selected: color-mix(in oklab,var(--primary) 12%,transparent);
  --surface-destructive: color-mix(in oklab,var(--destructive) 8%,transparent);
  --surface-destructive-border: color-mix(in oklab,var(--destructive) 30%,transparent);
  --state-hover: color-mix(in oklab,var(--ink) 13.8%,transparent);
  --state-active: color-mix(in oklab,var(--ink) 22.5%,transparent);
}
* { box-sizing:border-box } body { margin:0;background:var(--background);color:var(--foreground);font:13px/1.55 var(--font-sans) }
.app { display:grid;grid-template-columns:36px 160px minmax(0,1fr) 168px;min-height:100vh }
.rail,.sidebar { background:var(--sidebar);color:var(--sidebar-foreground) }
.rail { display:flex;flex-direction:column;align-items:center;gap:12px;padding:12px 0;border-right:1px solid var(--sidebar-border) }
.rail i { width:14px;height:14px;border-radius:4px;border:1.5px solid currentColor;opacity:.7 } .rail i.on { opacity:1;background:var(--sidebar-accent) }
.sidebar { padding:10px 8px;border-right:1px solid var(--sidebar-border);display:flex;flex-direction:column;gap:2px;min-width:0 }
.sidebar .group { color:var(--muted-foreground);font-size:12px;padding:10px 8px 4px } .sidebar .new { font-weight:600 }
.row { padding:5px 8px;border-radius:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis }
.row.hover { background:var(--sidebar-accent);color:var(--sidebar-accent-foreground) } .row.open { background:var(--state-active) }
.sidebar .foot { margin-top:auto;border-top:1px solid var(--sidebar-border);padding:8px 8px 0;color:var(--muted-foreground);font-size:12px }
.thread { min-width:0;display:flex;flex-direction:column }
header { padding:10px 18px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;gap:12px }
main { padding:16px 18px;flex:1 } h1 { font-size:18px;line-height:1.3;margin:0 0 10px } p { margin:6px 0 12px }
.bubble { background:var(--surface-recessed);border:1px solid var(--border-seam);border-radius:10px;padding:8px 12px;margin:0 0 12px auto;max-width:80% }
.composer { margin:0 18px 16px;border:1px solid var(--border);border-radius:10px;padding:8px 10px;background:var(--canvas) }
.composer .actions { margin:6px 0 0;justify-content:flex-end }
.panel { border-left:1px solid var(--border);background:var(--canvas);padding:10px 12px;min-width:0 }
.panel h2 { font-size:12px;margin:0 0 8px;color:var(--muted-foreground);font-weight:600 }
@media (max-width:680px) { .app { grid-template-columns:36px 160px minmax(0,1fr) } .panel { display:none } }
@media (max-width:480px) { .app { grid-template-columns:150px minmax(0,1fr) } .rail { display:none } }
button,input { font:inherit } button { cursor:pointer;padding:5px 12px;border:1px solid var(--input);border-radius:6px;background:transparent;color:var(--ink) }
button.default { background:var(--foreground);color:var(--background);border-color:var(--foreground) }
.accent-sample { background:var(--primary);color:var(--primary-foreground);padding:2px 7px;border-radius:5px }
button.destructive { background:var(--destructive);color:var(--destructive-foreground);border-color:var(--destructive) }
button:focus-visible,input:focus-visible { outline:2px solid var(--ring);outline-offset:3px }
input { display:block;width:100%;padding:4px 2px;border:0;background:transparent;color:var(--ink) }
input::placeholder { color:var(--subtle-foreground) } .actions,.badges { display:flex;gap:8px;flex-wrap:wrap;margin:12px 0 }
.meta { color:var(--muted-foreground) } .subtle { color:var(--subtle-foreground) } .readback { color:var(--readback-foreground) }
.badge { border:1px solid currentColor;border-radius:5px;padding:1px 6px;font-size:11px;background:var(--canvas) }
.success { color:var(--success) } .warning { color:var(--warning-text) } .failure { color:var(--destructive-text) } .merged { color:var(--pr-merged) }
.attention { color:var(--attention) } .path { color:var(--file-accent);font-family:var(--font-mono);margin:4px 0 }
pre { overflow:auto;padding:10px;background:var(--surface-recessed);border:1px solid var(--border-seam);border-radius:6px;font:12px/1.6 var(--font-mono) }
.diff { padding:8px 10px;border:1px solid var(--border);border-radius:6px;font:12px/1.7 var(--font-mono);background:var(--canvas) }
.added { color:var(--diff-added) } .removed { color:var(--diff-removed) }
`;

// A whole bb window (icon rail, sidebar, thread, side panel) so sidebar colors are judged next to the main screen they must suit.
const MARKUP = `
<div class="app">
<nav class="rail" aria-label="Preview rail"><i class="on"></i><i></i><i></i><i></i></nav>
<nav class="sidebar" aria-label="Preview sidebar">
  <div class="row new">+ New thread</div>
  <div class="group">Pinned</div><div class="row">Release checklist</div>
  <div class="group">workspace</div>
  <div class="row open">Polish the onboarding flow</div>
  <div class="row hover">Fix flaky upload test</div>
  <div class="row">Draft the changelog</div>
  <div class="group">Threads</div><div class="row">Dependency sweep</div>
  <div class="foot">Settings</div>
</nav>
<div class="thread">
  <header><strong>Polish the onboarding flow</strong><span class="meta">Local workspace</span></header>
  <main>
    <div class="bubble">Tidy the welcome screen and run the checks.</div>
    <h1>A calmer place to build.</h1>
    <p class="readback">Completed the requested update. Ready for review.</p>
    <div class="badges"><span class="badge success">Checks passed</span><span class="badge warning">Warning</span><span class="badge failure">Failed</span><span class="badge merged">Merged</span></div>
    <p class="attention">● Review requested</p>
    <p class="subtle">Code font sample · syntax colors are not edited here</p>
    <pre><code>const workspace = {
  name: "Personal workspace",
  ready: true,
};</code></pre>
  </main>
  <div class="composer">
    <label for="note" class="subtle">Message</label><input id="note" placeholder="Ask anything…" value="Looks ready for the next step.">
    <div class="actions"><span class="accent-sample">Accent sample</span><button class="destructive">Delete</button><button>Review changes</button><button class="default">Send</button></div>
  </div>
</div>
<aside class="panel" aria-label="Preview side panel">
  <h2>Changes</h2>
  <p class="path">src/workspace.ts</p>
  <div class="diff"><div class="removed">− status = "draft"</div><div class="added">+ status = "ready"</div></div>
  <p class="meta">2 files changed</p>
</aside>
</div>`;
const CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'none'; img-src 'none'; font-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'";

export function previewDocument(draft: ThemeDraft, mode: Mode): string {
  return `<!doctype html><html lang="en" class="${mode}"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${CSP}"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Preview</title><style>${generateCss(draft)}${PREVIEW_CSS}</style></head><body>${MARKUP}</body></html>`;
}
