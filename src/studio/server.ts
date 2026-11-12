/**
 * The studio's web page (local only, 127.0.0.1): what waits for the user (scripts with their
 * costume sheets, finished videos), what is being made, and what the brain has spent. The
 * user's buttons only change a job's status; the scheduler does the work.
 *
 *   npm run wata -- studio [--port 5175]
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ROOT } from "../config.ts";
import { brainSettings, ledger, saveBrainSettings, spent, weigh } from "../brain/claude.ts";
import { jobDir, listJobs, loadJob, saveJob, setStatus, type JobStatus } from "./jobs.ts";
import { schedulerState, settings as scheduleSettings } from "./schedule.ts";
import { artOf, validStyle, validTheme } from "./art.ts";
import { costumeSheet } from "./design.ts";
import { BRAND_DIR, BRAND_THEMES } from "../animation/brand/brand.ts";
import { authUrl, EXPORT_DIR, exportJob, finishAuth, hasClient, markPublished, publishSettings, savePublishSettings, token, type Mode, type What } from "./publish.ts";
import { hasApiKey, seasonal } from "./trends.ts";
import { styles } from "../animation/styles.ts";

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui.html");
const SAMPLES = path.join(ROOT, "vendor", "vieneu", "samples");
const SLUG = /^[a-z0-9-]+$/;
const STYLE_SAMPLES = path.join(ROOT, "assets", "styles");
/** Costume sheets being drawn again in a new style (by slug). */
const redrawing = new Set<string>();
const TYPES: Record<string, string> = { ".html": "text/html; charset=utf-8", ".mp4": "video/mp4", ".jpg": "image/jpeg", ".png": "image/png", ".wav": "audio/wav", ".txt": "text/plain; charset=utf-8", ".json": "application/json; charset=utf-8" };

/** What each button does, by the job's status. */
const ACTIONS: Record<string, Partial<Record<JobStatus, JobStatus>>> = {
  approve: { review: "approved", video: "done" },
  fix: { review: "rewrite", video: "fix" },
  reject: { review: "rejected", video: "rejected", approved: "rejected", failed: "rejected" },
  retry: { failed: "writing", rejected: "review" },
};

async function readJson(file: string): Promise<unknown> {
  try { return JSON.parse(await fsp.readFile(file, "utf8")); } catch { return undefined; }
}

