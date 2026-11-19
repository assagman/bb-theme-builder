import type { ReactNode } from "react";
import { Input } from "../../components/ui/input.tsx";

/**
 * Layout shared by every color row of the Edit tab: name and `--token`
 * name, native picker, hex field, then a trailing slot (contrast badge for
 * palette colors, auto/reset for derived ones). One shell keeps the label,
 * picker and field wired the same way for both kinds of row.
 */
export function TokenRow({
  id,
  label,
  css,
  pickerValue,
  onPick,
  value,
  placeholder,
  invalid,
  describedBy,
  onType,
  trailing,
}: {
  /** Id of the hex field; the label points at it. */
  id: string;
  label: string;
  css: string;
  /** `#rrggbb` shown by the native picker, which has no alpha or invalid state. */
  pickerValue: string;
  onPick: (hex: string) => void;
  value: string;
  placeholder?: string;
  invalid: boolean;
  describedBy?: string;
  onType: (text: string) => void;
  trailing: ReactNode;
}) {
  return (
    <div className="tb-token">
      <label htmlFor={id}>
        {label}
        <code className="tb-token-css">{css}</code>
      </label>
      <input
        type="color"
        value={pickerValue}
        aria-label={`${label} color`}
        onChange={(event) => onPick(event.target.value)}
      />
      <Input
        id={id}
        value={value}
        placeholder={placeholder}
        aria-invalid={invalid}
        spellCheck={false}
        aria-describedby={describedBy}
        onChange={(event) => onType(event.target.value.toLowerCase())}
      />
      {trailing}
    </div>
  );
}
