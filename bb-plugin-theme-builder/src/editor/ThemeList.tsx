import { useEffect, useRef } from "react";
import { SWATCH_TOKENS, type Swatch } from "../theme/swatch.ts";
import { MODES } from "../theme/tokens.ts";
import { COPY } from "./copy.ts";

/** One card. `unsaved` marks the working theme that exists only in the editor, which cannot be clicked. */
export type ThemeEntry = {
  id: string;
  name: string;
  swatch: Swatch;
  open: boolean;
  active: boolean;
  unsaved?: boolean;
};

/** Colors come from the user's theme, so they are the only inline styles; everything else is in editor.css. */
function SwatchStrip({ swatch }: { swatch: Swatch }) {
  return (
    <span className="tb-swatch" aria-hidden="true">
      {MODES.map((mode) => (
        <span key={mode} className="tb-swatch-row">
          {SWATCH_TOKENS.map((token, index) => (
            <span key={token} style={{ background: swatch[mode][index] }} />
          ))}
        </span>
      ))}
    </span>
  );
}

function CardBody({ entry }: { entry: ThemeEntry }) {
  return (
    <>
      <SwatchStrip swatch={entry.swatch} />
      <span className="tb-card-name">{entry.name}</span>
      {entry.active && <span className="tb-badge">{COPY.activeBadge}</span>}
      {entry.unsaved === true && (
        <span className="tb-badge">{COPY.unsavedTheme}</span>
      )}
    </>
  );
}

/**
 * Every theme as a compact card in a height-capped, scrollable grid, so a
 * large collection never pushes the editor below the fold. The open card is
 * kept in view. "Active" is a text badge so it does not rely on color.
 */
export function ThemeList({
  entries,
  disabled,
  onSelect,
}: {
  entries: ThemeEntry[];
  disabled: boolean;
  /** Empty id selects the built-in theme. */
  onSelect: (id: string) => void;
}) {
  const openCard = useRef<HTMLLIElement>(null);
  const openId = entries.find((entry) => entry.open)?.id;
  // "nearest" scrolls the list only as far as needed and never recenters the page.
  useEffect(() => {
    openCard.current?.scrollIntoView({ block: "nearest" });
  }, [openId]);
  return (
    <ul className="tb-list" aria-label={COPY.yourThemes}>
      {entries.map((entry) => (
        <li key={entry.id} ref={entry.open ? openCard : undefined}>
          {entry.unsaved === true ? (
            <div className="tb-card" aria-current="true">
              <CardBody entry={entry} />
            </div>
          ) : (
            <button
              type="button"
              className="tb-card"
              aria-current={entry.open ? "true" : undefined}
              disabled={disabled}
              onClick={() => onSelect(entry.id)}
            >
              <CardBody entry={entry} />
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
