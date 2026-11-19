/**
 * What the theme RPCs tell the user when a write is refused or fails. In a
 * module of their own so the server and the browser journeys that assert on
 * them share one copy without loading the server's file access.
 */
export const THEME_MESSAGES = {
  conflict:
    "This theme changed outside the builder. Save your edits as a new theme, or discard them and pick the theme again.",
  notCustom: "Only your own custom themes can be overwritten.",
  missing: "This theme no longer exists. Save your edits as a new theme.",
  noUndo: "There is no earlier saved version.",
  noRedo: "There is no later saved version.",
  notOwned: "Only themes made in Theme Builder can be deleted here.",
  active: "This theme is in use. Switch bb to another theme first.",
  failed: "The theme could not be saved. Your edits are kept; try again.",
  deleteFailed: "The theme could not be deleted. Nothing was removed.",
};
