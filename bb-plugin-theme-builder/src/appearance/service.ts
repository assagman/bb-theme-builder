/**
 * Switches bb to a theme and back. Every switch records what was active
 * before, so Restore can return to it, and refuses when the appearance
 * changed since the page last looked.
 */
import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { describeError } from "../shared/describe-error.ts";
import { createSerialExecutor } from "../shared/serial.ts";
import type { RepaintResult } from "../themes/contract.ts";
import { readThemeFile } from "../themes/files.ts";
import {
  BUILTIN_THEME_IDS,
  DEFAULT_THEME_ID,
  themeKind,
} from "../themes/ids.ts";
import {
  type Appearance,
  type AppearanceSnapshot,
  appearanceFingerprint,
  createAppearanceAdapter,
} from "./adapter.ts";
import {
  DEFAULT_CODE_THEME,
  EMPTY_OPERATIONS,
  OPERATION_KEY,
  OPERATION_MESSAGES,
  type OperationState,
  operationStateSchema,
  type PaletteIdentity,
  type PendingOperation,
} from "./operations.ts";
import { restoreSourceFingerprint } from "./restore-source.ts";

const PALETTE_FAVICON = "default";
type Outcome =
  | { kind: "applied" | "restored"; operationId: string }
  | { kind: "conflict" | "failed" | "missing"; message: string };
function identity(appearance: Appearance): PaletteIdentity {
  return {
    themeId: appearance.themeId,
    fingerprint: appearanceFingerprint({
      ...appearance,
      faviconColor: PALETTE_FAVICON,
    }),
  };
}
function matches(appearance: Appearance, target: PaletteIdentity) {
  return identity(appearance).fingerprint === target.fingerprint;
}
type ApplyRecord = NonNullable<OperationState["lastApply"]>;
/** The restore record now pointing at what bb actually painted, since only that can be matched later. */
function retarget(record: ApplyRecord, painted: Appearance): OperationState {
  return {
    pending: null,
    lastApply: { ...record, target: identity(painted) },
  };
}

