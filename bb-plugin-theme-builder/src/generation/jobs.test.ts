import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { createGenerationJobs } from "./jobs.ts";

const SELECTION = {
  providerId: "fixture",
  model: "fixture-model",
  reasoningLevel: "low" as const,
};
const PALETTE = { light: NEUTRAL_PRESET.light, dark: NEUTRAL_PRESET.dark };
const input = () => ({
  requestId: randomUUID(),
  selection: SELECTION,
  accent: null,
});

test("coalesces duplicate requests and refuses concurrent generation without replacing the first result", async () => {
  let finish!: (text: string) => void;
  let calls = 0;
  const jobs = createGenerationJobs(async () => {
    calls++;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  const first = input();
  assert.equal(jobs.start(first).kind, "running");
  assert.equal(jobs.start(first).kind, "running");
  assert.equal(jobs.start(input()).kind, "failed");
  await setImmediate();
  finish(JSON.stringify(PALETTE));
  await setImmediate();
  assert.deepEqual(jobs.get(first.requestId), {
    kind: "ready",
    palette: PALETTE,
  });
  assert.equal(calls, 1);
  await jobs.close();
});

test("cancellation aborts the runner and discards late successful output", async () => {
  let finish!: (text: string) => void;
  let signal!: AbortSignal;
  const jobs = createGenerationJobs(async (_input, value) => {
    signal = value;
    return new Promise<string>((resolve) => {
      finish = resolve;
    });
  });
  const request = input();
  jobs.start(request);
  await setImmediate();
  jobs.cancel(request.requestId);
  assert.equal(signal.aborted, true);
  finish(JSON.stringify(PALETTE));
  await setImmediate();
  assert.deepEqual(jobs.get(request.requestId), { kind: "cancelled" });
  await jobs.close();
});

test("invalid model output and runner errors produce bounded safe errors", async () => {
  const jobs = createGenerationJobs(async () => {
    throw new Error("secret upstream token should not escape");
  });
  const request = input();
  jobs.start(request);
  await setImmediate();
  const result = jobs.get(request.requestId);
  assert.equal(result.kind, "failed");
  assert.ok(!JSON.stringify(result).includes("secret"));
  await jobs.close();
  assert.equal(jobs.start(input()).kind, "failed");
});

test("generation deadline aborts a slow runner", async () => {
  const jobs = createGenerationJobs(
    (_input, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
      }),
    5,
  );
  const request = input();
  jobs.start(request);
  await new Promise((resolve) => setTimeout(resolve, 15));
  assert.equal(jobs.get(request.requestId).kind, "failed");
  await jobs.close();
});
