import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { FFMPEG } from "../config.ts";

/**
 * Frame-exact capture of an HTML animation: headless Chrome draws the page, the page exposes
 * `window.renderFrame(seconds)`, and each frame is screenshotted and piped into ffmpeg. Time
 * never runs on its own, so every frame is the same on every run and nothing drops.
 * Talks to Chrome over the DevTools protocol with Node's own WebSocket: no extra packages.
 */
export const CHROME = process.env.CHROME_PATH ?? "google-chrome";

export interface CaptureOptions {
  page: string;
  width: number;
  height: number;
  fps: number;
  seconds: number;
  output: string;
  /** Passed to the page as `window.params` before it renders. */
  params?: unknown;
  onProgress?: (frame: number, total: number) => void;
}

class Cdp {
  private ws: WebSocket;
  private next = 1;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>();
  private listeners: ((m: any) => void)[] = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.addEventListener("message", (ev) => {
      const msg = JSON.parse(String(ev.data));
      if (msg.id && this.pending.has(msg.id)) {
        const p = this.pending.get(msg.id)!;
        this.pending.delete(msg.id);
        if (msg.error) p.reject(new Error(`${msg.error.message} ${msg.error.data ?? ""}`));
        else p.resolve(msg.result);
      } else for (const l of this.listeners) l(msg);
    });
  }

  send(method: string, params: object = {}, sessionId?: string): Promise<any> {
    const id = this.next++;
    this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }

  once(method: string): Promise<any> {
    return new Promise((resolve) => {
      const l = (m: any) => {
        if (m.method === method) {
          this.listeners = this.listeners.filter((x) => x !== l);
          resolve(m.params);
        }
      };
      this.listeners.push(l);
    });
  }
}

async function launch(width: number, height: number, profile: string): Promise<{ chrome: ChildProcess; url: string }> {
  const chrome = spawn(CHROME, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "--no-first-run",
    "--no-default-browser-check", "--hide-scrollbars", "--mute-audio", "--disable-extensions",
    "--allow-file-access-from-files", `--window-size=${width},${height}`, "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const url = await new Promise<string>((resolve, reject) => {
    let err = "";
    const timer = setTimeout(() => reject(new Error(`Chrome did not start: ${err.slice(-500)}`)), 30_000);
    chrome.stderr!.setEncoding("utf8").on("data", (d: string) => {
      err += d;
      const m = /DevTools listening on (ws:\/\/\S+)/.exec(err);
      if (m) {
        clearTimeout(timer);
        resolve(m[1]!);
      }
    });
    chrome.on("exit", (code) => reject(new Error(`Chrome exited (${code}): ${err.slice(-500)}`)));
  });
  return { chrome, url };
}

export async function capture(opts: CaptureOptions): Promise<void> {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wata-chrome-"));
  const { chrome, url } = await launch(opts.width, opts.height, profile);
  const ffmpeg = spawn(FFMPEG, [
    "-hide_banner", "-nostdin", "-y", "-v", "error",
    "-f", "image2pipe", "-framerate", String(opts.fps), "-c:v", "png", "-i", "-",
    "-c:v", "libx264", "-preset", "medium", "-crf", "17", "-pix_fmt", "yuv420p", "-movflags", "+faststart", opts.output,
  ], { stdio: ["pipe", "ignore", "pipe"] });
  let ffErr = "";
  ffmpeg.stderr!.setEncoding("utf8").on("data", (d: string) => (ffErr += d));
  const ffDone = new Promise<void>((resolve, reject) => ffmpeg.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg: ${ffErr.slice(-800)}`)))));
  try {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("cannot connect to Chrome")), { once: true });
    });
    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
    await s("Emulation.setDeviceMetricsOverride", { width: opts.width, height: opts.height, deviceScaleFactor: 1, mobile: false });
    await s("Page.enable");
    await s("Page.addScriptToEvaluateOnNewDocument", { source: `window.params = ${JSON.stringify(opts.params ?? {})};` });
    const loaded = cdp.once("Page.loadEventFired");
    await s("Page.navigate", { url: /^https?:/.test(opts.page) ? opts.page : pathToFileURL(path.resolve(opts.page)).href });
    await loaded;
    const ready = await s("Runtime.evaluate", { expression: "Promise.resolve(window.ready).then(() => typeof window.renderFrame)", awaitPromise: true, returnByValue: true });
    if (ready.result?.value !== "function") throw new Error(`${opts.page} does not define window.renderFrame`);

    const total = Math.round(opts.seconds * opts.fps);
    for (let f = 0; f < total; f++) {
      const r = await s("Runtime.evaluate", { expression: `window.renderFrame(${f / opts.fps})`, returnByValue: true });
      if (r.exceptionDetails) throw new Error(`renderFrame failed at frame ${f}: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      const shot = await s("Page.captureScreenshot", { format: "png", fromSurface: true, optimizeForSpeed: true });
      const buf = Buffer.from(shot.data, "base64");
      if (!ffmpeg.stdin!.write(buf)) await new Promise((r2) => ffmpeg.stdin!.once("drain", r2));
      opts.onProgress?.(f + 1, total);
    }
    ffmpeg.stdin!.end();
    await ffDone;
    ws.close();
  } finally {
    if (!ffmpeg.stdin!.writableEnded) ffmpeg.stdin!.end();
    // Chrome keeps writing its profile for a moment after the kill: wait for it to exit.
    const exited = new Promise((r) => (chrome.exitCode !== null ? r(null) : chrome.once("exit", r)));
    chrome.kill("SIGKILL");
    await exited;
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}

/** One still of a page as PNG (transparent where the page draws nothing, if asked). */
export async function still(opts: { page: string; width: number; height: number; output: string; params?: unknown; at?: number; transparent?: boolean }): Promise<void> {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), "wata-chrome-"));
  const { chrome, url } = await launch(opts.width, opts.height, profile);
  try {
    const ws = new WebSocket(url);
    await new Promise((resolve, reject) => {
      ws.addEventListener("open", resolve, { once: true });
      ws.addEventListener("error", () => reject(new Error("cannot connect to Chrome")), { once: true });
    });
    const cdp = new Cdp(ws);
    const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
    const s = (method: string, params: object = {}) => cdp.send(method, params, sessionId);
    await s("Emulation.setDeviceMetricsOverride", { width: opts.width, height: opts.height, deviceScaleFactor: 1, mobile: false });
    if (opts.transparent) await s("Emulation.setDefaultBackgroundColorOverride", { color: { r: 0, g: 0, b: 0, a: 0 } });
    await s("Page.enable");
    await s("Page.addScriptToEvaluateOnNewDocument", { source: `window.params = ${JSON.stringify(opts.params ?? {})};` });
    const loaded = cdp.once("Page.loadEventFired");
    await s("Page.navigate", { url: /^https?:/.test(opts.page) ? opts.page : pathToFileURL(path.resolve(opts.page)).href });
    await loaded;
    await s("Runtime.evaluate", { expression: "Promise.resolve(window.ready)", awaitPromise: true });
    const r = await s("Runtime.evaluate", { expression: `window.renderFrame(${opts.at ?? 0})` });
    if (r.exceptionDetails) throw new Error(`renderFrame failed at ${opts.at ?? 0}s: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
    const shot = await s("Page.captureScreenshot", { format: "png", fromSurface: true });
    await fs.writeFile(opts.output, Buffer.from(shot.data, "base64"));
    ws.close();
  } finally {
    const exited = new Promise((r) => (chrome.exitCode !== null ? r(null) : chrome.once("exit", r)));
    chrome.kill("SIGKILL");
    await exited;
    await fs.rm(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  }
}
