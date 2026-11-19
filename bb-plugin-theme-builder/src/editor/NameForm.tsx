import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { MAX_NAME_LENGTH } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { KEY_ESCAPE } from "./keys.ts";

/**
 * Asks for the new theme's name inline when saving as new, so naming is part
 * of saving rather than a separate field to find.
 */
export function NameForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => field.current?.focus(), []);
  const name = value.trim();
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (name !== "") onSubmit(name);
  };
  return (
    <form
      className="tb-name-form"
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === KEY_ESCAPE) onCancel();
      }}
    >
      <label className="tb-name-label" htmlFor="tb-name-input">
        {COPY.nameHint}
      </label>
      <Input
        id="tb-name-input"
        ref={field}
        value={value}
        maxLength={MAX_NAME_LENGTH}
        aria-label={COPY.nameLabel}
        onChange={(event) => setValue(event.target.value)}
      />
      <Button type="submit" disabled={name === ""}>
        {COPY.save}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {COPY.cancel}
      </Button>
    </form>
  );
}
