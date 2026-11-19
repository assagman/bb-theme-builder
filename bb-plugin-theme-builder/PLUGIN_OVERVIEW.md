# Theme Builder

Build and edit bb themes from bb’s sidebar. A dropdown at the top lists every
bb theme: built-in, your own, and plugin themes. Picking one opens an editable
copy. Three tabs change the copy, and one action bar saves it.

- **AI**: describe the theme in plain words, then keep talking to an agent to
  tweak it. It uses your chosen bb provider and model. Normal provider usage
  applies, each answer has a three-minute deadline, and the archived thread
  stays in bb’s history.
- **Edit**: change every bb color token and local fonts by hand. Rows show a
  plain name and the `--token` name, and a search finds either. Tokens bb
  works out from the palette say **auto** until you override them. Palette
  colors show their contrast ratio next to them.
- **Randomize**: pick an accent, or none, and get a full theme at once. Roll
  again, and use **Back** and **Forward** to compare. It needs no model and
  sends nothing to a provider.

An isolated **Preview** shows the copy as a whole bb window (sidebar, thread,
and side panel) in both modes, painted with the same CSS bb will use. Your own
themes keep their CSS as written; the builder adds one marked block with only
the values you changed. bb does not expose the colors of built-in and plugin
themes, so their copies start from Neutral.

In the action bar, **Overwrite** saves the copy over your own theme, and **Save
as new** keeps it as a new theme under a name you choose. **Undo** and
**Redo** beside the dropdown step through the last five saved versions of the
open theme. **Use theme** switches every bb window to the saved theme,
preserving each window’s light/dark preference and favicon selection. An
overwrite of the theme in use repaints bb at once. **More actions** has delete
(themes made in the builder only), JSON and CSS export, and **Restore previous
theme**. Restore refuses an already-observed later appearance choice. The
public SDK cannot atomically exclude simultaneous Settings/CLI changes.

Unsaved changes survive a reload. The page restores them and shows a notice
with a **Discard** button. Themes saved by older versions of the builder become
bb themes once, on the first start. See README for permissions and recovery
details.

System fonts can differ across devices. Code syntax uses bb’s default fallback,
and the preview does not represent a live session.

Core browser journeys verified against bb 0.50.1 / Plugin SDK 0.4.47 in a
disposable development environment. See README for installation, recovery,
testing, and retention details.
