/**
 * Keeps one bb agent thread open per AI chat so the user can refine a theme with follow-up messages.
 * The record lives in plugin kv so a page reload restores the chat; the sweeper and `close()` end sessions
 * so no agent thread outlives its page (deny by default: a session that is not proven alive is ended).
 */
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import type { BbPluginApi, PluginKvStorage } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { createSerialExecutor } from "../presets/serial.ts";
import { idSchema } from "../theme/schema.ts";
import { TOKEN_KEYS } from "../theme/tokens.ts";
import {
  accentSchema,
  CHAT_ENDED_MESSAGE,
  type ChatSendInput,
  type ChatStartInput,
  type ChatState,
  type ChatTurn,
  chatTurnSchema,
  type GeneratedPalette,
  generatedPaletteSchema,
  IDLE_MS,
  MAX_CHAT_TURNS,
  PAGE_CLOSED_MS,
  PING_INTERVAL_MS,
  selectionSchema,
  TURN_TIMEOUT_MS,
} from "./contract.ts";
import {
  chatFollowUpPrompt,
  chatOpeningPrompt,
  InvalidReplyError,
  type ParsedReply,
} from "./palette.ts";
import {
  awaitTurn,
  ChatTurnError,
  cleanupThread,
  sendChatMessage,
  spawnChatThread,
  stopThread,
} from "./thread.ts";
import { settleWithin, withTimeout } from "./timeouts.ts";

// Versioned so a future record shape can migrate instead of misreading old rows.
const SESSION_KEY = "chat-session.v1";
// kv rows are capped at 256KB; staying well below leaves headroom for storage encoding.
const MAX_RECORD_BYTES = 192 * 1024;
// kv is local, so a call slower than this is hung; failing it frees the serial queue for every other chat RPC.
const KV_TIMEOUT_MS = 5_000;
// Shown as the user's line when the first message has only an accent and no brief.
const NO_BRIEF_TEXT = "Create a theme.";
// Bounds how long disposal and Stop wait for a turn task that the SDK may not abort promptly.
const SETTLE_TIMEOUT_MS = 15_000;
const CORRUPT_RECORD = "chat_session_corrupt";
// User-facing texts in one place, so wording stays consistent and reviewable.
const MESSAGES = {
  stopped: "Stopped. Send a message to continue.",
  timedOut: "The agent took too long. Send your message again.",
  failed:
    "The agent is unavailable. Check that the selected provider is signed in, then try again.",
  interrupted: "The last message was interrupted. Send it again.",
  missing: CHAT_ENDED_MESSAGE,
  busy: "The agent is still answering. Wait for it or press Stop.",
  closed: "Theme Builder is reloading. Reload the page and try again.",
  tooLarge: "The chat is too large to save. Start a new chat.",
  storage: "Theme Builder could not save the chat. Try again.",
} as const;

/** Reasons a chat operation is refused; `code` is safe to log and the message is safe to show. */
export class ChatSessionError extends Error {
  // A field rather than a parameter property, which Node's type stripping cannot run.
  readonly code:
    | "STORAGE_FAILED"
    | "MISSING"
    | "BUSY"
    | "CLOSED"
    | "TOO_LARGE"
    | "STORAGE_TIMEOUT";
  constructor(
    code: ChatSessionError["code"],
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ChatSessionError";
    this.code = code;
  }
}

const sessionRecordSchema = z.strictObject({
  sessionId: idSchema,
  // Null until the spawn returns, or after a failed spawn; the next message then spawns again.
  threadId: z.string().min(1).nullable(),
  selection: selectionSchema,
  accent: accentSchema.nullable(),
  turns: z.array(chatTurnSchema).max(MAX_CHAT_TURNS),
  lastAgentPalette: generatedPaletteSchema.nullable(),
  // Makes start/send idempotent when the page retries a request it never saw answered.
  lastRequestId: idSchema,
  // Set while a turn runs; finding it on load means a restart cut the turn off.
  pendingRequestId: idSchema.nullable(),
  // The thread may hold a palette the user never received (failed, stopped, or cut-off turn), so the next message must restate the draft.
  contextDirty: z.boolean(),
  lastActivityAt: z.number(),
  lastPingAt: z.number(),
});
// Loose shape used only to compensate the thread of a row that failed validation.
const threadReferenceSchema = z.object({ threadId: z.string().min(1) });
type SessionRecord = z.infer<typeof sessionRecordSchema>;
type Turn = {
  sessionId: string;
  controller: AbortController;
  task: Promise<void>;
  stopped: boolean;
};
type Deliver = (signal: AbortSignal) => Promise<string>;
type TurnOutcome =
  | { ok: true; reply: ParsedReply }
  | { ok: false; message: string };

