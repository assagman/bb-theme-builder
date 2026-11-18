/**
 * Bounded waits shared by agent threads and chat sessions. The SDK and storage cannot
 * abort every transport, so each wait that could hang loses a race against a timer or an abort signal.
 */

// Marks the timer side of `settleWithin`, so only that expected outcome is absorbed.
class SettleTimeoutError extends Error {
  constructor() {
    super("Bounded wait elapsed");
    this.name = "SettleTimeoutError";
  }
}

const ignore = () => undefined;

/** Rejects with `onTimeout()` when `promise` has not settled within `ms`; the timer is always cleared. */
export async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  onTimeout: () => Error,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(onTimeout()), ms);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Waits until `promise` settles or `ms` passes. The outcome is ignored on purpose: callers (Stop, disposal)
 * only need a bounded wait, and the awaited task records and logs its own result.
 */
export async function settleWithin(
  promise: Promise<unknown>,
  ms: number,
): Promise<void> {
  try {
    await withTimeout(
      promise.then(ignore, ignore),
      ms,
      () => new SettleTimeoutError(),
    );
  } catch (cause) {
    if (!(cause instanceof SettleTimeoutError)) throw cause;
  }
}

/** Rejects with the signal's reason as soon as `signal` aborts, even if `promise` never settles. */
export function raceSignal<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  let abort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    abort = () => reject(signal.reason);
    signal.addEventListener("abort", abort, { once: true });
  });
  return Promise.race([promise, aborted]).finally(() =>
    signal.removeEventListener("abort", abort),
  );
}
