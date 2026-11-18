import type { Dispatch, SetStateAction } from "react";
import { useId, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import {
  descriptionSchema,
  MAX_DESCRIPTION_LENGTH,
} from "../generation/contract.ts";
import { AccentField } from "./AccentField.tsx";
import { accentOrNull } from "./accent.ts";
import type { Chat } from "./chat.ts";
import { COPY } from "./copy.ts";
import type { ModelSelection } from "./model-selection.ts";

/**
 * First-message form: description, optional kept accent, Generate. The
 * description may be blank (the server takes null); Generate needs a model,
 * no open chat, and no pending work.
 */
export function AiStartForm({
  chat,
  model,
  busy,
  accent,
  onAccent,
  description,
  onDescription,
}: {
  chat: Chat;
  model: ModelSelection;
  busy: boolean;
  accent: string;
  onAccent: (accent: string) => void;
  description: string;
  onDescription: Dispatch<SetStateAction<string>>;
}) {
  // Owned by the chat hook so it survives this form unmounting on a tab switch.
  const { starting } = chat;
  const [descriptionError, setDescriptionError] = useState(false);
  const descriptionId = useId();
  const helpId = useId();
  const errorId = useId();
  const reading = accentOrNull(accent);
  const canGenerate =
    model.selection !== null && !busy && !starting && !reading.invalid;

  const generate = async () => {
    const parsed = descriptionSchema.safeParse(description);
    setDescriptionError(!parsed.success);
    if (model.selection === null || !parsed.success) return;
    const started = await chat.start({
      selection: model.selection,
      accent: reading.value,
      description: parsed.data,
    });
    if (!started) model.reset();
  };

  return (
    <>
      <label htmlFor={descriptionId} className="block text-sm">
        {COPY.aiDescriptionLabel}
      </label>
      <Textarea
        id={descriptionId}
        value={description}
        placeholder={COPY.aiDescriptionPlaceholder}
        maxLength={MAX_DESCRIPTION_LENGTH}
        rows={3}
        disabled={busy || starting}
        aria-describedby={descriptionError ? `${helpId} ${errorId}` : helpId}
        onChange={(event) => onDescription(event.target.value)}
      />
      <p id={helpId} className="tb-hint">
        {COPY.aiDescriptionHelp}
      </p>
      {descriptionError && (
        <p id={errorId} role="alert" className="tb-hint tb-field-error">
          {COPY.aiDescriptionInvalid}
        </p>
      )}
      <AccentField
        value={accent}
        onChange={onAccent}
        label={COPY.aiKeepAccent}
        disabled={busy || starting}
      />
      <div className="tb-roll-actions">
        <Button
          type="button"
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          {starting ? COPY.aiStarting : COPY.aiGenerate}
        </Button>
      </div>
    </>
  );
}