// Token-wise comparison, because key order in client JSON is not meaningful.
function samePalette(a: GeneratedPalette, b: GeneratedPalette): boolean {
  return TOKEN_KEYS.every(
    (key) => a.light[key] === b.light[key] && a.dark[key] === b.dark[key],
  );
}

function recordBytes(record: SessionRecord): number {
  return new TextEncoder().encode(JSON.stringify(record)).byteLength;
}

// Log codes only: causes can carry prompt text or token-bearing upstream messages.
function failureCode(cause: unknown, timedOut: boolean): string {
  if (timedOut) return "TURN_TIMEOUT";
  if (cause instanceof InvalidReplyError) return "INVALID_REPLY";
  if (cause instanceof ChatTurnError || cause instanceof ChatSessionError)
    return cause.code;
  return "SDK_REJECTED";
}

function failureMessage(
  stopped: boolean,
  timedOut: boolean,
  cause: unknown,
): string {
  if (stopped) return MESSAGES.stopped;
  if (timedOut) return MESSAGES.timedOut;
  if (cause instanceof InvalidReplyError || cause instanceof ChatSessionError)
    return cause.message;
  return MESSAGES.failed;
}

// A hung storage call fails fast instead of blocking the serial queue that every chat RPC and the sweeper share;
// any storage failure becomes a domain error (cause kept) so the page shows a save message, not raw driver text.
async function boundedKv<T>(promise: Promise<T>): Promise<T> {
  try {
    return await withTimeout(
      promise,
      KV_TIMEOUT_MS,
      () => new ChatSessionError("STORAGE_TIMEOUT", MESSAGES.storage),
    );
  } catch (cause) {
    if (cause instanceof ChatSessionError) throw cause;
    throw new ChatSessionError("STORAGE_FAILED", MESSAGES.storage, { cause });
  }
}

/**
 * Owns the single chat session of this plugin install. Every state change runs through one serial queue;
 * agent turns run outside it and re-enter it only to record their outcome, so Stop and end never wait on a turn.
 * Changes are built as a new record, persisted, and only then assigned, so a failed write leaves memory and kv agreeing.
 */
