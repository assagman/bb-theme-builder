import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { COPY } from "./copy.ts";
import { KEY_END, KEY_HOME, KEY_LEFT, KEY_RIGHT } from "./keys.ts";
import { TABS, type Tab } from "./store.ts";

/** Shared by the tab and its panel so each can name the other for assistive tech. */
const tabId = (tab: Tab) => `tb-tab-${tab}`;
const panelId = (tab: Tab) => `tb-panel-${tab}`;

/**
 * The AI / Edit / Randomize switch. Arrow keys move and activate the tab and
 * only the active tab is in the Tab order (roving tabindex), as the ARIA tabs
 * pattern expects, so keyboard users cross the strip in one stop.
 */
export function Tabs({
  value,
  onChange,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
}) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const move = (event: KeyboardEvent, index: number) => {
    const last = TABS.length - 1;
    const target = {
      [KEY_RIGHT]: index === last ? 0 : index + 1,
      [KEY_LEFT]: index === 0 ? last : index - 1,
      [KEY_HOME]: 0,
      [KEY_END]: last,
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    const next = TABS[target];
    onChange(next);
    refs.current[next]?.focus();
  };
  return (
    <div role="tablist" aria-label={COPY.tabsLabel} className="tb-tabs">
      {TABS.map((tab, index) => (
        <button
          key={tab}
          ref={(node) => {
            refs.current[tab] = node;
          }}
          type="button"
          role="tab"
          id={tabId(tab)}
          aria-selected={tab === value}
          // Only the open tab has a rendered panel to control.
          aria-controls={tab === value ? panelId(tab) : undefined}
          tabIndex={tab === value ? 0 : -1}
          className="tb-tab"
          onClick={() => onChange(tab)}
          onKeyDown={(event) => move(event, index)}
        >
          {COPY.tabLabels[tab]}
        </button>
      ))}
    </div>
  );
}

/** Body of the active tab; labelled by its tab so screen readers announce which way of editing is open. */
export function TabPanel({ tab, children }: { tab: Tab; children: ReactNode }) {
  return (
    <div
      role="tabpanel"
      id={panelId(tab)}
      aria-labelledby={tabId(tab)}
      className="tb-tab-panel"
    >
      {children}
    </div>
  );
}
