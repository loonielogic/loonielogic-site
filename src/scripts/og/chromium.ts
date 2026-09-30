/**
 * chromium.ts: a minimal headless-Chromium driver over the DevTools protocol,
 * using Node's built-in WebSocket (no puppeteer/playwright dependency).
 *
 * Finds the browser from $CHROME_PATH, then the usual install locations
 * (the Playwright headless shell cache on the build VM included).
 */

import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir, homedir } from "node:os";
import { join } from "node:path";

function findChrome(): string {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  const candidates = [
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
    "/opt/google/chrome/chrome",
  ];
  const pw = join(homedir(), ".cache", "ms-playwright");
  if (existsSync(pw)) {
    for (const d of readdirSync(pw).sort().reverse()) {
      candidates.push(join(pw, d, "chrome-headless-shell-linux64", "chrome-headless-shell"));
      candidates.push(join(pw, d, "chrome-linux", "chrome"));
    }
  }
  const hit = candidates.find((c) => existsSync(c));
  if (!hit) throw new Error("No Chromium found. Set CHROME_PATH to a Chrome/Chromium binary.");
  return hit;
}

type Pending = { resolve: (v: any) => void; reject: (e: Error) => void };

export class Browser {
  private ws!: WebSocket;
  private proc!: ChildProcess;
  private profile!: string;
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private listeners = new Map<string, Array<(p: any) => void>>();

  static async launch(): Promise<Browser> {
    const b = new Browser();
    b.profile = mkdtempSync(join(tmpdir(), "ll-og-chrome-"));
    b.proc = spawn(
      findChrome(),
      [
        "--headless",
        "--remote-debugging-port=0",
        `--user-data-dir=${b.profile}`,
        "--no-first-run",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-color-profile=srgb",
        "--font-render-hinting=none",
        // Chromium refuses to run as root with its sandbox on. It only ever
        // renders our own generated HTML here, so that is acceptable.
        ...(process.getuid?.() === 0 ? ["--no-sandbox"] : []),
        "about:blank",
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    const browserWs = await new Promise<string>((resolve, reject) => {
      let buf = "";
      const t = setTimeout(() => reject(new Error("Chromium did not start")), 15000);
      b.proc.stderr!.on("data", (d) => {
        buf += String(d);
        const m = buf.match(/DevTools listening on (ws:\/\/\S+)/);
        if (m) {
          clearTimeout(t);
          resolve(m[1]);
        }
      });
      b.proc.on("exit", (code) => reject(new Error(`Chromium exited (${code}): ${buf}`)));
    });
    // Attach to the default page target over HTTP discovery.
    const port = new URL(browserWs).port;
    const targets = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()) as Array<{
      type: string;
      webSocketDebuggerUrl: string;
    }>;
    const page = targets.find((t) => t.type === "page");
    if (!page) throw new Error("No page target");
    b.ws = new WebSocket(page.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      b.ws.onopen = res;
      b.ws.onerror = rej;
    });
    b.ws.onmessage = (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && b.pending.has(msg.id)) {
        const p = b.pending.get(msg.id)!;
        b.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(msg.error.message));
        else p.resolve(msg.result);
      } else if (msg.method) {
        for (const fn of b.listeners.get(msg.method) ?? []) fn(msg.params);
      }
    };
    await b.send("Page.enable");
    await b.send("Runtime.enable");
    return b;
  }

  send(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  private once(method: string): Promise<any> {
    return new Promise((resolve) => {
      const fns = this.listeners.get(method) ?? [];
      const fn = (p: any) => {
        this.listeners.set(method, (this.listeners.get(method) ?? []).filter((f) => f !== fn));
        resolve(p);
      };
      fns.push(fn);
      this.listeners.set(method, fns);
    });
  }

  async evaluate<T>(expression: string): Promise<T> {
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(`Page script failed: ${r.exceptionDetails.text}`);
    return r.result.value as T;
  }

  /**
   * Load `html` at a fixed viewport, wait for webfonts, run `beforeCapture`
   * (its value comes back as `info`), and return a PNG of the viewport.
   */
  async screenshot<I = unknown>(
    html: string,
    width: number,
    height: number,
    opts: { transparent?: boolean; beforeCapture?: string } = {},
  ): Promise<{ png: Buffer; info: I | undefined }> {
    await this.send("Emulation.setDeviceMetricsOverride", {
      width,
      height,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await this.send("Emulation.setDefaultBackgroundColorOverride", {
      color: opts.transparent ? { r: 0, g: 0, b: 0, a: 0 } : { r: 255, g: 255, b: 255, a: 1 },
    });
    const { frameTree } = await this.send("Page.getFrameTree");
    const loaded = this.once("Page.loadEventFired");
    await this.send("Page.setDocumentContent", { frameId: frameTree.frame.id, html });
    await Promise.race([loaded, new Promise((r) => setTimeout(r, 3000))]);
    await this.evaluate("document.fonts.ready.then(() => true)");
    const info = opts.beforeCapture ? await this.evaluate<I>(opts.beforeCapture) : undefined;
    const { data } = await this.send("Page.captureScreenshot", {
      format: "png",
      clip: { x: 0, y: 0, width, height, scale: 1 },
      captureBeyondViewport: false,
    });
    return { png: Buffer.from(data, "base64"), info };
  }

  async close(): Promise<void> {
    try {
      this.ws?.close();
    } catch {}
    this.proc?.kill("SIGKILL");
    await new Promise((r) => setTimeout(r, 200));
    rmSync(this.profile, { recursive: true, force: true });
  }
}
