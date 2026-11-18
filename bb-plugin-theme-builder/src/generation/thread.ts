import { setTimeout as delay } from "node:timers/promises";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import {
  type GenerationInput,
  type GenerationSelection,
  POLL_INTERVAL_MS,
} from "./contract.ts";
import { generationPrompt } from "./palette.ts";

const THREAD_TITLE = "Theme Builder palette generation";
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

// Cleanup failure must remain diagnosable without replacing a paid, valid palette.
async function cleanupThread(
  bb: BbPluginApi,
  threads: BbPluginApi["sdk"]["threads"],
  threadId: string,
  complete: boolean,
) {
  const operations = complete
    ? ["archive" as const]
    : ["stop" as const, "archive" as const];
  for (const operation of operations) {
    const started = Date.now();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        threads[operation]({ threadId }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new GenerationCleanupTimeoutError(CLEANUP_TIMEOUT)),
            CLEANUP_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (cause) {
      bb.log.warn(
        JSON.stringify({
          operation,
          threadId,
          attempt: 1,
          elapsedMs: Date.now() - started,
          event: "generation_cleanup_failed",
          ...cleanupDiagnostic(cause),
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }
}

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

// Reject stale or forged picker values before creating a billable session.
async function validateSelection(
  bb: BbPluginApi,
  input: GenerationInput,
  signal: AbortSignal,
): Promise<void> {
  const catalog = await bb.sdk.providers.models({
    providerId: input.selection.providerId,
    signal,
  });
  const provider = catalog.providers.find(
    (value) => value.id === input.selection.providerId && value.available,
  );
  const model = catalog.models.find(
    (value) =>
      value.model === input.selection.model &&
      (value.routeProviderId === undefined ||
        value.routeProviderId === input.selection.providerId),
  );
  if (
    catalog.modelLoadError !== null ||
    provider === undefined ||
    model === undefined ||
    !provider.capabilities.permissionModes.includes(PERMISSION_MODE) ||
    !model.supportedReasoningEfforts.some(
      (value) => value.reasoningEffort === input.selection.reasoningLevel,
    ) ||
    (input.selection.serviceTier !== undefined &&
      !provider.capabilities.supportsServiceTier)
  )
    throw new Error(ERROR);
}

export async function runGenerationThread(
  bb: BbPluginApi,
  input: GenerationInput,
  signal: AbortSignal,
): Promise<string> {
  // Captured cleanup methods remain usable after BB invalidates fresh SDK access during disposal.
  const threads = bb.sdk.threads;
  await validateSelection(bb, input, signal);
  const projects = await bb.sdk.projects.list({
    includePersonal: true,
    signal,
  });
  const personal = projects.find((project) => project.kind === "personal");
  if (personal === undefined) throw new Error(ERROR);
  signal.throwIfAborted();
  // A personal thread avoids feeding repository files or the editor draft into generation.
  const thread = await threads.spawn({
    projectId: personal.id,
    environment: { type: "host", workspace: { type: "personal" } },
    ...input.selection,
    permissionMode: PERMISSION_MODE,
    title: THREAD_TITLE,
    prompt: generationPrompt(input.accent, input.requestId, input.description),
  });
  let complete = false;
  try {
    while (true) {
      signal.throwIfAborted();
      const status = await bb.sdk.threads.get({ threadId: thread.id, signal });
      if (status.status === "error") throw new Error(ERROR);
      if (status.status === "idle" && status.queuedMessageCount === 0) {
        const { output } = await bb.sdk.threads.output({
          threadId: thread.id,
          signal,
        });
        if (output === null) throw new Error(ERROR);
        complete = true;
        return output;
      }
      const interactions = await bb.sdk.threads.interactions.list({
        threadId: thread.id,
        signal,
      });
      if (interactions.length > 0) throw new Error(ERROR);
      await delay(POLL_INTERVAL_MS, undefined, { signal });
    }
  } finally {
    // Cancellation may arrive during spawn; compensate after its thread ID becomes available.
    await cleanupThread(bb, threads, thread.id, complete);
  }
}
