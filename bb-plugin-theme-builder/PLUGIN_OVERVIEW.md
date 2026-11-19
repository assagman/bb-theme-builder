# Theme Builder

Build a personal light/dark theme from bb’s sidebar. Your themes are cards at
the top of the page. Three tabs change the open theme, and one action bar saves
and applies it.

- **AI**: describe the theme in plain words, then keep talking to an agent to
  tweak it. It uses your chosen bb provider and model. Normal provider usage
  applies, each answer has a three-minute deadline, and the archived thread
  stays in bb’s history.
- **Edit**: change colors and local fonts by hand. Colors are in groups, and
  each color shows its contrast ratio next to it.
- **Randomize**: pick an accent, or none, and get a full theme at once. Roll
  again, and use **Back** and **Forward** to compare. It needs no model and
  sends nothing to a provider.

An isolated **Preview** shows the draft as a whole bb window (sidebar, thread,
and side panel) in both modes. The sidebar has its own colors, which you or
the agent can change without changing the main screen. In the action bar,
**Save** keeps the theme without changing appearance. **Apply** saves it and
changes every bb window, preserving each window’s light/dark preference and
favicon selection. A new theme asks for a name first. **More actions** has
rename, duplicate, delete, JSON and CSS export, and **Restore previous theme**.
Restore offers one-step recovery and refuses an already-observed later
appearance choice. Changed custom or plugin source files cannot silently become
a restore target. The public SDK cannot atomically exclude simultaneous
Settings/CLI changes.

Unsaved changes survive a reload. The page restores them and shows a notice
with a **Discard** button. See README for permissions and recovery details.

Themes survive restart. Generated themes survive disabling the plugin; deleting
a theme retains applied artifacts. Each Apply creates a small CSS file;
automatic pruning is deferred. System fonts can differ across devices. Code
syntax uses bb’s default fallback, and the preview does not represent a live
session.

Core browser journeys verified against bb 0.43.0 / Plugin SDK 0.4.47 in a
disposable development environment. See README for installation, recovery,
testing, and retention details.
