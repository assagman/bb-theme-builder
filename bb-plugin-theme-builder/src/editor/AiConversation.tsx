import type { Dispatch, SetStateAction } from "react";
import { useId, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Textarea } from "../../components/ui/textarea.tsx";
import type { ChatState } from "../generation/contract.ts";
import { MAX_DESCRIPTION_LENGTH } from "../generation/contract.ts";
import type { Chat } from "./chat.ts";
import { COPY } from "./copy.ts";
import { KEY_ENTER } from "./keys.ts";

/**
 * Open-chat view: transcript, message box, Send, Stop while running, and New
 * chat. Turn text is untrusted model output, so it is rendered only as plain
 * React text.
 */
export function AiConversation({
  state,
  chat,
  busy,
  message,
  onMessage,
}: {
  state: Extract<ChatState, { kind: "open" }>;
  chat: Chat;
  busy: boolean;
  message: string;
  onMessage: Dispatch<SetStateAction<string>>;
}) {
  const messageId = useId();
  // The ref blocks a second Enter in the same tick; the state only drives the disabled look.
  const sendingRef = useRef(false);
  const [sending, setSending] = useState(false);
  const { running } = state;
  const blocked = running || busy || sending;

  const send = async () => {
    const text = message;
    if (blocked || sendingRef.current || text.trim() === "") return;
    sendingRef.current = true;
    setSending(true);
    try {
      const sent = await chat.send(text);
      // Cleared only on success and only if untouched, so a failed send or text typed meanwhile is never lost.
      if (sent) onMessage((current) => (current === text ? "" : current));
    } finally {
      sendingRef.current = false;
      setSending(false);
    }
  };
  const newChat = async () => {
    if (!window.confirm(COPY.aiNewChatConfirm)) return;
    if (await chat.end()) onMessage("");
  };

  return (
    <>
      <div
        role="log"
        aria-live="polite"
        aria-label={COPY.aiTranscriptLabel}
        className="tb-transcript"
      >
        {state.turns.map((turn, index) => (
          <div
            key={`${turn.at}-${turn.role}-${index}`}
            className="tb-turn"
            data-role={turn.role}
          >
            <div className="tb-turn-role">
              {turn.role === "user" ? COPY.aiYou : COPY.aiAgent}
            </div>
            <p className="tb-turn-text">{turn.text}</p>
            {turn.role === "agent" && turn.palette !== null && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy}
                onClick={() => chat.checkpoint(index)}
              >
                {COPY.aiUseVersion}
              </Button>
            )}
          </div>
        ))}
      </div>
      {running && (
        <p role="status" className="tb-hint">
          {COPY.aiWorking}
        </p>
      )}
      <label htmlFor={messageId} className="block text-sm">
        {COPY.aiMessageLabel}
      </label>
      <Textarea
        id={messageId}
        value={message}
        placeholder={COPY.aiMessagePlaceholder}
        maxLength={MAX_DESCRIPTION_LENGTH}
        rows={3}
        onChange={(event) => onMessage(event.target.value)}
        onKeyDown={(event) => {
          // Enter during IME composition confirms a candidate, not a send.
          if (
            event.key === KEY_ENTER &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            void send();
          }
        }}
      />
      <div className="tb-roll-actions">
        <Button
          type="button"
          disabled={blocked || message.trim() === ""}
          onClick={() => void send()}
        >
          {COPY.aiSend}
        </Button>
        {running && (
          <Button
            type="button"
            variant="outline"
            onClick={() => void chat.stop()}
          >
            {COPY.aiStop}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={() => void newChat()}>
          {COPY.aiNewChat}
        </Button>
      </div>
    </>
  );
}
