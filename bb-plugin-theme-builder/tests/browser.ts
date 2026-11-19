import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const TIMEOUT_MS = 30000;
const POLL_MS = 100;
const BLANK_URL = "about:blank";
const CONNECT_ERROR = "Could not connect to the test browser";
const CLOSED_ERROR = "The test browser disconnected";
const SCREENSHOT_METHOD = "Page.captureScreenshot";
const FOREGROUND_METHOD = "Page.bringToFront";
// The page opens on the AI tab, so colour fields are not mounted yet; the tab strip is the first thing every tab shares.
const READY_EXPRESSION = "document.querySelector('[role=tablist]') !== null";
// The preview iframe remounts on every document change, so its CDP target can briefly disappear or detach mid-call.
const PREVIEW_ATTEMPTS = 20;
const PREVIEW_TOTAL_MS = 10000;
const PREVIEW_RETRY_MS = 100;
// The dialog can be closed by the browser itself within moments, so it is polled much faster than page conditions.
const DIALOG_POLL_MS = 5;
const SHELL_SCOPE = ".tb-shell";
const THEME_SELECT = "#tb-theme-select";
const PAINT_SETTLED_EXPRESSION =
  "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))";
class BrowserTransportError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "BrowserTransportError";
  }
}
type Message = {
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { message: string };
  sessionId?: string;
};
type Waiter = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class Browser {
  private socket: WebSocket;
  private nextId = 0;
  private waiting = new Map<number, Waiter>();
  readonly events: Message[] = [];

  constructor(url: string) {
    this.socket = new WebSocket(url);
    // A closed browser cannot answer pending commands; report disconnection instead of unrelated timeouts.
    this.socket.addEventListener("close", () => {
      for (const waiter of this.waiting.values()) {
        clearTimeout(waiter.timer);
        waiter.reject(new BrowserTransportError(CLOSED_ERROR));
      }
      this.waiting.clear();
    });
  }

  async connect() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        new Promise<void>((resolve, reject) => {
          this.socket.addEventListener("open", () => resolve(), { once: true });
          this.socket.addEventListener(
            "error",
            () => reject(new BrowserTransportError(CONNECT_ERROR)),
            { once: true },
          );
        }),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new BrowserTransportError(CONNECT_ERROR)),
            TIMEOUT_MS,
          );
        }),
      ]);
    } finally {
      clearTimeout(timer);
      if (this.socket.readyState !== WebSocket.OPEN) this.socket.close();
    }
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data)) as Message;
      if (message.id === undefined) {
        this.events.push(message);
        return;
      }
      const waiter = this.waiting.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      this.waiting.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    });
  }

  send<T = Record<string, unknown>>(
    method: string,
    params = {},
    sessionId?: string,
  ): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN)
      return Promise.reject(new BrowserTransportError(CLOSED_ERROR));
    const id = ++this.nextId;
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`CDP timeout: ${method}`));
      }, TIMEOUT_MS);
      this.waiting.set(id, {
        resolve: (value) => resolve(value as T),
        reject,
        timer,
      });
      try {
        this.socket.send(JSON.stringify({ id, method, params, sessionId }));
      } catch (cause) {
        clearTimeout(timer);
        this.waiting.delete(id);
        reject(new BrowserTransportError(CLOSED_ERROR, cause));
      }
    });
  }

  async page(url: string, mode: "light" | "dark") {
    const { browserContextId } = await this.send<{ browserContextId: string }>(
      "Target.createBrowserContext",
    );
    const { targetId } = await this.send<{ targetId: string }>(
      "Target.createTarget",
      { url: BLANK_URL, browserContextId },
    );
    const { sessionId } = await this.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId, flatten: true },
    );
    const page = new Page(this, sessionId, browserContextId);
    await page.send("Page.enable");
    await page.send("Runtime.enable");
    await page.send("Network.enable");
    await page.send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-color-scheme", value: mode }],
    });
    await page.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await page.send("Page.navigate", { url });
    await page.wait(READY_EXPRESSION);
    return page;
  }

  close() {
    this.socket.close();
  }
}

