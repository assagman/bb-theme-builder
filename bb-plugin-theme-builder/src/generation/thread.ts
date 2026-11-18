import { setTimeout as delay } from "node:timers/promises";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  type ChatStartInput,
  type GenerationSelection,
  POLL_INTERVAL_MS,
} from "./contract.ts";
import {
  type ParsedReply,
  parseChatReply,
  StaleReplyError,
} from "./palette.ts";
import { raceSignal, withTimeout } from "./timeouts.ts";

const CHAT_THREAD_TITLE = "Theme Builder chat";
// A poll right after a send can still read the previous idle state and reply; only after this grace (or after seeing the thread busy) is an off-contract reply treated as this turn's answer.
const STALE_IDLE_GRACE_MS = 5_000;
const PERMISSION_MODE = "accept-edits";
const ERROR = "The generation provider is unavailable or returned no palette.";
const CLEANUP_TIMEOUT_MS = 5_000;
const CLEANUP_TIMEOUT = "Generation cleanup deadline exceeded";
const CLEANUP_REJECTED =
  "Cleanup RPC rejected; inspect this thread and the server logs";
const SAFE_CLEANUP_CODES = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EHOSTUNREACH",
]);
const UNKNOWN_CLEANUP_CODE = "SDK_REJECTED";
const CLEANUP_TIMEOUT_CODE = "CLEANUP_TIMEOUT";
class GenerationCleanupTimeoutError extends Error {}

/** Why an agent turn ended without a usable reply; `code` is safe to log, the message is safe to show. */
export class ChatTurnError extends Error {
  // Declared as a field, not a parameter property, because Node's type stripping cannot run parameter properties.
  readonly code: "THREAD_ERROR" | "INTERACTION_REQUESTED" | "NO_PROJECT";
  constructor(code: ChatTurnError["code"], options?: ErrorOptions) {
    super(ERROR, options);
    this.name = "ChatTurnError";
    this.code = code;
  }
}

// Allowlisted codes preserve useful transport causes without copying token-bearing upstream messages.
function cleanupDiagnostic(cause: unknown) {
  if (cause instanceof GenerationCleanupTimeoutError)
    return { code: CLEANUP_TIMEOUT_CODE, cause: CLEANUP_TIMEOUT };
  const code =
    cause !== null && typeof cause === "object" && "code" in cause
      ? cause.code
      : null;
  return {
    code:
      typeof code === "string" && SAFE_CLEANUP_CODES.has(code)
        ? code
        : UNKNOWN_CLEANUP_CODE,
    cause: CLEANUP_REJECTED,
  };
}

type Threads = BbPluginApi["sdk"]["threads"];

// Cleanup failure must remain diagnosable without replacing a paid, valid palette, so each bounded step logs and never throws.
async function runThreadOperations(
  bb: BbPluginApi,
  threads: Threads,
  threadId: string,
  operations: readonly ("stop" | "archive")[],
  context: Record<string, string>,
) {
  for (const operation of operations) {
    const started = Date.now();
    try {
      await withTimeout(
        threads[operation]({ threadId }),
        CLEANUP_TIMEOUT_MS,
        () => new GenerationCleanupTimeoutError(CLEANUP_TIMEOUT),
      );
    } catch (cause) {
      bb.log.warn(
        JSON.stringify({
          ...context,
          operation,
          threadId,
          attempt: 1,
          elapsedMs: Date.now() - started,
          event: "generation_cleanup_failed",
          ...cleanupDiagnostic(cause),
        }),
      );
    }
  }
}

/** Archives a finished thread, or stops and archives an unfinished one; `context` adds IDs such as the chat session to failure logs. */
export function cleanupThread(
  bb: BbPluginApi,
  threads: Threads,
  threadId: string,
  complete: boolean,
  context: Record<string, string> = {},
) {
  return runThreadOperations(
    bb,
    threads,
    threadId,
    complete ? ["archive"] : ["stop", "archive"],
    context,
  );
}

/** Stops the running turn but keeps the thread, so a chat can continue after the user presses Stop. */
export function stopThread(
  bb: BbPluginApi,
  threads: Threads,
  threadId: string,
  context: Record<string, string> = {},
) {
  return runThreadOperations(bb, threads, threadId, ["stop"], context);
}

/** Picks the first available model that supports the text-only permission mode, so the picker has a usable default. */
export async function defaultSelection(
  bb: BbPluginApi,
): Promise<GenerationSelection | null> {
  const catalog = await bb.sdk.providers.models();
  for (const provider of catalog.providers) {
    if (
      !provider.available ||
      !provider.capabilities.permissionModes.includes(PERMISSION_MODE)
    )
      continue;
    try {
      const options = await bb.sdk.providers.models({
        providerId: provider.id,
      });
      if (options.modelLoadError !== null) continue;
      const model =
        options.models.find((value) => value.isDefault) ?? options.models.at(0);
      if (model !== undefined)
        return {
          providerId: model.routeProviderId ?? provider.id,
          model: model.model,
          reasoningLevel: model.defaultReasoningEffort,
        };
    } catch {
      /* An unavailable provider must not hide the remaining model choices. */
    }
  }
  return null;
}

