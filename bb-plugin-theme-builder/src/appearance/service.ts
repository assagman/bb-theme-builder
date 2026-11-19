import { randomUUID } from "node:crypto";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { createSerialExecutor } from "../presets/serial.ts";
import type { PresetStore } from "../presets/store.ts";
import { generateCss } from "../theme/css.ts";
import { toDraft } from "../theme/schema.ts";
import {
  type Appearance,
  type AppearanceSnapshot,
  appearanceFingerprint,
  createAppearanceAdapter,
} from "./adapter.ts";
import { writeThemeRevision } from "./files.ts";
import {
  BUILTIN_THEME_IDS,
  DEFAULT_CODE_THEME,
  DEFAULT_THEME_ID,
  EMPTY_OPERATIONS,
  ID_KEY_LENGTH,
  OPERATION_KEY,
  OPERATION_MESSAGES,
  type OperationState,
  operationStateSchema,
  type PaletteIdentity,
  type PendingOperation,
} from "./operations.ts";
import { restoreSourceFingerprint } from "./restore-source.ts";

const ID_SEPARATOR = "-";
const ID_REPLACEMENT = "";
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
function key(id: string) {
  return id.replaceAll(ID_SEPARATOR, ID_REPLACEMENT).slice(0, ID_KEY_LENGTH);
}

export function createAppearanceService(bb: BbPluginApi, store: PresetStore) {
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
    if (
      selected.kind === "selected" &&
      matches(selected.current.appearance, pending.target)
    ) {
      await persist({
        pending: null,
        lastApply: pending.kind === "apply" ? pending.record : null,
      });
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
    apply: (input: {
      id: string;
      revision: number;
      observedFingerprint: string;
    }) =>
      serial.run(async (): Promise<Outcome> => {
        try {
          const { state, current } = await reconcile();
          if (current.fingerprint !== input.observedFingerprint)
            return { kind: "conflict", message: OPERATION_MESSAGES.changed };
          const preset = await store.get(input.id);
          if (preset === null || preset.revision !== input.revision)
            return { kind: "conflict", message: OPERATION_MESSAGES.revision };
          const css = generateCss(toDraft(preset));
          const operationId = randomUUID();
          const themeId = `theme-builder-${key(preset.id)}-r${preset.revision}-${key(operationId)}`;
          try {
            writeThemeRevision((await adapter.catalog()).dir, themeId, css);
          } catch {
            return { kind: "failed", message: OPERATION_MESSAGES.files };
          }
          const observed = await adapter.read();
          if (observed.fingerprint !== input.observedFingerprint)
            return { kind: "conflict", message: OPERATION_MESSAGES.changed };
          const previous = identity(observed.appearance);
          const target = identity({
            ...observed.appearance,
            themeId,
            customCss: css,
            resolvedCodeTheme: DEFAULT_CODE_THEME,
          });
          const previousSourceFingerprint = BUILTIN_THEME_IDS.includes(
            previous.themeId,
          )
            ? null
            : await restoreSourceFingerprint(
                bb,
                await adapter.catalog(),
                previous.themeId,
              );
          const record = {
            operationId,
            previous,
            target,
            previousSourceFingerprint,
          };
          return await activate(
            { kind: "apply", operationId, previous, target, record },
            state,
            observed,
          );
        } catch {
          return { kind: "failed", message: OPERATION_MESSAGES.failed };
        }
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
