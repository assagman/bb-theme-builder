import { useEffect, useMemo, useState } from "react";
import { NEUTRAL_PRESET } from "../theme/defaults.ts";
import { draftSchema } from "../theme/schema.ts";
import type { Mode, ThemeDraft } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";
import { previewDocument } from "./preview.ts";

export function PreviewFrame({
  draft,
  mode,
}: {
  draft: ThemeDraft;
  mode: Mode;
}) {
  const [valid, setValid] = useState<ThemeDraft>(NEUTRAL_PRESET);
  useEffect(() => {
    const parsed = draftSchema.safeParse(draft);
    if (parsed.success) setValid(parsed.data);
  }, [draft]);
  const document = useMemo(() => previewDocument(valid, mode), [valid, mode]);
  return (
    <iframe
      title={COPY.preview}
      sandbox=""
      referrerPolicy="no-referrer"
      srcDoc={document}
      className="tb-preview-frame"
    />
  );
}