/** A file, with byte ranges (the browser seeks videos this way). */
function sendFile(req: http.IncomingMessage, res: http.ServerResponse, file: string): void {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404).end(); return; }
    const type = TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream";
    const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
    if (range) {
      const start = range[1] ? Number(range[1]) : 0, end = range[2] ? Number(range[2]) : st.size - 1;
      res.writeHead(206, { "Content-Type": type, "Content-Range": `bytes ${start}-${end}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": end - start + 1 });
      fs.createReadStream(file, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { "Content-Type": type, "Content-Length": st.size, "Accept-Ranges": "bytes" });
      fs.createReadStream(file).pipe(res);
    }
  });
}

const json = (res: http.ServerResponse, data: unknown, code = 200) => {
  res.writeHead(code, { "Content-Type": "application/json; charset=utf-8" }).end(JSON.stringify(data));
};

async function body(req: http.IncomingMessage): Promise<Record<string, string>> {
  let raw = "";
  for await (const chunk of req) { raw += chunk; if (raw.length > 100_000) break; }
  try { return JSON.parse(raw || "{}"); } catch { return {}; }
}

async function handle(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const url = new URL(req.url ?? "/", "http://localhost");
  const parts = url.pathname.split("/").filter(Boolean).map(decodeURIComponent);
  if (req.method === "GET" && parts.length === 0) return sendFile(req, res, UI);

  // Connecting a YouTube channel (publish.ts): to Google and back.
  if (req.method === "GET" && parts[0] === "oauth") {
    const page = (msg: string): void => void res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }).end(`<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;padding:40px"><h2>${msg.replace(/</g, "&lt;")}</h2><p><a href="/">← Về trang duyệt</a></p>`);
    const redirect = `http://${req.headers.host ?? "127.0.0.1:5175"}/oauth/callback`;
    try {
      if (parts[1] === "start") { res.writeHead(302, { Location: await authUrl(url.searchParams.get("channel") ?? "", redirect) }).end(); return; }
      if (parts[1] === "callback") {
        if (url.searchParams.get("error")) return page(`Google từ chối: ${url.searchParams.get("error")}`);
        const r = await finishAuth(url.searchParams.get("state") ?? "", url.searchParams.get("code") ?? "");
        return page(`✔ Đã kết nối "${r.channel}" với kênh YouTube: ${r.title}`);
      }
    } catch (err) { return page(`✘ ${(err as Error).message}`); }
  }

  if (parts[0] === "api") {
    if (req.method === "GET" && parts[1] === "jobs") {
      const all = await ledger();
      const jobs = (await listJobs()).map((j) => ({ ...j, tokens: all.filter((e) => e.job === j.slug).reduce((n, e) => n + weigh(e), 0) }));
      return json(res, { jobs, scheduler: await schedulerState() });
    }
    if (req.method === "GET" && parts[1] === "job" && SLUG.test(parts[2] ?? "")) {
      const slug = parts[2]!, dir = jobDir(slug);
      const files = await fsp.readdir(dir).catch(() => [] as string[]);
      const job = await loadJob(slug);
      return json(res, {
        job, art: artOf(job), redrawing: redrawing.has(slug),
        plan: await readJson(path.join(dir, "plan.json")),
        project: await readJson(path.join(dir, "project.json")),
        sources: await readJson(path.join(dir, "sources.json")),
        topic: await readJson(path.join(dir, "topic.json")),
        files,
        tokens: (await ledger()).filter((e) => e.job === slug),
      });
    }
    if (req.method === "GET" && parts[1] === "art") {
      // The styles and intro/outro themes to choose from, with their samples when drawn.
      const have = new Set([...(await fsp.readdir(STYLE_SAMPLES).catch(() => [])), ...(await fsp.readdir(path.join(BRAND_DIR, "clips")).catch(() => []))]);
      return json(res, {
        styles: Object.entries(styles()).map(([key, s]) => ({ key, name: s.name, for: s.for, sample: have.has(`${key}.jpg`) ? `/art/style/${key}.jpg` : null })),
        themes: Object.entries(BRAND_THEMES).map(([key, t]) => ({ key, name: t.name, for: t.for, intro: have.has(`intro_${key}_16x9.mp4`) ? `/art/clip/intro_${key}_16x9.mp4` : null, outro: have.has(`outro_${key}_16x9.mp4`) ? `/art/clip/outro_${key}_16x9.mp4` : null })),
      });
    }
    if (req.method === "POST" && parts[1] === "job" && SLUG.test(parts[2] ?? "") && parts[3] === "art") {
      // The user's choice of style, intro and outro; a new style redraws the costume sheet.
      const slug = parts[2]!, job = await loadJob(slug), b = await body(req) as Record<string, unknown>;
      if (job.status === "writing" || job.status === "rejected") return json(res, { error: `không đổi được khi đang "${job.status}"` }, 400);
      const art = artOf(job), before = art.style;
      if (b.style !== undefined) { if (!validStyle(b.style)) return json(res, { error: "phong cách không có" }, 400); art.style = b.style; }
      for (const k of ["intro", "outro"] as const) if (b[k] !== undefined) { if (!validTheme(b[k])) return json(res, { error: `${k} không có` }, 400); art[k] = b[k] as string; }
      job.art = art;
      await saveJob(job);
      if (art.style !== before && (await fsp.stat(path.join(jobDir(slug), "cast.json")).catch(() => null)) && !redrawing.has(slug)) {
        redrawing.add(slug);
        costumeSheet(slug).catch((e) => console.error(`sheet ${slug}: ${(e as Error).message}`)).finally(() => redrawing.delete(slug));
      }
      return json(res, { job, art, redrawing: redrawing.has(slug) });
    }
    if (req.method === "POST" && parts[1] === "job" && SLUG.test(parts[2] ?? "") && parts[3] === "rerender") {
      // The finished film again with the new look: no brain, only the render (tonight).
      const job = await loadJob(parts[2]!);
      if (job.status !== "video" && job.status !== "done") return json(res, { error: "chỉ render lại được video đã xong" }, 400);
      job.stage = "ready";
      await saveJob(job);
      return json(res, { job: await setStatus(job, "producing", "bạn: render lại với phong cách / intro / outro mới") });
    }
    if (req.method === "POST" && parts[1] === "job" && SLUG.test(parts[2] ?? "") && parts[3]) {
      const job = await loadJob(parts[2]!), to = ACTIONS[parts[3]]?.[job.status];
      if (!to) return json(res, { error: `"${parts[3]}" không áp dụng khi đang "${job.status}"` }, 400);
      const { note } = await body(req);
      if (parts[3] === "fix") {
        if (!note?.trim()) return json(res, { error: "Cần ghi chú cần sửa gì" }, 400);
        job.notes.push({ at: new Date().toISOString(), text: note.trim().slice(0, 4000), on: job.status === "video" ? "video" : "script" });
        await saveJob(job);
      }
      return json(res, { job: await setStatus(job, to, note?.trim() ? `bạn: ${note.trim().slice(0, 200)}` : `bạn: ${parts[3]}`) });
    }
    if (req.method === "GET" && parts[1] === "trends") {
      const raw = await readJson(path.join(ROOT, "studio", "trends.json")) as { popular?: unknown; day?: string } | undefined;
      return json(res, { hasKey: await hasApiKey(), seasonal: { vi: seasonal("vi"), en: seasonal("en") }, popular: raw?.popular ?? {}, day: raw?.day });
    }
    if (parts[1] === "publish") {
      if (req.method === "POST") {
        const b = await body(req) as unknown as { channel: string; mode?: Mode; long?: string[]; shorts?: string[] };
        try { await savePublishSettings(b.channel, b); } catch (err) { return json(res, { error: (err as Error).message }, 400); }
      }
      const cfg = await publishSettings();
      const channels = await Promise.all(Object.entries(cfg).map(async ([key, c]) => { const t = await token(key); return { key, ...c, connected: !!t, channelTitle: t?.channelTitle }; }));
      return json(res, { client: await hasClient(), channels, exportDir: EXPORT_DIR() });
    }
    // By hand: lay a job's videos out now (any mode but off), or every approved job's.
    if (req.method === "POST" && (parts[1] === "export-all" || (parts[1] === "job" && parts[3] === "export" && SLUG.test(parts[2] ?? "")))) {
      const s = await scheduleSettings(), jobs = await listJobs(), dirs: string[] = [];
      const which = parts[1] === "export-all" ? jobs.filter((j) => j.status === "done" && !j.publishHold) : [await loadJob(parts[2]!)];
      try { for (const j of which) dirs.push(...(await exportJob(j.slug, await listJobs(), s.publish, s.pick.lines, { force: true }))); }
      catch (err) { return json(res, { error: (err as Error).message, dirs }, 400); }
      return json(res, { dirs, exportDir: EXPORT_DIR() });
    }
    // The user uploaded an exported video: its link.
    if (req.method === "POST" && parts[1] === "job" && parts[3] === "published" && SLUG.test(parts[2] ?? "")) {
      const b = await body(req) as unknown as { what: What; index?: number; url: string }, s = await scheduleSettings();
      if (!["long", "en", "short"].includes(b.what)) return json(res, { error: "loại video không hợp lệ" }, 400);
      try { return json(res, { published: await markPublished(parts[2]!, b.what, b.index === undefined ? undefined : Number(b.index), String(b.url ?? ""), s.pick.lines) }); }
      catch (err) { return json(res, { error: (err as Error).message }, 400); }
    }
    if (req.method === "POST" && parts[1] === "job" && parts[3] === "hold" && SLUG.test(parts[2] ?? "")) {
      const job = await loadJob(parts[2]!), b = await body(req) as unknown as { hold: boolean };
      job.publishHold = !!b.hold;
      if (!b.hold) { delete job.publishRetryAt; delete job.publishError; }
      await saveJob(job);
      return json(res, { ok: true, hold: job.publishHold });
    }
    if (req.method === "POST" && parts[1] === "settings") {
      const b = await body(req) as Record<string, unknown>, change: Record<string, unknown> = {};
      for (const k of ["perDayTokens", "perJobTokens", "perProduceTokens"]) {
        const n = Number(b[k]);
        if (b[k] !== undefined) { if (!Number.isFinite(n) || n < 0 || n > 50_000_000) return json(res, { error: `${k} không hợp lệ` }, 400); change[k] = Math.round(n); }
      }
      if (b.paused !== undefined) change.paused = !!b.paused;
      return json(res, { settings: await saveBrainSettings(change) });
    }
    if (req.method === "GET" && parts[1] === "tokens") {
      const cfg = await brainSettings(), all = await ledger();
      return json(res, { settings: cfg, today: await spent({ today: true }), entries: all.slice(-300).map((e) => ({ ...e, weighted: weigh(e) })) });
    }
    return json(res, { error: "not found" }, 404);
  }

  // Job files (video, thumbnail, costume sheet, script) and voice samples.
  // Job files (and its shorts/ folder): plain names only, no way out of the folder.
  const NAME = /^[\w.-]+$/;
  if (req.method === "GET" && parts[0] === "files" && SLUG.test(parts[1] ?? "") && parts.slice(2).every((x) => NAME.test(x) && x !== ".." && x !== ".")
    && (parts.length === 3 || (parts.length === 4 && parts[2] === "shorts"))) {
    return sendFile(req, res, path.join(jobDir(parts[1]!), ...parts.slice(2)));
  }
  // Style samples and intro/outro previews.
  if (req.method === "GET" && parts[0] === "art" && parts.length === 3 && NAME.test(parts[2]!) && !parts[2]!.startsWith(".")) {
    if (parts[1] === "style") return sendFile(req, res, path.join(STYLE_SAMPLES, parts[2]!));
    if (parts[1] === "clip") return sendFile(req, res, path.join(BRAND_DIR, "clips", parts[2]!));
  }
  if (req.method === "GET" && parts[0] === "voice" && parts[1] && !parts[1].includes("/") && !parts[1].includes("..")) {
    return sendFile(req, res, path.join(SAMPLES, `${parts[1]}.wav`));
  }
  res.writeHead(404).end();
}

export function startServer(port = 5175): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    handle(req, res).catch((err) => json(res, { error: (err as Error).message }, 500));
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve(server)));
}
