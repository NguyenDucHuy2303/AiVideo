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
import { brainSettings, ledger, spent, weigh } from "../brain/claude.ts";
import { jobDir, listJobs, loadJob, saveJob, setStatus, type JobStatus } from "./jobs.ts";
import { schedulerState } from "./schedule.ts";

const UI = path.join(path.dirname(fileURLToPath(import.meta.url)), "ui.html");
const SAMPLES = path.join(ROOT, "vendor", "vieneu", "samples");
const SLUG = /^[a-z0-9-]+$/;
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

  if (parts[0] === "api") {
    if (req.method === "GET" && parts[1] === "jobs") {
      const all = await ledger();
      const jobs = (await listJobs()).map((j) => ({ ...j, tokens: all.filter((e) => e.job === j.slug).reduce((n, e) => n + weigh(e), 0) }));
      return json(res, { jobs, scheduler: await schedulerState() });
    }
    if (req.method === "GET" && parts[1] === "job" && SLUG.test(parts[2] ?? "")) {
      const slug = parts[2]!, dir = jobDir(slug);
      const files = await fsp.readdir(dir).catch(() => [] as string[]);
      return json(res, {
        job: await loadJob(slug),
        plan: await readJson(path.join(dir, "plan.json")),
        project: await readJson(path.join(dir, "project.json")),
        sources: await readJson(path.join(dir, "sources.json")),
        topic: await readJson(path.join(dir, "topic.json")),
        files,
        tokens: (await ledger()).filter((e) => e.job === slug),
      });
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
    if (req.method === "GET" && parts[1] === "tokens") {
      const cfg = await brainSettings(), all = await ledger();
      return json(res, { settings: cfg, today: await spent({ today: true }), entries: all.slice(-300).map((e) => ({ ...e, weighted: weigh(e) })) });
    }
    return json(res, { error: "not found" }, 404);
  }

  // Job files (video, thumbnail, costume sheet, script) and voice samples.
  if (req.method === "GET" && parts[0] === "files" && SLUG.test(parts[1] ?? "") && parts[2] && !parts[2].includes("..") && parts.length === 3) {
    return sendFile(req, res, path.join(jobDir(parts[1]!), parts[2]));
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
