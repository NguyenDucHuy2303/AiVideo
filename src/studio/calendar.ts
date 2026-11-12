/**
 * The posting calendar: every video laid out for posting (job.exported) or already posted
 * (job.published), by its YouTube time, for the coming days. The studio pages show it (tab
 * "Lịch đăng", the phone's "Lịch"), and drive.ts puts it on Google Drive as a text file, for
 * the user away from home. No brain, no tokens.
 */
import path from "node:path";
import type { Job } from "./jobs.ts";
import { fileNameOf, socialKey, type Exported, type PublishSettings, type Published, type What } from "./publish.ts";
import { PLATFORM_NAME, platformsOf, type Platform } from "./social.ts";

export interface CalEntry {
  /** The YouTube time (ISO). */
  at: string;
  channel: string; channelName: string;
  what: What; index?: number; label: string;
  slug: string;
  /** The topic folder's name (in ~/youtube and on Drive) and the file's name in it. */
  folder: string; file: string;
  /** Its YouTube link, once posted. */
  url?: string;
  /** TikTok / Facebook: posted or not (only the platforms this video goes to). */
  social: Partial<Record<Platform, boolean>>;
  /** Not on YouTube yet and its time has passed. */
  late: boolean;
}

const isFact = (job: Job) => job.kind === "fact" || job.kind === "fact-vi";
const labelOf = (job: Job, what: What, index?: number) => what === "long" ? "Video dài" : what === "en" ? "Bản tiếng Anh" : isFact(job) ? "Short" : `Short ${index! + 1}`;

/** Every video of one job with a time: posted (its record) or laid out (the export's). */
export function entriesOf(job: Job, settings: PublishSettings, now = new Date()): CalEntry[] {
  const out: CalEntry[] = [];
  // (one folder per topic: any laid-out video names it; once all are posted, the Drive record)
  const ex0 = job.exported?.long ?? job.exported?.en ?? job.exported?.shorts?.find(Boolean);
  const folder = ex0?.dir ? path.basename(ex0.dir) : job.drive?.folder ?? job.topic;
  const add = (what: What, index: number | undefined, pub?: Published, ex?: Exported) => {
    const rec = pub ?? ex;
    if (!rec) return;
    out.push({
      at: rec.publishAt, channel: rec.channel, channelName: settings[rec.channel]?.name ?? rec.channel,
      what, index, label: labelOf(job, what, index), slug: job.slug,
      folder, file: fileNameOf(job, { what, file: "", index }),
      url: pub?.url,
      social: Object.fromEntries(platformsOf(what).map((p) => [p, !!job.social?.[socialKey(p, what, index)]])),
      late: !pub && new Date(rec.publishAt) < now,
    });
  };
  for (const what of ["long", "en"] as const) add(what, undefined, job.published?.[what], job.exported?.[what]);
  const n = Math.max(job.published?.shorts?.length ?? 0, job.exported?.shorts?.length ?? 0);
  for (let i = 0; i < n; i++) add("short", i, job.published?.shorts?.[i] ?? undefined, job.exported?.shorts?.[i] ?? undefined);
  return out;
}

/**
 * The calendar from the start of today for `days` days, and every late video before it (not
 * yet on YouTube), sorted by time.
 */
export function calendar(jobs: Job[], settings: PublishSettings, opts: { days?: number; now?: Date } = {}): CalEntry[] {
  const now = opts.now ?? new Date(), days = opts.days ?? 7;
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate()), to = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  return jobs.flatMap((j) => entriesOf(j, settings, now))
    .filter((e) => { const t = new Date(e.at); return (t >= from && t < to) || e.late; })
    .sort((a, b) => a.at.localeCompare(b.at) || a.channel.localeCompare(b.channel));
}

const DAYS = ["Chủ nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const two = (n: number) => String(n).padStart(2, "0");
export const dayOf = (d: Date) => `${DAYS[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`;
export const hhmm = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}`;

/** One line of the text calendar: time, channel, what, where, and what is still to do. */
function line(e: CalEntry): string {
  const todo = [!e.url ? "YouTube" : "", ...(Object.entries(e.social) as [Platform, boolean][]).filter(([, done]) => !done).map(([p]) => PLATFORM_NAME[p])].filter(Boolean);
  const state = !todo.length ? "✔ đã đăng hết" : e.url ? `✔ YouTube · còn ${todo.join(", ")}` : `cần đăng: ${todo.join(", ")}`;
  return `  ${hhmm(new Date(e.at))}  ${e.channelName} · ${e.label}\n         ${e.folder} / ${e.file}\n         ${state}`;
}

/** The calendar as a text file (Google Drive: "Lich dang.txt"), readable on a phone. */
export function calendarText(entries: CalEntry[], now = new Date()): string {
  const out = [`LỊCH ĐĂNG · cập nhật ${hhmm(now)} ${dayOf(now)}/${now.getFullYear()}`, "Mỗi video nằm trong thư mục cùng tên chủ đề, bên cạnh tệp này (dang-len-youtube.txt trong đó có tiêu đề, mô tả, thẻ).", ""];
  const late = entries.filter((e) => e.late);
  if (late.length) out.push("⚠ ĐÃ QUÁ GIỜ, CHƯA ĐĂNG YOUTUBE", ...late.map(line), "");
  let day = "";
  for (const e of entries.filter((x) => !x.late)) {
    const d = dayOf(new Date(e.at));
    if (d !== day) { out.push(`── ${d} ──`); day = d; }
    out.push(line(e));
  }
  if (!entries.length) out.push("Chưa có video nào được xếp lịch.");
  return out.join("\n") + "\n";
}
