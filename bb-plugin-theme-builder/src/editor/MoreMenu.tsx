import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/button.tsx";
import { COPY } from "./copy.ts";
import {
  KEY_DOWN,
  KEY_END,
  KEY_ESCAPE,
  KEY_HOME,
  KEY_TAB,
  KEY_UP,
} from "./keys.ts";

const ENABLED_ITEM = '[role="menuitem"]:not(:disabled)';

export type MenuItem = { label: string; disabled: boolean; run: () => void };

/**
 * The ⋯ menu for the rarer actions. Closes on Escape, Tab, item choice, and
 * outside pointer; focus goes back to the trigger so keyboard users keep
 * their place.
 */
export function MoreMenu({ items }: { items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) trigger.current?.focus();
  };
  const enabledItems = () =>
    Array.from(root.current?.querySelectorAll<HTMLElement>(ENABLED_ITEM) ?? []);

  useEffect(() => {
    if (!open) return;
    enabledItems()[0]?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    // On the document, not the list: focus may sit on the trigger or on a
    // control that just became disabled, and Escape must still close.
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== KEY_ESCAPE) return;
      event.preventDefault();
      setOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const onKeyDown = (event: KeyboardEvent) => {
    // Tab leaves the menu, so it must not stay open behind the focus.
    if (event.key === KEY_TAB) {
      setOpen(false);
      return;
    }
    const entries = enabledItems();
    const at = entries.indexOf(document.activeElement as HTMLElement);
    const target = {
      [KEY_DOWN]: entries[(at + 1) % entries.length],
      [KEY_UP]: entries[(at - 1 + entries.length) % entries.length],
      [KEY_HOME]: entries[0],
      [KEY_END]: entries[entries.length - 1],
    }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    target.focus();
  };

  return (
    <div className="tb-menu" ref={root}>
      <Button
        ref={trigger}
        type="button"
        variant="outline"
        size="icon"
        aria-label={COPY.moreActions}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">⋯</span>
      </Button>
      {open && (
        <div
          role="menu"
          aria-label={COPY.moreActions}
          className="tb-menu-list"
          onKeyDown={onKeyDown}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="tb-menu-item"
              disabled={item.disabled}
              onClick={() => {
                // Focus returns first so an item that opens a field can then take focus itself.
                close(true);
                item.run();
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