export function createChatSessions(
  bb: BbPluginApi,
  kv: PluginKvStorage,
  now: () => number = Date.now,
) {
  // Captured cleanup methods remain usable after BB invalidates fresh SDK access during disposal.
  const threads = bb.sdk.threads;
  const serial = createSerialExecutor();
  let record: SessionRecord | null = null;
  let loaded = false;
  let turn: Turn | null = null;
  let error: string | null = null;
  let closed = false;

  function log(level: "info" | "warn", fields: Record<string, unknown>) {
    bb.log[level](JSON.stringify(fields));
  }

  function chatTurn(
    role: ChatTurn["role"],
    text: string,
    palette: GeneratedPalette | null,
  ): ChatTurn {
    return { role, text, palette, at: new Date(now()).toISOString() };
  }

  /**
   * Writes `next` and returns the stored copy. The size loop is a fail-closed guard: 40 full-palette turns measure
   * about 39KB, so it trips only if token or text caps grow; it drops the oldest turns so the newest checkpoints
   * survive, and TOO_LARGE refuses the write rather than letting kv reject a row mid-session.
   */
  async function persist(next: SessionRecord): Promise<SessionRecord> {
    const fitted = { ...next, turns: next.turns.slice(-MAX_CHAT_TURNS) };
    while (recordBytes(fitted) > MAX_RECORD_BYTES && fitted.turns.length > 0)
      fitted.turns.shift();
    if (recordBytes(fitted) > MAX_RECORD_BYTES)
      throw new ChatSessionError("TOO_LARGE", MESSAGES.tooLarge);
    await boundedKv(kv.set(SESSION_KEY, fitted));
    return fitted;
  }

  // A restart cut the last turn off: stop whatever the thread still runs, and mark its context as diverged.
  async function recoverInterrupted(found: SessionRecord) {
    if (found.threadId !== null)
      await stopThread(bb, threads, found.threadId, {
        sessionId: found.sessionId,
      });
    record = await persist({
      ...found,
      pendingRequestId: null,
      contextDirty: true,
    });
    error = MESSAGES.interrupted;
    log("warn", {
      event: "chat_turn_interrupted",
      operation: "load",
      sessionId: found.sessionId,
      threadId: found.threadId,
    });
  }

  // A corrupt row is dropped after compensating its thread, so a bad write can never wedge the chat.
  async function load(): Promise<SessionRecord | null> {
    if (loaded) return record;
    const value = await boundedKv(kv.get<unknown>(SESSION_KEY));
    if (value !== undefined) {
      const parsed = sessionRecordSchema.safeParse(value);
      if (!parsed.success) {
        const reference = threadReferenceSchema.safeParse(value);
        const threadId = reference.success ? reference.data.threadId : null;
        log("warn", { event: CORRUPT_RECORD, operation: "load", threadId });
        if (threadId !== null)
          await cleanupThread(bb, threads, threadId, false);
        await boundedKv(kv.delete(SESSION_KEY));
      } else if (parsed.data.pendingRequestId !== null)
        await recoverInterrupted(parsed.data);
      else record = parsed.data;
    }
    loaded = true;
    return record;
  }

  function state(): ChatState {
    if (record === null) return { kind: "none" };
    return {
      kind: "open",
      sessionId: record.sessionId,
      selection: record.selection,
      accent: record.accent,
      turns: record.turns,
      running: turn?.sessionId === record.sessionId,
      error,
    };
  }

  function ensureOpen() {
    if (closed) throw new ChatSessionError("CLOSED", MESSAGES.closed);
  }

  async function requireSession(sessionId: string): Promise<SessionRecord> {
    const current = await load();
    if (current?.sessionId !== sessionId)
      throw new ChatSessionError("MISSING", MESSAGES.missing);
    return current;
  }

  // Must run inside the serial queue; deleting the row last keeps a crash mid-cleanup retryable by the sweeper.
  async function endCurrent(reason: string): Promise<void> {
    const current = record;
    if (current === null) return;
    const started = now();
    const running = turn?.sessionId === current.sessionId;
    if (running) turn?.controller.abort();
    record = null;
    error = null;
    // An idle thread only needs archiving; stopping it too would just log a rejected stop.
    if (current.threadId !== null)
      await cleanupThread(bb, threads, current.threadId, !running, {
        sessionId: current.sessionId,
      });
    await boundedKv(kv.delete(SESSION_KEY));
    log("info", {
      event: "chat_session_ended",
      operation: "end",
      reason,
      sessionId: current.sessionId,
      threadId: current.threadId,
      elapsedMs: now() - started,
    });
  }

  // Records the thread ID only if the session still exists and the write succeeds; otherwise the fresh thread is compensated at once.
  async function attachThread(
    sessionId: string,
    threadId: string,
  ): Promise<void> {
    let attached: boolean;
    try {
      attached = await serial.run(async () => {
        if (record?.sessionId !== sessionId) return false;
        record = await persist({ ...record, threadId });
        return true;
      });
    } catch (cause) {
      // The record never referenced this thread, so archiving it cannot strand the session.
      await cleanupThread(bb, threads, threadId, false, { sessionId });
      throw cause;
    }
    if (attached) return;
    await cleanupThread(bb, threads, threadId, false, { sessionId });
    throw new ChatSessionError("MISSING", MESSAGES.missing);
  }

  function spawnDelivery(current: SessionRecord, prompt: string): Deliver {
    const { sessionId, selection } = current;
    return async (signal) => {
      const threadId = await spawnChatThread(bb, { selection }, prompt, signal);
      await attachThread(sessionId, threadId);
      return threadId;
    };
  }

  // Delivers and awaits one turn. A failure that was not a user stop or session end also stops the thread, so it
  // cannot keep working past the deadline or leave a pending permission request that would fail every later send.
  async function runTurn(
    entry: Turn,
    current: SessionRecord,
    requestId: string,
    deliver: Deliver,
  ): Promise<TurnOutcome> {
    const deadline = AbortSignal.timeout(TURN_TIMEOUT_MS);
    const signal = AbortSignal.any([entry.controller.signal, deadline]);
    const started = now();
    let threadId = current.threadId;
    try {
      threadId = await deliver(signal);
      const reply = await awaitTurn(
        bb,
        threadId,
        requestId,
        current.accent,
        signal,
      );
      return { ok: true, reply };
    } catch (cause) {
      const cancelled = entry.controller.signal.aborted;
      const timedOut = deadline.aborted && !cancelled;
      if (!cancelled) {
        log("warn", {
          event: "chat_turn_failed",
          operation: "turn",
          sessionId: entry.sessionId,
          threadId,
          elapsedMs: now() - started,
          code: failureCode(cause, timedOut),
        });
        if (threadId !== null)
          await stopThread(bb, threads, threadId, {
            sessionId: entry.sessionId,
          });
      }
      return {
        ok: false,
        message: failureMessage(entry.stopped, timedOut, cause),
      };
    }
  }

  // Applies a turn outcome only if this turn is still the session's current one; a stale or ended turn changes nothing.
  async function finishTurn(entry: Turn, outcome: TurnOutcome): Promise<void> {
    await serial.run(async () => {
      if (turn !== entry) return;
      turn = null;
      if (record?.sessionId !== entry.sessionId) return;
      const base = { ...record, pendingRequestId: null };
      const next: SessionRecord = outcome.ok
        ? {
            ...base,
            turns: [
              ...base.turns,
              chatTurn("agent", outcome.reply.summary, outcome.reply.palette),
            ],
            lastAgentPalette: outcome.reply.palette,
            contextDirty: false,
          }
        : { ...base, contextDirty: true };
      try {
        record = await persist(next);
        error = outcome.ok ? null : outcome.message;
      } catch (cause) {
        error = MESSAGES.storage;
        throw cause;
      }
    });
  }

  function logSettleFailure(sessionId: string, cause: unknown) {
    // A closed queue means disposal already ended the session; anything else lost a turn and must be visible.
    if (closed) return;
    log("warn", {
      event: "chat_turn_settle_failed",
      operation: "settle",
      sessionId,
      code: failureCode(cause, false),
    });
  }

  // Shared by start and send: persist the user's line with the turn marked pending, then run the turn in the
  // background; the RPC returns the running state at once and the page polls `get`.
  async function beginTurn(
    next: SessionRecord,
    requestId: string,
    deliver: Deliver,
  ): Promise<ChatState> {
    const current = await persist({
      ...next,
      lastRequestId: requestId,
      pendingRequestId: requestId,
    });
    record = current;
    error = null;
    const entry: Turn = {
      sessionId: current.sessionId,
      controller: new AbortController(),
      task: Promise.resolve(),
      stopped: false,
    };
    turn = entry;
    entry.task = runTurn(entry, current, requestId, deliver)
      .then((outcome) => finishTurn(entry, outcome))
      .catch((cause) => logSettleFailure(entry.sessionId, cause));
    return state();
  }

  return {
    /** Ends any open chat and starts a new one; a retried request with the same ID returns the existing chat. */
    start(input: ChatStartInput): Promise<ChatState> {
      ensureOpen();
      return serial.run(async () => {
        const previous = await load();
        if (previous?.lastRequestId === input.requestId) return state();
        await endCurrent("replaced");
        const at = now();
        const next: SessionRecord = {
          sessionId: randomUUID(),
          threadId: null,
          selection: input.selection,
          accent: input.accent,
          // The Randomize palette the user asked to refine is kept on their line, like a hand edit.
          turns: [
            chatTurn("user", input.description ?? NO_BRIEF_TEXT, input.palette),
          ],
          lastAgentPalette: null,
          lastRequestId: input.requestId,
          pendingRequestId: null,
          contextDirty: false,
          lastActivityAt: at,
          lastPingAt: at,
        };
        const prompt = chatOpeningPrompt(
          input.accent,
          input.requestId,
          input.description,
          input.palette,
        );
        return beginTurn(next, input.requestId, spawnDelivery(next, prompt));
      });
    },
    /** Sends a follow-up; the draft palette rides along when it differs from the agent's last reply or the thread context diverged. */
    send(input: ChatSendInput): Promise<ChatState> {
      ensureOpen();
      return serial.run(async () => {
        const current = await requireSession(input.sessionId);
        if (current.lastRequestId === input.requestId) return state();
        if (turn?.sessionId === current.sessionId)
          throw new ChatSessionError("BUSY", MESSAGES.busy);
        const edited =
          current.lastAgentPalette !== null &&
          !samePalette(current.lastAgentPalette, input.palette);
        const handEdit = current.contextDirty || edited ? input.palette : null;
        const next: SessionRecord = {
          ...current,
          turns: [...current.turns, chatTurn("user", input.text, handEdit)],
          lastActivityAt: now(),
        };
        const { threadId } = current;
        // A failed first spawn left no thread; this message opens one, starting from the draft the user sees.
        const deliver: Deliver =
          threadId === null
            ? spawnDelivery(
                current,
                chatOpeningPrompt(
                  current.accent,
                  input.requestId,
                  input.text,
                  input.palette,
                ),
              )
            : async (signal) => {
                await sendChatMessage(
                  bb,
                  threadId,
                  chatFollowUpPrompt(input.requestId, input.text, handEdit),
                  signal,
                );
                return threadId;
              };
        return beginTurn(next, input.requestId, deliver);
      });
    },
    /** Current chat for the page; also how a reload restores the transcript. */
    get(): Promise<ChatState> {
      ensureOpen();
      return serial.run(async () => {
        await load();
        return state();
      });
    },
    /** Stops the running turn and keeps the session, so the user can send another message. */
    async stop({ sessionId }: { sessionId: string }): Promise<ChatState> {
      ensureOpen();
      const current = await serial.run(() => requireSession(sessionId));
      const entry = turn;
      if (entry?.sessionId === sessionId) {
        entry.stopped = true;
        entry.controller.abort();
        if (current.threadId !== null)
          await stopThread(bb, threads, current.threadId, { sessionId });
        await settleWithin(entry.task, SETTLE_TIMEOUT_MS);
      }
      return serial.run(async () => state());
    },
    /** Ends the chat (stop + archive the thread, drop the record); ending an unknown session is a no-op. */
    end({ sessionId }: { sessionId: string }): Promise<{ kind: "none" }> {
      ensureOpen();
      return serial.run(async () => {
        if ((await load())?.sessionId === sessionId) await endCurrent("user");
        return { kind: "none" as const };
      });
    },
    /** Heartbeat from the open page; a missing heartbeat lets the sweeper end the chat. */
    ping({ sessionId }: { sessionId: string }): Promise<{ alive: boolean }> {
      ensureOpen();
      return serial.run(async () => {
        const current = await load();
        if (current?.sessionId !== sessionId) return { alive: false };
        record = await persist({ ...current, lastPingAt: now() });
        return { alive: true };
      });
    },
    /** Ends a chat whose page stopped pinging or whose user stopped writing; run on start and on every ping interval. */
    sweep(): Promise<void> {
      ensureOpen();
      return serial.run(async () => {
        const current = await load();
        if (current === null) return;
        const at = now();
        if (at - current.lastPingAt > PAGE_CLOSED_MS)
          await endCurrent("page_closed");
        else if (at - current.lastActivityAt > IDLE_MS)
          await endCurrent("idle");
      });
    },
    /** Disposal: ends the chat so no agent thread outlives the plugin, then waits a bounded time for the turn task. */
    async close(): Promise<void> {
      if (closed) return;
      closed = true;
      const entry = turn;
      try {
        await serial.run(async () => {
          await load();
          await endCurrent("dispose");
        });
      } finally {
        await serial.close();
        if (entry !== null) await settleWithin(entry.task, SETTLE_TIMEOUT_MS);
      }
    },
  };
}

/** Chat session manager as wired into the server. */
export type ChatSessions = ReturnType<typeof createChatSessions>;

/**
 * Background service that sweeps at once (so sessions left past their limits by a restart are archived on start)
 * and then on every ping interval. One failed pass is logged, not thrown, so it cannot crash-loop the service.
 */
export function chatSweeperService(bb: BbPluginApi, chat: ChatSessions) {
  return {
    async start(signal: AbortSignal) {
      while (!signal.aborted) {
        try {
          await chat.sweep();
        } catch (cause) {
          bb.log.warn(
            JSON.stringify({
              event: "chat_sweep_failed",
              operation: "sweep",
              code: failureCode(cause, false),
            }),
          );
        }
        // Abort ends the wait early; the loop condition then exits, so the rejection carries no failure.
        await delay(PING_INTERVAL_MS, undefined, { signal }).catch(
          () => undefined,
        );
      }
    },
  };
}
