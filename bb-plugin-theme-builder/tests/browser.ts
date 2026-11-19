import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";

const TIMEOUT_MS = 30000;
const POLL_MS = 100;
const BLANK_URL = "about:blank";
const CONNECT_ERROR = "Could not connect to the test browser";
const CLOSED_ERROR = "The test browser disconnected";
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
    await page.wait("document.querySelector('#light-canvas') !== null");
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
  send<T = Record<string, unknown>>(method: string, params = {}) {
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
  async click(label: string) {
    const expression = `Array.from(document.querySelectorAll('.tb-shell button')).find(b => b.textContent === ${JSON.stringify(label)})`;
    await this.wait(
      `Boolean(${expression} && !(${expression}).matches(':disabled'))`,
    );
    await this.evaluate(`(${expression}).click()`);
  }
  async fill(selector: string, value: string) {
    await this.evaluate(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event('input', { bubbles: true }));
    })()`);
  }
  async selectPreset(id: string, expected = id) {
    await this.evaluate(
      `(() => { const select = document.querySelector('.tb-edit-column select'); select.value = ${JSON.stringify(id)}; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
    );
    await this.wait(
      `document.querySelector('.tb-edit-column select').value === ${JSON.stringify(expected)} && !document.querySelector('.tb-edit-column fieldset').disabled`,
    );
  }
  async dialog(action: () => Promise<unknown>, accept: boolean) {
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
      await delay(POLL_MS);
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
      "window.__themeBuilderReloadMarker !== true && document.querySelector('#light-canvas') !== null",
    );
  }
  async dispose() {
    await this.browser.send("Target.disposeBrowserContext", {
      browserContextId: this.contextId,
    });
  }
}
