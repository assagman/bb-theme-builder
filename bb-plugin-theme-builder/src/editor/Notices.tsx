import { Button } from "../../components/ui/button.tsx";
import { COPY } from "./copy.ts";
import type { Notice } from "./store.ts";

/**
 * Status and error lines above the action bar. A restored-draft notice (and
 * the restore-failed error) carries a Discard action, because the user must
 * be able to drop edits they did not just make.
 */
export function Notices({
  busy,
  notice,
  message,
  error,
  invalid,
  held,
  onDiscardRestored,
}: {
  busy: boolean;
  notice: Notice | null;
  message: string | null;
  error: string | null;
  invalid: boolean;
  /** True when an agent reply was kept back to protect hand edits. */
  held: boolean;
  onDiscardRestored: () => void;
}) {
  return (
    <div className="tb-notices">
      {busy && <p role="status">{COPY.busy}</p>}
      {notice !== null && (
        <p
          role={notice.kind === "restoreFailed" ? "alert" : "status"}
          className="tb-notice"
        >
          <span>{notice.text}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onDiscardRestored}
          >
            {COPY.discardAction}
          </Button>
        </p>
      )}
      {held && <p role="status">{COPY.aiReplyHeld}</p>}
      {message !== null && <p role="status">{message}</p>}
      {error !== null && <p role="alert">{error}</p>}
      {invalid && <p role="alert">{COPY.invalid}</p>}
    </div>
  );
}
