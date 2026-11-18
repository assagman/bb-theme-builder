/** Decimal places shown in a contrast ratio. */
export const RATIO_DECIMALS = 1;
/** Absorbs binary float error (2.9 * 10 = 28.999...) so truncation never drops a displayed digit. */
const TRUNCATION_EPSILON = 1e-9;
/** Badge marks: text, not color, carries pass/fail so the badge works without color vision. */
export const BADGE_PASS_MARK = "✓";
export const BADGE_FAIL_MARK = "low";
/** Joins the group label and its failure count in a summary line. */
const GROUP_SUMMARY_SEPARATOR = " · ";

/**
 * Truncates, never rounds: the pass test compares the unrounded ratio with
 * 4.5, so rounding 4.46 up to "4.5" would label a failing color as a
 * borderline pass.
 */
export const formatRatio = (ratio: number) => {
  const scale = 10 ** RATIO_DECIMALS;
  return (Math.floor(ratio * scale + TRUNCATION_EPSILON) / scale).toFixed(
    RATIO_DECIMALS,
  );
};

/**
 * Spoken form of the badge: the visual "7.1:1 ✓" reads poorly aloud, and the
 * words keep pass/fail from depending on the symbol.
 */
export const contrastLabel = (ratio: string, passes: boolean) =>
  `Contrast ${ratio} to 1, ${passes ? "passes" : "fails"}`;

/** Shown in a group summary so failures stay visible while the group is collapsed. */
export const groupFailures = (count: number) =>
  `${GROUP_SUMMARY_SEPARATOR}${count} ${BADGE_FAIL_MARK}`;
