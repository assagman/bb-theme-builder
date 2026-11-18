import { type FormEvent, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import { MAX_NAME_LENGTH } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { KEY_ESCAPE } from "./keys.ts";

/** What the name is for; save and apply create the theme, rename edits it. */
export type Naming = "save" | "apply" | "rename";
const HINT: Record<Naming, string> = {
  save: COPY.nameHintSave,
  apply: COPY.nameHintApply,
  rename: COPY.nameHintRename,
};
const SUBMIT: Record<Naming, string> = {
  save: COPY.save,
  apply: COPY.apply,
  rename: COPY.renameConfirm,
};

/**
 * Asks for the theme name inline, so naming a new theme is part of saving it
 * rather than a separate field to find. Callers key it on `naming` so the
 * initial value is never left over from another purpose.
 */
export function NameForm({
  naming,
  initial,
  onSubmit,
  onCancel,
}: {
  naming: Naming;
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
        {HINT[naming]}
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
        {SUBMIT[naming]}
      </Button>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {COPY.cancel}
      </Button>
    </form>
  );
}
