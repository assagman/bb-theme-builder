import { useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CHAT_ENDED_MESSAGE,
  type ChatState,
  type ChatTurn,
  chatMessageSchema,
  type GeneratedPalette,
  type GenerationSelection,
  PING_INTERVAL_MS,
  POLL_INTERVAL_MS,
} from "../generation/contract.ts";
import type { rpcContract } from "../presets/contract.ts";
import { paletteOf } from "../theme/schema.ts";
import type { ThemeDraft } from "../theme/tokens.ts";
import { describeError } from "./describe-error.ts";
import { useEditorField } from "./store.ts";

const LOG_PREFIX = "[theme-builder]";
const NO_CHAT: ChatState = { kind: "none" };
const EMPTY_MESSAGE = "Write a message before sending.";
const NO_SESSION_MESSAGE = "There is no open conversation.";

/** Carries the failed operation, session, and cause so a log line explains itself; never includes prompt text. */
export class ChatError extends Error {
  readonly operation: string;
  readonly sessionId: string | null;
  constructor(operation: string, sessionId: string | null, cause: unknown) {
    super(`Chat ${operation} failed`, { cause });
    this.name = "ChatError";
    this.operation = operation;
    this.sessionId = sessionId;
  }
}

/** The palette a user or agent turn would leave in the draft; fonts and name are never part of a checkpoint. */
export function applyAgentPalette(
  draft: ThemeDraft,
  palette: GeneratedPalette,
): ThemeDraft {
  return {
    ...draft,
    light: structuredClone(palette.light),
    dark: structuredClone(palette.dark),
  };
}

/** Newest agent palette among turns not yet shown, so a poll that delivers two replies still lands on the last one. */
export function latestUnseenAgentPalette(
  turns: ChatTurn[],
  seen: number,
): GeneratedPalette | null {
  for (let index = turns.length - 1; index >= seen; index--) {
    const turn = turns[index];
    if (turn?.role === "agent" && turn.palette !== null) return turn.palette;
  }
  return null;
}

/** Null when the turn is missing or holds no palette, so a stale button cannot blank the draft. */
export function checkpointPalette(
  state: ChatState,
  turnIndex: number,
): GeneratedPalette | null {
  return state.kind === "open"
    ? (state.turns[turnIndex]?.palette ?? null)
    : null;
}

/** First chat message; palette and request id are added by the hook. */
export type ChatStartRequest = {
  selection: GenerationSelection;
  accent: string | null;
  description: string | null;
};

/** Fallback for send/stop, which fail with one fixed message on an ended session; ping reports liveness as a typed result instead. */
export function isSessionGone(cause: unknown): boolean {
  return describeError(cause).includes(CHAT_ENDED_MESSAGE);
}

/**
 * Turns an unseen-turn watermark and a new server state into the next
 * watermark. It only grows within a session, so a late response can never
 * make an old reply look new again.
 */
export function nextSeen(
  previous: { sessionId: string; count: number },
  next: ChatState,
): { sessionId: string; count: number } {
  if (next.kind === "none") return { sessionId: "", count: 0 };
  const known = previous.sessionId === next.sessionId ? previous.count : 0;
  return {
    sessionId: next.sessionId,
    count: Math.max(known, next.turns.length),
  };
}

/**
 * One agent conversation that refines the draft. The server owns the session,
 * so the page only mirrors it, polls while a turn runs, and keeps it alive.
 */
