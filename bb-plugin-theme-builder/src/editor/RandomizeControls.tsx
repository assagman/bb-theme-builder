import {
  experimental_ProviderModelPicker as ProviderModelPicker,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { useEffect, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { Input } from "../../components/ui/input.tsx";
import {
  accentSchema,
  descriptionSchema,
  type GenerationSelection,
  MAX_DESCRIPTION_LENGTH,
  selectionSchema,
} from "../generation/contract.ts";
import type { rpcContract } from "../presets/contract.ts";

const PREFERENCE_KEY = "theme-builder.generation-selection.v1";
const COPY = {
  title: "AI theme generator",
  description: "Describe your theme (optional)",
  descriptionPlaceholder:
    "Warm cream light theme like Cosmic Latte, coffee-brown accent, no stark white",
  descriptionHelp:
    "Describe a mood, references, or colors in plain words. Leave blank for a surprise.",
  accent: "Optional accent hex",
  placeholder: "#7c3aed",
  randomize: "Randomize",
  cancel: "Cancel generation",
  undo: "Undo randomization",
  help: "Generate both palettes with your selected model from your description. Preview first; edit any token by hand; Save and Apply when ready.",
  accentHelp:
    "Leave blank for a surprise, or keep this exact accent in both modes.",
  invalid: "Enter a six-digit hex color, such as #7c3aed, or leave blank.",
  unavailable:
    "No model is available. Configure a bb provider, then reload this page.",
  loading: "Loading models…",
  generating: "Generating both palettes…",
};

function rememberedSelection(): GenerationSelection | null {
  try {
    const value = localStorage.getItem(PREFERENCE_KEY);
    return value === null ? null : selectionSchema.parse(JSON.parse(value));
  } catch {
    return null;
  }
}

type Props = {
  busy: boolean;
  generating: boolean;
  canUndo: boolean;
  onGenerate: (
    selection: GenerationSelection,
    accent: string | null,
    description: string | null,
  ) => void;
  onCancel: () => void;
  onUndo: () => void;
};

export function RandomizeControls({
  busy,
  generating,
  canUndo,
  onGenerate,
  onCancel,
  onUndo,
}: Props) {
  const rpc = useRpc<typeof rpcContract>();
  const [selection, setSelection] = useState(rememberedSelection);
  const [loading, setLoading] = useState(selection === null);
  const [accent, setAccent] = useState("");
  // Kept across generations so the user can refine the same brief instead of retyping it.
  const [description, setDescription] = useState("");
  const normalized = accent.trim();
  const valid = normalized === "" || accentSchema.safeParse(normalized).success;
  useEffect(() => {
    if (selection !== null) return;
    let mounted = true;
    void rpc
      .call("getGenerationSelection", {})
      .then((value) => {
        if (mounted) setSelection(value);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [rpc, selection]);
  function choose(value: GenerationSelection) {
    setSelection(value);
    try {
      localStorage.setItem(PREFERENCE_KEY, JSON.stringify(value));
    } catch {
      /* Storage restrictions must not prevent generation. */
    }
  }
  return (
    <section
      className="space-y-3 rounded-lg border p-3"
      aria-label={COPY.title}
    >
      <h3 className="text-sm font-medium">{COPY.title}</h3>
      <p className="text-xs text-muted-foreground">{COPY.help}</p>
      {selection !== null ? (
        <ProviderModelPicker
          value={selection}
          onChange={choose}
          disabled={busy}
        />
      ) : (
        <p role="status" className="text-xs">
          {loading ? COPY.loading : COPY.unavailable}
        </p>
      )}
      <label className="block space-y-2" htmlFor="tb-generation-description">
        <span className="text-sm">{COPY.description}</span>
        <textarea
          id="tb-generation-description"
          className="flex w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={COPY.descriptionPlaceholder}
          maxLength={MAX_DESCRIPTION_LENGTH}
          rows={3}
          disabled={busy}
          aria-describedby="tb-generation-description-help"
        />
      </label>
      <p
        id="tb-generation-description-help"
        className="text-xs text-muted-foreground"
      >
        {COPY.descriptionHelp}
      </p>
      <label className="block space-y-2" htmlFor="tb-generation-accent">
        <span className="text-sm">{COPY.accent}</span>
        <Input
          id="tb-generation-accent"
          value={accent}
          onChange={(event) => setAccent(event.target.value)}
          placeholder={COPY.placeholder}
          disabled={busy}
          aria-invalid={!valid}
          aria-describedby="tb-generation-accent-help"
        />
      </label>
      <p
        id="tb-generation-accent-help"
        className="text-xs text-muted-foreground"
      >
        {valid ? COPY.accentHelp : COPY.invalid}
      </p>
      <div className="tb-toolbar">
        <Button
          variant="outline"
          disabled={busy || !valid || selection === null}
          onClick={() => {
            if (selection === null) return;
            choose(selection);
            onGenerate(
              selection,
              normalized === "" ? null : accentSchema.parse(normalized),
              descriptionSchema.parse(description),
            );
          }}
        >
          {COPY.randomize}
        </Button>
        {generating && (
          <Button variant="outline" onClick={onCancel}>
            {COPY.cancel}
          </Button>
        )}
        <Button variant="ghost" disabled={busy || !canUndo} onClick={onUndo}>
          {COPY.undo}
        </Button>
      </div>
      {generating && (
        <p role="status" className="text-xs">
          {COPY.generating}
        </p>
      )}
    </section>
  );
}
