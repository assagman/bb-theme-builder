import { experimental_ProviderModelPicker as ProviderModelPicker } from "@get-bb/plugin-sdk/app";
import type { Dispatch, SetStateAction } from "react";
import { AiConversation } from "./AiConversation.tsx";
import { AiStartForm } from "./AiStartForm.tsx";
import type { Chat } from "./chat.ts";
import { COPY } from "./copy.ts";
import type { ModelSelection } from "./model-selection.ts";

/** Everything the page keeps alive across tab switches; the tab itself holds no chat state. */
export type AiTabProps = {
  busy: boolean;
  /** Whether the draft passes its schema; sending an invalid draft would fail at the server. */
  valid: boolean;
  accent: string;
  onAccent: (accent: string) => void;
  chat: Chat;
  model: ModelSelection;
  description: string;
  onDescription: Dispatch<SetStateAction<string>>;
  message: string;
  onMessage: Dispatch<SetStateAction<string>>;
};

/**
 * AI tab body: a thin switch between the first-message form and the
 * conversation. Chat, model, and typed text are owned by the page, because
 * this tab unmounts when another tab opens and the session must keep polling
 * and pinging meanwhile.
 */
export function AiTab(props: AiTabProps) {
  const { chat, model, busy } = props;
  const { state } = chat;
  // A chat that exists on the server but is not fetched yet must not show a start form that would swallow input.
  if (!chat.loaded) return <p className="tb-hint">{COPY.aiLoadingChat}</p>;
  const shown = state.kind === "open" ? state.selection : model.selection;
  // Same text from the hook and the session would otherwise render twice.
  const alerts = [
    ...new Set(
      [chat.error, state.kind === "open" ? state.error : null].filter(
        (text): text is string => text !== null && text !== "",
      ),
    ),
  ];
  return (
    <div className="space-y-4">
      <p className="tb-hint">{COPY.aiIntro}</p>
      <fieldset className="space-y-2">
        <legend className="text-sm">{COPY.aiModelLabel}</legend>
        {shown !== null ? (
          <ProviderModelPicker
            value={shown}
            onChange={model.choose}
            disabled={state.kind === "open" || busy || model.loading}
          />
        ) : (
          <p role="status" className="tb-hint">
            {model.loading ? COPY.aiModelLoading : COPY.aiModelUnavailable}
          </p>
        )}
      </fieldset>
      {state.kind === "open" ? (
        <AiConversation
          state={state}
          chat={chat}
          busy={busy}
          valid={props.valid}
          message={props.message}
          onMessage={props.onMessage}
        />
      ) : (
        <AiStartForm
          chat={chat}
          model={model}
          busy={busy}
          valid={props.valid}
          accent={props.accent}
          onAccent={props.onAccent}
          description={props.description}
          onDescription={props.onDescription}
        />
      )}
      {alerts.map((text) => (
        <p key={text} role="alert" className="tb-hint tb-field-error">
          {text}
        </p>
      ))}
    </div>
  );
}
