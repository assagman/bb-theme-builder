# Theme Builder

Build a personal light/dark palette from bb’s sidebar. Adjust colors and local
font
choices beside an isolated representative preview, with contrast feedback for
both
modes. Save, duplicate, rename, and delete presets. Export saved JSON and CSS.

**Randomize** generates both palettes with your chosen bb provider/model.
Optionally
lock an accent hex; review the unsaved result and undo it before saving. The
last
model selection is remembered in this browser. Generation uses a personal bb
agent
thread, normal provider usage, and a three-minute deadline; its archived history
is
retained. Cancel and failures preserve your draft. See README for permissions
and
recovery details.

Editing stays local. **Apply saves and changes every bb window**, preserving
each
window’s light/dark preference and favicon selection. **Restore previous theme**
offers one-step recovery and refuses an already-observed later appearance
choice.
Changed custom or plugin source files cannot silently become a restore target.
The public SDK cannot atomically exclude simultaneous Settings/CLI changes.

Presets survive restart. Generated themes survive disabling the plugin; deleting
a
preset retains applied artifacts. Each Apply creates a small CSS file; automatic
pruning is deferred. System fonts can differ across devices. Code syntax uses
bb’s
default fallback, and the preview does not represent a live session.

Core browser journeys verified against bb 0.43.0 / Plugin SDK 0.4.47 in a
disposable development environment.
See README for installation, recovery, testing, and retention details.
