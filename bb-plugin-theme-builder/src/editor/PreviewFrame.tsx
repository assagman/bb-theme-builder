import { useEffect, useMemo, useState } from "react";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { draftSchema } from "../theme/schema.ts";
import type { Mode, ThemeDraft } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { previewDocument } from "./preview.ts";

/**
 * Sandboxed live preview of the last valid draft. The iframe remounts whenever
 * the document changes, so a stale document can never stay on screen.
 */
export function PreviewFrame({
  draft,
  css,
  mode,
}: {
  draft: ThemeDraft;
  /** The source theme's CSS, so the preview paints the copy exactly as bb will. */
  css: string | null;
  mode: Mode;
}) {
  const [valid, setValid] = useState<ThemeDraft>(NEUTRAL_PRESET);
  useEffect(() => {
    const parsed = draftSchema.safeParse(draft);
    if (parsed.success) setValid(parsed.data);
  }, [draft]);
  const document = useMemo(
    () => previewDocument(valid, css, mode),
    [valid, css, mode],
  );
  // Chromium drops a srcdoc update that lands while the previous srcdoc is
  // still loading (the async draft restore right after the neutral first
  // render), leaving the stale document. Keying on the document gives a fresh
  // iframe per change and forces a new load; React compares the key by string
  // equality, so an unchanged document costs nothing.
  return (
    <iframe
      key={document}
      title={COPY.preview}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={document}
      className="tb-preview-frame"
    />
  );
}