/** Rejects stale or forged picker values before creating a billable session. */
export async function validateSelection(
  bb: BbPluginApi,
  selection: GenerationSelection,
  signal: AbortSignal,
): Promise<void> {
  const catalog = await bb.sdk.providers.models({
    providerId: selection.providerId,
    signal,
  });
  const provider = catalog.providers.find(
    (value) => value.id === selection.providerId && value.available,
  );
  const model = catalog.models.find(
    (value) =>
      value.model === selection.model &&
      (value.routeProviderId === undefined ||
        value.routeProviderId === selection.providerId),
  );
  if (
    catalog.modelLoadError !== null ||
    provider === undefined ||
    model === undefined ||
    !provider.capabilities.permissionModes.includes(PERMISSION_MODE) ||
    !model.supportedReasoningEfforts.some(
      (value) => value.reasoningEffort === selection.reasoningLevel,
    ) ||
    (selection.serviceTier !== undefined &&
      !provider.capabilities.supportsServiceTier)
  )
    throw new Error(ERROR);
}

// Shared by one-shot and chat generation so both use the same validated model and isolated personal workspace.
async function spawnTextThread(
  bb: BbPluginApi,
  threads: Threads,
  selection: GenerationSelection,
  title: string,
  prompt: string,
  signal: AbortSignal,
) {
  await validateSelection(bb, selection, signal);
  const projects = await bb.sdk.projects.list({
    includePersonal: true,
    signal,
  });
  const personal = projects.find((project) => project.kind === "personal");
  if (personal === undefined) throw new ChatTurnError("NO_PROJECT");
  signal.throwIfAborted();
  // A personal thread avoids feeding repository files or the editor draft into generation.
  return threads.spawn({
    projectId: personal.id,
    environment: { type: "host", workspace: { type: "personal" } },
    ...selection,
    permissionMode: PERMISSION_MODE,
    title,
    prompt,
  });
}

/**
 * Opens the long-lived chat thread and returns its ID; the caller owns cleanup from then on. If `signal` aborts first,
 * a thread that the SDK creates late is stopped and archived here, so a hung spawn can neither block nor leak.
 */
export async function spawnChatThread(
  bb: BbPluginApi,
  input: Pick<ChatStartInput, "selection">,
  prompt: string,
  signal: AbortSignal,
): Promise<string> {
  const threads = bb.sdk.threads;
  const spawn = spawnTextThread(
    bb,
    threads,
    input.selection,
    CHAT_THREAD_TITLE,
    prompt,
    signal,
  );
  try {
    return (await raceSignal(spawn, signal)).id;
  } catch (cause) {
    void spawn.then(
      (thread) => cleanupThread(bb, threads, thread.id, false),
      () => undefined,
    );
    throw cause;
  }
}

// Returned by an `onIdle` callback to keep polling, e.g. while the idle output still belongs to an earlier turn.
const KEEP_POLLING: unique symbol = Symbol("keep-polling");
type IdleHandler<T> = (
  output: string | null,
  sawBusy: boolean,
) => T | typeof KEEP_POLLING;

/**
 * Shared poll loop for one-shot and chat turns: waits until the thread is idle with nothing queued (a queued
 * delivery counts as still waiting), then lets `onIdle` accept the output or keep polling. A thread error or a
 * permission request ends the turn, because this text-only flow must never wait on a user prompt.
 */
async function pollUntilIdle<T>(
  threads: Threads,
  threadId: string,
  signal: AbortSignal,
  onIdle: IdleHandler<T>,
): Promise<T> {
  let sawBusy = false;
  while (true) {
    signal.throwIfAborted();
    const status = await raceSignal(threads.get({ threadId, signal }), signal);
    if (status.status === "error") throw new ChatTurnError("THREAD_ERROR");
    if (status.status === "idle" && status.queuedMessageCount === 0) {
      const { output } = await raceSignal(
        threads.output({ threadId, signal }),
        signal,
      );
      const result = onIdle(output, sawBusy);
      if (result !== KEEP_POLLING) return result;
    } else sawBusy = true;
    const interactions = await raceSignal(
      threads.interactions.list({ threadId, signal }),
      signal,
    );
    if (interactions.length > 0)
      throw new ChatTurnError("INTERACTION_REQUESTED");
    await delay(POLL_INTERVAL_MS, undefined, { signal });
  }
}

/**
 * Polls one chat turn until the thread is idle with a reply that echoes `requestId`. Replies to earlier messages are
 * skipped until `signal` (the turn deadline or a user stop) aborts; a permission request ends the turn with an error.
 */
export function awaitTurn(
  bb: BbPluginApi,
  threadId: string,
  requestId: string,
  accent: string | null,
  signal: AbortSignal,
): Promise<ParsedReply> {
  const started = Date.now();
  return pollUntilIdle(bb.sdk.threads, threadId, signal, (output, sawBusy) => {
    if (output === null) return KEEP_POLLING;
    try {
      return parseChatReply(output, requestId, accent);
    } catch (cause) {
      const settled = sawBusy || Date.now() - started >= STALE_IDLE_GRACE_MS;
      // An earlier turn's reply, or prose read before this turn visibly started; keep polling until this turn answers.
      if (cause instanceof StaleReplyError || !settled) return KEEP_POLLING;
      throw cause;
    }
  });
}

/** Sends a follow-up message; an active thread queues it, and the poller treats a queued delivery as still waiting. */
export async function sendChatMessage(
  bb: BbPluginApi,
  threadId: string,
  text: string,
  signal: AbortSignal,
): Promise<void> {
  await raceSignal(
    bb.sdk.threads.send({
      threadId,
      mode: "queue-if-active",
      input: [{ type: "text", text, mentions: [] }],
    }),
    signal,
  );
}
