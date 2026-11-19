const CLOSED_MESSAGE =
  "Theme Builder is reloading. Retry after the page reconnects.";

export function createSerialExecutor() {
  let tail: Promise<unknown> = Promise.resolve();
  let closed = false;
  return {
    run<T>(operation: () => Promise<T>): Promise<T> {
      if (closed) return Promise.reject(new Error(CLOSED_MESSAGE));
      const result = tail.then(operation);
      tail = result.catch(() => undefined);
      return result;
    },
    async close(): Promise<void> {
      closed = true;
      await tail;
    },
  };
}
