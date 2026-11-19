import { useRpc } from "@get-bb/plugin-sdk/app";
import { useCallback, useEffect, useRef, useState } from "react";
import type { GenerationSelection } from "../generation/contract.ts";
import {
  loadRememberedSelection,
  rememberSelection,
} from "../generation/selection-storage.ts";
import { describeError } from "../shared/describe-error.ts";
import type { rpcContract } from "../themes/contract.ts";
import { LOG_PREFIX } from "./log.ts";

/**
 * The model the AI tab will start a chat with: the remembered choice, else
 * the host default. A remembered choice is kept until the user picks another.
 */
export function useModelSelection() {
  const rpc = useRpc<typeof rpcContract>();
  const [selection, setSelection] = useState(loadRememberedSelection);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  const resolve = useCallback(async () => {
    // A remembered choice is the user's own, so it is kept whatever the default is; only the user's own pick replaces it.
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
  return { selection, loading, choose };
}

/** What `useModelSelection` returns; held by the page so the choice survives tab switches. */
export type ModelSelection = ReturnType<typeof useModelSelection>;
