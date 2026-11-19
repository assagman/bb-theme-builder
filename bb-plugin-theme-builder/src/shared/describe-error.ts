/** One place that turns any thrown value into text for the page, so error display cannot drift between hooks. */
export function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
