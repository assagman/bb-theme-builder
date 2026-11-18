import { useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationSelection } from "../generation/contract.ts";
import {
  forgetSelection,
  loadRememberedSelection,
  rememberSelection,
} from "../generation/selection-storage.ts";
import type { rpcContract } from "../presets/contract.ts";
import { describeError } from "./describe-error.ts";
import { LOG_PREFIX } from "./log.ts";

/**
 * The model the AI tab will start a chat with: the remembered choice, else
 * the host default. A failed start clears the remembered choice (via `reset`)
 * so a removed provider is not retried forever.
 */
export function useModelSelection() {
  const rpc = useRpc<typeof rpcContract>();
  const [selection, setSelection] = useState(loadRememberedSelection);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const resolve = useCallback(async () => {
    // A remembered choice is the user's own, so it is kept whatever the default is; only a failed start discards it.
    if (loadRememberedSelection() !== null) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const host = await rpc.call("getGenerationSelection", {});
      if (!mounted.current) return;
      // Re-read storage so a pick made while this call was in flight is not overwritten by the default.
      setSelection(loadRememberedSelection() ?? host);
    } catch (cause) {
      console.warn(`${LOG_PREFIX} model selection unavailable`, {
        cause: describeError(cause),
      });
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [rpc]);

  useEffect(() => {
    mounted.current = true;
    void resolve();
    return () => {
      mounted.current = false;
    };
  }, [resolve]);

  const choose = useCallback((value: GenerationSelection) => {
    setSelection(value);
    rememberSelection(value);
  }, []);
  /** Called when a start fails so a stale model is replaced by the provider default instead of failing again. */
  const reset = useCallback(() => {
    forgetSelection();
    setSelection(null);
    void resolve();
  }, [resolve]);

  return { selection, loading, choose, reset };
}

/** What `useModelSelection` returns; held by the page so the choice survives tab switches. */
export type ModelSelection = ReturnType<typeof useModelSelection>;