export function useChat() {
  const rpc = useRpc<typeof rpcContract>();
  const [draft, setDraft] = useEditorField("draft");
  const [state, setState] = useState<ChatState>(NO_CHAT);
  const [error, setError] = useState<string | null>(null);
  // Turns already reflected in the draft, per session, so a poll never re-applies an old reply over later hand edits.
  const seen = useRef({ sessionId: "", count: 0 });
  // Tickets order calls by when they were issued; an older answer arriving late must not undo a newer one.
  const issued = useRef(0);
  const applied = useRef(0);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const sessionId = state.kind === "open" ? state.sessionId : null;
  const running = state.kind === "open" && state.running;

  const adopt = useCallback(
    (ticket: number, next: ChatState, replay: boolean) => {
      if (ticket < applied.current) return;
      applied.current = ticket;
      if (next.kind === "open") {
        const known =
          seen.current.sessionId === next.sessionId ? seen.current.count : 0;
        const palette = latestUnseenAgentPalette(
          next.turns,
          replay ? known : next.turns.length,
        );
        if (palette !== null)
          setDraft((value) => applyAgentPalette(value, palette));
      }
      seen.current = nextSeen(seen.current, next);
      setState(next);
    },
    [setDraft],
  );

  // One boundary for every chat failure: log once with identifiers, show the cause, and close a chat the server ended.
  const fail = useCallback(
    (ticket: number, operation: string, id: string | null, cause: unknown) => {
      // A failure that finished after a newer answer was applied describes a state the page already left.
      if (ticket < applied.current) return;
      const failure = new ChatError(operation, id, cause);
      console.warn(`${LOG_PREFIX} chat operation failed`, {
        operation: failure.operation,
        sessionId: failure.sessionId,
        cause: describeError(cause),
      });
      setError(describeError(cause));
      if (isSessionGone(cause)) adopt(ticket, NO_CHAT, true);
    },
    [adopt],
  );

  const guarded = useCallback(
    async (
      operation: string,
      id: string | null,
      call: () => Promise<ChatState>,
    ) => {
      const ticket = ++issued.current;
      setError(null);
      try {
        adopt(ticket, await call(), true);
      } catch (cause) {
        fail(ticket, operation, id, cause);
      }
    },
    [adopt, fail],
  );

  // A reload mid-conversation reattaches to the server session; its history is shown but never replayed into the draft.
  useEffect(() => {
    let active = true;
    const ticket = ++issued.current;
    void rpc.call("chatGet", {}).then(
      (value) => {
        if (active) adopt(ticket, value, false);
      },
      (cause) => {
        if (active) fail(ticket, "get", null, cause);
      },
    );
    return () => {
      active = false;
    };
  }, [rpc, adopt, fail]);

  // Chained timeouts rather than an interval so a slow poll can never overlap the next one.
  useEffect(() => {
    if (!running) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let active = true;
    const tick = () => {
      timer = setTimeout(async () => {
        const ticket = ++issued.current;
        try {
          const next = await rpc.call("chatGet", {});
          if (active) adopt(ticket, next, true);
        } catch (cause) {
          if (active) fail(ticket, "poll", sessionId, cause);
        }
        if (active) tick();
      }, POLL_INTERVAL_MS);
    };
    tick();
    return () => {
      active = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [rpc, adopt, fail, running, sessionId]);

  // Without pings the server treats the page as closed and ends the session to avoid an orphan agent thread.
  useEffect(() => {
    if (sessionId === null) return;
    const timer = setInterval(() => {
      const ticket = ++issued.current;
      void rpc.call("chatPing", { sessionId }).then(
        (result) => {
          // Only the session that was pinged may be closed; a late answer must not close a newer chat.
          if (!result.alive && seen.current.sessionId === sessionId)
            adopt(ticket, NO_CHAT, true);
        },
        (cause) => fail(ticket, "ping", sessionId, cause),
      );
    }, PING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [rpc, fail, sessionId]);

  const start = useCallback(
    (input: ChatStartRequest) =>
      guarded("start", null, () =>
        rpc.call("chatStart", {
          requestId: crypto.randomUUID(),
          selection: input.selection,
          accent: input.accent,
          description: input.description,
          palette: paletteOf(draftRef.current),
        }),
      ),
    [rpc, guarded],
  );
  const send = useCallback(
    (text: string) => {
      const message = chatMessageSchema.safeParse(text);
      if (!message.success || sessionId === null) {
        setError(sessionId === null ? NO_SESSION_MESSAGE : EMPTY_MESSAGE);
        return Promise.resolve();
      }
      // The current palette always travels so the server can tell whether hand edits need a note to the agent.
      return guarded("send", sessionId, () =>
        rpc.call("chatSend", {
          sessionId,
          requestId: crypto.randomUUID(),
          text: message.data,
          palette: paletteOf(draftRef.current),
        }),
      );
    },
    [rpc, guarded, sessionId],
  );
  const stop = useCallback(() => {
    if (sessionId === null) return Promise.resolve();
    return guarded("stop", sessionId, () =>
      rpc.call("chatStop", { sessionId }),
    );
  }, [rpc, guarded, sessionId]);
  const end = useCallback(() => {
    if (sessionId === null) return Promise.resolve();
    return guarded("end", sessionId, () => rpc.call("chatEnd", { sessionId }));
  }, [rpc, guarded, sessionId]);
  const checkpoint = useCallback(
    (turnIndex: number) => {
      const palette = checkpointPalette(state, turnIndex);
      if (palette !== null)
        setDraft((value) => applyAgentPalette(value, palette));
    },
    [state, setDraft],
  );

  return { state, error, start, send, stop, end, checkpoint };
}