export class Page {
  private browser: Browser;
  readonly sessionId: string;
  readonly contextId: string;
  constructor(browser: Browser, sessionId: string, contextId: string) {
    this.browser = browser;
    this.sessionId = sessionId;
    this.contextId = contextId;
  }
  async send<T = Record<string, unknown>>(
    method: string,
    params = {},
  ): Promise<T> {
    if (method === SCREENSHOT_METHOD) {
      // Opaque iframe styles can update before compositor paint; proof must capture the visible, current frame.
      await this.browser.send(FOREGROUND_METHOD, {}, this.sessionId);
      await this.evaluate(PAINT_SETTLED_EXPRESSION);
    }
    return this.browser.send<T>(method, params, this.sessionId);
  }
  async evaluate<T = unknown>(expression: string): Promise<T> {
    const result = await this.send<{
      result: { value: T };
      exceptionDetails?: unknown;
    }>("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise: true,
    });
    assert.equal(
      result.exceptionDetails,
      undefined,
      JSON.stringify(result.exceptionDetails),
    );
    return result.result.value;
  }
  async wait(expression: string) {
    const deadline = Date.now() + TIMEOUT_MS;
    while (Date.now() < deadline) {
      if (await this.evaluate(expression)) return;
      await delay(POLL_MS);
    }
    // Palette and mode identify appearance-sync failures without logging page content or credentials.
    const observed = await this.evaluate(
      "({canvas:getComputedStyle(document.documentElement).getPropertyValue('--canvas').trim(),dark:document.documentElement.classList.contains('dark'),visibility:document.visibilityState})",
    );
    throw new Error(
      `Page condition timed out: ${expression}; observed ${JSON.stringify(observed)}`,
    );
  }
  // `scope` lets callers pick the roll button over the tab of the same name.
  async click(label: string, scope = SHELL_SCOPE) {
    const expression = `Array.from(document.querySelectorAll(${JSON.stringify(`${scope} button`)})).find(b => b.textContent === ${JSON.stringify(label)})`;
    await this.wait(
      `Boolean(${expression} && !(${expression}).matches(':disabled'))`,
    );
    await this.evaluate(`(${expression}).click()`);
  }
  async tab(label: string) {
    await this.click(label, "[role=tablist]");
    await this.wait(
      `Array.from(document.querySelectorAll('[role=tab]')).some(t => t.textContent === ${JSON.stringify(label)} && t.getAttribute('aria-selected') === 'true')`,
    );
  }
  async menu(moreLabel: string, label: string) {
    await this.evaluate(
      `document.querySelector(${JSON.stringify(`button[aria-label="${moreLabel}"]`)}).click()`,
    );
    await this.click(label, "[role=menu]");
  }
  async fill(selector: string, value: string) {
    await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  // The dropdown is driven by id, the value every option carries; `expected` covers a declined discard prompt that keeps the open theme.
  async selectTheme(id: string, expected = id) {
    const select = `document.querySelector(${JSON.stringify(THEME_SELECT)})`;
    await this.wait(
      `Boolean(${select} && !${select}.disabled && Array.from(${select}.options).some(o => o.value === ${JSON.stringify(id)}))`,
    );
    await this.evaluate(
      `(() => { const select = ${select}; select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
    await this.wait(
      `${select}.value === ${JSON.stringify(expected)} && !${select}.disabled`,
    );
  }
  async dialog(action: () => Promise<unknown>, accept: boolean) {
    // Chrome drops a confirm() from a background page at once, so the page must be foremost when the prompt opens.
    await this.browser.send(FOREGROUND_METHOD, {}, this.sessionId);
    const start = this.browser.events.length;
    const task = action();
    const deadline = Date.now() + TIMEOUT_MS;
    while (
      !this.browser.events
        .slice(start)
        .some(
          (event) =>
            event.sessionId === this.sessionId &&
            event.method === "Page.javascriptDialogOpening",
        )
    ) {
      if (Date.now() > deadline)
        throw new Error("Expected a confirmation dialog");
      await delay(DIALOG_POLL_MS);
    }
    await this.send("Page.handleJavaScriptDialog", { accept });
    await task;
  }
  async status(message: string) {
    await this.wait(
      `document.querySelector('.tb-shell').innerText.includes(${JSON.stringify(message)})`,
    );
  }
  async previewEvaluate<T>(expression: string): Promise<T> {
    const deadline = Date.now() + PREVIEW_TOTAL_MS;
    let lastCause: unknown;
    let attempts = 0;
    while (attempts < PREVIEW_ATTEMPTS && Date.now() < deadline) {
      attempts += 1;
      try {
        return await this.previewEvaluateOnce<T>(expression);
      } catch (cause) {
        lastCause = cause;
        await delay(PREVIEW_RETRY_MS);
      }
    }
    throw new Error(
      `previewEvaluate failed after ${attempts} attempts: ${String(lastCause)}`,
      { cause: lastCause },
    );
  }
  private async previewEvaluateOnce<T>(expression: string): Promise<T> {
    const { targetInfos } = await this.browser.send<{
      targetInfos: {
        targetId: string;
        type: string;
        browserContextId?: string;
      }[];
    }>("Target.getTargets");
    const target = targetInfos.find(
      (target) =>
        target.type === "iframe" && target.browserContextId === this.contextId,
    );
    assert.ok(target, "The opaque preview must have a separate browser target");
    const { sessionId } = await this.browser.send<{ sessionId: string }>(
      "Target.attachToTarget",
      { targetId: target.targetId, flatten: true },
    );
    try {
      const result = await this.browser.send<{
        result: { value: T };
        exceptionDetails?: unknown;
      }>("Runtime.evaluate", { expression, returnByValue: true }, sessionId);
      assert.equal(result.exceptionDetails, undefined);
      return result.result.value;
    } finally {
      await this.browser.send("Target.detachFromTarget", { sessionId });
    }
  }
  async reload() {
    await this.evaluate("window.__themeBuilderReloadMarker = true");
    await this.send("Page.reload");
    await this.wait(
      `window.__themeBuilderReloadMarker !== true && ${READY_EXPRESSION}`,
    );
  }
  async dispose() {
    await this.browser.send("Target.disposeBrowserContext", {
      browserContextId: this.contextId,
    });
  }
}
