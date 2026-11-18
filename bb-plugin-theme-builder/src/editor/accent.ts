import { accentSchema } from "../generation/contract.ts";

/** Result of reading the accent box: blank is valid (no accent), anything else must be a six-digit hex. */
export type AccentReading = {
  /** True only for a non-empty entry that is not a valid hex color, so blank never blocks an action. */
  invalid: boolean;
  /** Normalized lowercase hex, or null when blank or invalid. */
  value: string | null;
};

/** One reading of the accent text shared by Randomize and AI, so both tabs accept exactly the same accents. */
export function accentOrNull(raw: string): AccentReading {
  const trimmed = raw.trim();
  const parsed = accentSchema.safeParse(trimmed);
  return {
    invalid: trimmed !== "" && !parsed.success,
    value: parsed.success ? parsed.data : null,
  };
}