export function createAppearanceService(bb: BbPluginApi) {
  const adapter = createAppearanceAdapter(bb.sdk.theme);
  const serial = createSerialExecutor();
  const persist = (state: OperationState) =>
    bb.storage.kv.set(OPERATION_KEY, state);

  async function reconcile() {
    const stored = await bb.storage.kv.get(OPERATION_KEY);
    let state =
      stored == null
        ? structuredClone(EMPTY_OPERATIONS)
        : operationStateSchema.parse(stored);
    const current = await adapter.read();
    if (state.pending !== null) {
      const pending = state.pending;
      state = {
        pending: null,
        lastApply: matches(current.appearance, pending.target)
          ? pending.kind === "apply"
            ? pending.record
            : null
          : state.lastApply,
      };
      await persist(state);
    }
    return { state, current };
  }

  async function activate(
    pending: PendingOperation,
    state: OperationState,
    current: AppearanceSnapshot,
  ): Promise<Outcome> {
    // Keeping the previous successful record in the same KV value makes uncertain outcomes recoverable.
    await persist({ ...state, pending });
    const selected = await adapter.select(
      pending.target.themeId,
      current.fingerprint,
    );
    const reached =
      selected.kind === "selected" &&
      (pending.kind === "apply"
        ? selected.current.appearance.themeId === pending.target.themeId
        : matches(selected.current.appearance, pending.target));
    if (reached) {
      await persist(
        pending.kind === "apply"
          ? retarget(pending.record, selected.current.appearance)
          : { pending: null, lastApply: null },
      );
      return {
        kind: pending.kind === "apply" ? "applied" : "restored",
        operationId: pending.operationId,
      };
    }
    await persist({ ...state, pending: null });
    return {
      kind: selected.kind === "conflict" ? "conflict" : "failed",
      message: OPERATION_MESSAGES.unconfirmed,
    };
  }

  return {
    get: () =>
      serial.run(async () => {
        const { state, current } = await reconcile();
        return {
          themeId: current.appearance.themeId,
          fingerprint: current.fingerprint,
          restoreAvailable:
            state.lastApply !== null &&
            matches(current.appearance, state.lastApply.target),
          operationId: state.lastApply?.operationId ?? null,
        };
      }),
    select: (input: { themeId: string; observedFingerprint: string }) =>
      serial.run(async (): Promise<Outcome> => {
        try {
          const { state, current } = await reconcile();
          if (current.fingerprint !== input.observedFingerprint)
            return { kind: "conflict", message: OPERATION_MESSAGES.changed };
          if (current.appearance.themeId === input.themeId)
            return {
              kind: "failed",
              message: OPERATION_MESSAGES.alreadyActive,
            };
          const catalog = await adapter.catalog();
          // Only an id bb lists can be selected; a custom folder with an unusual name is still bb's to load, just not ours to read.
          const kind = themeKind(catalog, input.themeId);
          if (kind === "missing")
            return {
              kind: "missing",
              message: OPERATION_MESSAGES.missingTheme,
            };
          const custom =
            kind === "custom"
              ? readThemeFile(catalog.dir, input.themeId)
              : null;
          const previous = identity(current.appearance);
          // Best guess of the painted result for crash recovery; activate replaces it with bb's readback.
          const target = identity({
            ...current.appearance,
            themeId: input.themeId,
            customCss: custom?.css ?? null,
            resolvedCodeTheme: DEFAULT_CODE_THEME,
          });
          const previousSourceFingerprint = BUILTIN_THEME_IDS.includes(
            previous.themeId,
          )
            ? null
            : await restoreSourceFingerprint(bb, catalog, previous.themeId);
          const operationId = randomUUID();
          const record = {
            operationId,
            previous,
            target,
            previousSourceFingerprint,
          };
          return await activate(
            { kind: "apply", operationId, previous, target, record },
            state,
            current,
          );
        } catch (cause) {
          bb.log.warn(
            JSON.stringify({
              operation: "select",
              themeId: input.themeId,
              cause: describeError(cause),
            }),
          );
          return { kind: "failed", message: OPERATION_MESSAGES.failed };
        }
      }),
    /**
     * Re-selects the active theme after its file was rewritten, so bb paints
     * the new CSS. When the theme was the target of the last switch, the
     * restore record follows it; otherwise Restore would be lost by a save.
     * bb reports a custom theme's CSS live from disk, so the record is
     * matched against `previousCss`, the file as it was before the write
     * (null when there was none).
     */
    repaint: (themeId: string, css: string, previousCss: string | null) =>
      serial.run(async (): Promise<RepaintResult> => {
        const { state, current } = await reconcile();
        if (current.appearance.themeId !== themeId) return "inactive";
        const tracked =
          state.lastApply !== null &&
          matches(
            { ...current.appearance, customCss: previousCss },
            state.lastApply.target,
          );
        const selected = await adapter.select(themeId, current.fingerprint);
        const painted =
          selected.kind === "selected" &&
          selected.current.appearance.customCss === css;
        if (painted && tracked && state.lastApply !== null)
          await persist(retarget(state.lastApply, selected.current.appearance));
        return painted ? "repainted" : "unconfirmed";
      }),
    restore: (input: {
      operationId: string;
      observedFingerprint: string;
      fallbackToDefault?: boolean;
    }) =>
      serial.run(async (): Promise<Outcome> => {
        try {
          const { state, current } = await reconcile();
          const record = state.lastApply;
          if (current.fingerprint !== input.observedFingerprint)
            return { kind: "conflict", message: OPERATION_MESSAGES.changed };
          if (record === null || record.operationId !== input.operationId)
            return { kind: "conflict", message: OPERATION_MESSAGES.noRestore };
          if (!matches(current.appearance, record.target))
            return { kind: "conflict", message: OPERATION_MESSAGES.changed };
          const catalog = await adapter.catalog();
          const builtin = BUILTIN_THEME_IDS.includes(record.previous.themeId);
          const sourceFingerprint = builtin
            ? null
            : await restoreSourceFingerprint(
                bb,
                catalog,
                record.previous.themeId,
              );
          // Legacy records cannot prove a custom source identity; keep the selected palette unchanged.
          const available =
            builtin ||
            (sourceFingerprint !== null &&
              sourceFingerprint === record.previousSourceFingerprint);
          if (!available && !input.fallbackToDefault)
            return { kind: "missing", message: OPERATION_MESSAGES.unavailable };
          const target = input.fallbackToDefault
            ? identity({
                ...current.appearance,
                themeId: DEFAULT_THEME_ID,
                customCss: null,
                resolvedCodeTheme: DEFAULT_CODE_THEME,
              })
            : record.previous;
          return await activate(
            {
              kind: "restore",
              operationId: randomUUID(),
              previous: identity(current.appearance),
              target,
              record,
            },
            state,
            current,
          );
        } catch {
          return { kind: "failed", message: OPERATION_MESSAGES.failed };
        }
      }),
    close: serial.close,
  };
}
