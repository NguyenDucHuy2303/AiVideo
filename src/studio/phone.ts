/**
 * The studio on the phone, over the home Wi-Fi: the page /m (phone.html) to review scripts and
 * videos, download the videos and copy what to write on YouTube, TikTok and Facebook.
 *
 * The computer itself (127.0.0.1) needs nothing. Any other device needs the phone key: a secret
 * in studio/secrets/phone-key.txt, carried by the QR code the computer's page shows
 * (/m?k=<key>); the phone keeps it as a cookie. A new key (the file deleted) shuts every phone out.
 */
import { randomBytes, timingSafeEqual } from "node:crypto";
import fsp from "node:fs/promises";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import qrcode from "qrcode-generator";
import { SECRETS } from "./publish.ts";

const KEY_FILE = path.join(SECRETS, "phone-key.txt");
export const COOKIE = "wata_phone";
let cached: string | undefined;

/** The phone key, made on first use. */
export async function phoneKey(): Promise<string> {
  if (cached) return cached;
  let key = (await fsp.readFile(KEY_FILE, "utf8").catch(() => "")).trim();
  if (key.length < 20) {
    key = randomBytes(18).toString("base64url");
    await fsp.mkdir(SECRETS, { recursive: true, mode: 0o700 });
    await fsp.writeFile(KEY_FILE, key + "\n", { mode: 0o600 });
  }
  return (cached = key);
}

export const isLoopback = (addr?: string) => addr === "127.0.0.1" || addr === "::1" || addr === "::ffff:127.0.0.1";

/** This computer's address on the home network (not Docker's or a VM's bridges). */
export function lanAddress(nets = os.networkInterfaces()): string | undefined {
  const found: { name: string; ip: string }[] = [];
  for (const [name, list] of Object.entries(nets)) {
    if (/^(docker|br-|veth|virbr|vmnet|lo)/.test(name)) continue;
    for (const a of list ?? []) if (a.family === "IPv4" && !a.internal) found.push({ name, ip: a.address });
  }
  const priv = (ip: string) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  return (found.find((f) => priv(f.ip)) ?? found[0])?.ip;
}

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function cookieOf(req: http.IncomingMessage): string | undefined {
  for (const part of (req.headers.cookie ?? "").split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === COOKIE) return v.join("=");
  }
  return undefined;
}

/** May this request in? The computer always; another device with the key (cookie). */
export async function allowed(req: http.IncomingMessage): Promise<boolean> {
  if (isLoopback(req.socket.remoteAddress)) return true;
  const c = cookieOf(req);
  return !!c && same(c, await phoneKey());
}

/** Does the key in the QR link match? */
export async function keyMatches(k: string | null): Promise<boolean> {
  return !!k && same(k, await phoneKey());
}

/**
 * The Host a page was asked for must be this computer's own (127.0.0.1, localhost, its LAN
 * address): a web page elsewhere can't then reach the studio by pointing a name of its own at it.
 */
export function hostAllowed(host: string | undefined, lan = lanAddress()): boolean {
  if (!host) return false;
  const name = host.replace(/:\d+$/, "").replace(/^\[|\]$/g, "").toLowerCase();
  return name === "127.0.0.1" || name === "localhost" || name === "::1" || (!!lan && name === lan);
}

export const keyCookie = (key: string) => `${COOKIE}=${key}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${365 * 86400}`;

/** The link for the phone and its QR code (SVG). */
export async function phoneLink(port: number): Promise<{ url?: string; ip?: string; qr?: string }> {
  const ip = lanAddress();
  if (!ip) return {};
  const url = `http://${ip}:${port}/m?k=${await phoneKey()}`;
  const q = qrcode(0, "M");
  q.addData(url);
  q.make();
  return { url, ip, qr: q.createSvgTag({ cellSize: 6, margin: 3, scalable: true }) };
}
