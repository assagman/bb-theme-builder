import {
  GENERATION_TIMEOUT_MS,
  type GenerationInput,
  type GenerationResult,
} from "./contract.ts";
import { parseGeneratedPalette } from "./palette.ts";

const FAILED =
  "Generation failed. Check that the selected provider is signed in and available, then try again.";
const TIMEOUT = "Generation timed out. Try a faster model or retry.";
const BUSY = "Another palette is being generated. Try again when it finishes.";
const MISSING =
  "This generation is no longer available. Your draft is unchanged.";
const CLOSED = "Theme Builder is reloading. Reload the page and try again.";
const MAX_RETAINED_JOBS = 32;
const RESULT_RETENTION_MS = 10 * 60 * 1000;
const DISPOSAL_TIMEOUT_MS = 15_000;
type Runner = (input: GenerationInput, signal: AbortSignal) => Promise<string>;
type Job = {
  id: string;
  controller: AbortController;
  result: GenerationResult;
  task: Promise<void>;
  cancelled: boolean;
  expiresAt: number;
};

export function createGenerationJobs(
  run: Runner,
  timeoutMs = GENERATION_TIMEOUT_MS,
  disposalTimeoutMs = DISPOSAL_TIMEOUT_MS,
) {
  let current: Job | null = null;
  const jobs = new Map<string, Job>();
  const runners = new Set<Promise<void>>();
  let active = false;
  let closed = false;
  const failed = (message: string): GenerationResult => ({
    kind: "failed",
    message,
  });

  function start(input: GenerationInput): GenerationResult {
    if (closed) return failed(CLOSED);
    prune();
    const retained = jobs.get(input.requestId);
    if (retained !== undefined) return retained.result;
    if (active) return failed(BUSY);
    while (jobs.size >= MAX_RETAINED_JOBS) {
      const oldest = jobs.keys().next().value;
      if (oldest === undefined) break;
      jobs.delete(oldest);
    }
    const job: Job = {
      id: input.requestId,
      controller: new AbortController(),
      result: { kind: "running" },
      task: Promise.resolve(),
      cancelled: false,
      expiresAt: Number.POSITIVE_INFINITY,
    };
    jobs.set(job.id, job);
    current = job;
    active = true;
    const timer = setTimeout(() => job.controller.abort(), timeoutMs);
    // The SDK cannot abort every transport; user-visible completion must not depend on transport cooperation.
    let abort!: () => void;
    const aborted = new Promise<never>((_resolve, reject) => {
      abort = () => reject(job.controller.signal.reason);
      job.controller.signal.addEventListener("abort", abort, { once: true });
    });
    job.task = Promise.resolve().then(async () => {
      try {
        const runner = Promise.resolve().then(() => {
          job.controller.signal.throwIfAborted();
          return run(input, job.controller.signal);
        });
        // Retain underlying cleanup independently of the user-visible cancellation result.
        const settled = runner.then(
          () => {},
          () => {},
        );
        runners.add(settled);
        void settled.then(() => {
          runners.delete(settled);
        });
        const text = await Promise.race([runner, aborted]);
        job.controller.signal.throwIfAborted();
        job.result = {
          kind: "ready",
          palette: parseGeneratedPalette(text, input.accent),
        };
      } catch {
        job.result = job.cancelled
          ? { kind: "cancelled" }
          : failed(job.controller.signal.aborted ? TIMEOUT : FAILED);
      } finally {
        clearTimeout(timer);
        job.controller.signal.removeEventListener("abort", abort);
        job.expiresAt = Date.now() + RESULT_RETENTION_MS;
        active = false;
      }
    });
    return job.result;
  }

  // A short bounded history lets another window collect a result between polling intervals.
  function prune() {
    for (const [id, job] of jobs) {
      if (job.result.kind !== "running" && job.expiresAt <= Date.now())
        jobs.delete(id);
    }
  }

  function cancel(requestId: string) {
    if (current?.id !== requestId || !active) return;
    current.cancelled = true;
    current.controller.abort();
  }

  return {
    start,
    get: (requestId: string): GenerationResult => {
      prune();
      return jobs.get(requestId)?.result ?? failed(MISSING);
    },
    cancel,
    close: async () => {
      closed = true;
      if (current !== null) {
        cancel(current.id);
        await current.task;
      }
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          Promise.allSettled([...runners]),
          new Promise<void>((resolve) => {
            timer = setTimeout(resolve, disposalTimeoutMs);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
