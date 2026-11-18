import { useId } from "react";
import { Input } from "../../components/ui/input.tsx";
import { accentOrNull } from "./accent.ts";
import { COPY } from "./copy.ts";

/** Shown in the color picker while the accent is blank or invalid; a picker cannot display "no value". */
const PICKER_FALLBACK = "#7c3aed";

/**
 * Accent color picker plus hex box with its inline error. One component so
 * Randomize and AI cannot drift apart on validation, labels or disabling;
 * the value lives in the page so it survives tab switches.
 */
export function AccentField({
  value,
  onChange,
  label,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled: boolean;
}) {
  const inputId = useId();
  const errorId = useId();
  const reading = accentOrNull(value);
  return (
    <>
      <div className="tb-token tb-token--accent">
        <label htmlFor={inputId}>{label}</label>
        <input
          type="color"
          value={reading.value ?? PICKER_FALLBACK}
          aria-label={COPY.accentPickerLabel}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
        <Input
          id={inputId}
          value={value}
          placeholder={COPY.accentPlaceholder}
          aria-invalid={reading.invalid}
          aria-describedby={reading.invalid ? errorId : undefined}
          spellCheck={false}
          disabled={disabled}
          onChange={(event) => onChange(event.target.value)}
        />
      </div>
      {reading.invalid && (
        <p id={errorId} className="tb-hint tb-field-error">
          {COPY.accentInvalid}
        </p>
      )}
    </>
  );
}
