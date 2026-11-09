/**
 * The studio's "brain": Claude (through the Claude Code CLI, on the user's plan) for the work
 * that needs judgement (topics, scripts, scene direction, costumes), with every call written
 * to a token ledger and held to a budget per job and per day. Past the budget, or when Claude
 * is unavailable, the work falls back to the local model (Ollama), so the studio never stops.
 *
 * Calls run with a short system prompt of their own, no tools, no MCP servers, no settings
 * and no saved session: a call costs its prompt and its answer, not Claude Code's overhead.
 */
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { ROOT } from "../config.ts";
import { exists } from "../utils/fs.ts";
import { run } from "../utils/process.ts";
import { ollama, type LlmProvider } from "../script/providers.ts";

export const STUDIO_DIR = path.join(ROOT, "studio");
const LEDGER = path.join(STUDIO_DIR, "ledger.jsonl");
const SETTINGS = path.join(STUDIO_DIR, "settings.json");

export type ClaudeModel = "opus" | "sonnet" | "haiku";

export interface BrainSettings {
  /** Weighted tokens (see `weigh`) one job may spend writing (script, cast), producing (scene
   * direction, fixes), and all jobs together in a day. */
  perJobTokens: number;
  perProduceTokens: number;
  perDayTokens: number;
  /** The local model used past the budget. */
  fallbackModel: string;
  /** The user needs the plan's tokens for other work: no Claude calls (and no fallback). */
  paused: boolean;
}
const DEFAULTS: BrainSettings = { perJobTokens: 80_000, perProduceTokens: 150_000, perDayTokens: 2_000_000, fallbackModel: "gemma3:12b", paused: false };

export async function brainSettings(): Promise<BrainSettings> {
  if (!(await exists(SETTINGS))) {
    await fs.mkdir(STUDIO_DIR, { recursive: true });
    await fs.writeFile(SETTINGS, JSON.stringify(DEFAULTS, null, 2) + "\n");
  }
  return { ...DEFAULTS, ...JSON.parse(await fs.readFile(SETTINGS, "utf8")) };
}

export interface Usage { input: number; cacheWrite: number; cacheRead: number; output: number; usd: number }
export interface LedgerEntry extends Usage { at: string; job: string; phase?: Phase; step: string; model: string; seconds: number; ok: boolean }

/** Cache reads are cheap for the plan's limits; count them at a tenth. */
export const weigh = (u: Usage) => Math.round(u.input + u.cacheWrite + u.output + u.cacheRead * 0.1);

export async function ledger(): Promise<LedgerEntry[]> {
  if (!(await exists(LEDGER))) return [];
  return (await fs.readFile(LEDGER, "utf8")).split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Weighted tokens spent: by one job, or today (local time) by all. */
export type Phase = "write" | "produce";

export async function spent(filter: { job?: string; phase?: Phase; today?: boolean }): Promise<number> {
  const day = new Date().toLocaleDateString("sv");
  return (await ledger())
    .filter((e) => (!filter.job || e.job === filter.job) && (!filter.phase || (e.phase ?? "write") === filter.phase) && (!filter.today || new Date(e.at).toLocaleDateString("sv") === day))
    .reduce((n, e) => n + weigh(e), 0);
}

export class BudgetExceeded extends Error {}
/** Claude is paused by the user: work that needs it waits (it does not fall back). */
export class BrainPaused extends Error {}

/** Change the brain's settings (from the studio page): caps, pause. */
export async function saveBrainSettings(change: Partial<BrainSettings>): Promise<BrainSettings> {
  const raw = (await exists(SETTINGS)) ? JSON.parse(await fs.readFile(SETTINGS, "utf8")) : {};
  const next = { ...raw, ...change };
  await fs.mkdir(STUDIO_DIR, { recursive: true });
  await fs.writeFile(`${SETTINGS}.tmp`, JSON.stringify(next, null, 2));
  await fs.rename(`${SETTINGS}.tmp`, SETTINGS);
  return brainSettings();
}

/** The Claude Code binary: $CLAUDE_BIN, `claude` on the PATH, or the newest VS Code extension's. */
export async function findClaude(): Promise<string | undefined> {
  if (process.env.CLAUDE_BIN) return process.env.CLAUDE_BIN;
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    const f = path.join(dir, "claude");
    if (await exists(f)) return f;
  }
  const ext = path.join(os.homedir(), ".vscode", "extensions");
  const dirs = (await fs.readdir(ext).catch(() => [] as string[])).filter((d) => d.startsWith("anthropic.claude-code-"));
  dirs.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  for (const d of dirs.reverse()) {
    const f = path.join(ext, d, "resources", "native-binary", "claude");
    if (await exists(f)) return f;
  }
  return undefined;
}

export interface Ask {
  job: string;
  step: string;
  /** Which budget of the job pays (default write). */
  phase?: Phase;
  system: string;
  prompt: string;
  model?: ClaudeModel;
  effort?: "low" | "medium" | "high";
  /** JSON schema: the answer comes back as parsed data. */
  schema?: object;
  timeoutMs?: number;
}

/** One Claude call, budget-checked and written to the ledger. */
export async function askClaude(a: Ask): Promise<{ text: string; data?: unknown; usage: Usage }> {
  const cfg = await brainSettings();
  if (cfg.paused) throw new BrainPaused("Claude đang tạm dừng (bạn cần token cho việc khác)");
  const phase = a.phase ?? "write", cap = phase === "produce" ? cfg.perProduceTokens : cfg.perJobTokens;
  const [job, day] = [await spent({ job: a.job, phase }), await spent({ today: true })];
  if (job >= cap) throw new BudgetExceeded(`job "${a.job}" has spent ${job} of its ${cap} ${phase} tokens`);
  if (day >= cfg.perDayTokens) throw new BudgetExceeded(`today's ${day} of ${cfg.perDayTokens} tokens are spent`);
  const bin = await findClaude();
  if (!bin) throw new Error("Claude Code is not installed (or set CLAUDE_BIN)");
  // An empty working folder: no project memory or CLAUDE.md is read into the call.
  const cwd = path.join(STUDIO_DIR, "brain-cwd");
  await fs.mkdir(cwd, { recursive: true });
  const model = a.model ?? "sonnet";
  const args = [
    "-p", "--output-format", "json", "--model", model, "--max-turns", a.schema ? "3" : "1",
    "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence",
    "--setting-sources", "", "--system-prompt", a.system,
    ...(a.effort ? ["--effort", a.effort] : []),
    // The CLI's validator does not know the 2020-12 meta-schema that zod names: leave it out.
    ...(a.schema ? ["--json-schema", JSON.stringify(a.schema, (k, v) => (k === "$schema" ? undefined : v))] : []),
  ];
  const t0 = Date.now();
  let out: { result?: string; structured_output?: unknown; is_error?: boolean; usage?: Record<string, number>; total_cost_usd?: number };
  let ok = false, usage: Usage = { input: 0, cacheWrite: 0, cacheRead: 0, output: 0, usd: 0 };
  try {
    const { stdout } = await run(bin, args, { cwd, input: a.prompt, timeoutMs: a.timeoutMs ?? 15 * 60_000 }).catch((err) => {
      throw new Error(`Claude Code failed on ${a.step}: ${((err as { stderrTail?: string }).stderrTail || (err as Error).message).trim().slice(-400)}`);
    });
    out = JSON.parse(stdout);
    const u = out.usage ?? {};
    usage = { input: u.input_tokens ?? 0, cacheWrite: u.cache_creation_input_tokens ?? 0, cacheRead: u.cache_read_input_tokens ?? 0, output: u.output_tokens ?? 0, usd: out.total_cost_usd ?? 0 };
    ok = !out.is_error && (!a.schema || out.structured_output !== undefined);
  } finally {
    const entry: LedgerEntry = { at: new Date().toISOString(), job: a.job, phase, step: a.step, model, seconds: Math.round((Date.now() - t0) / 1000), ok, ...usage };
    await fs.mkdir(STUDIO_DIR, { recursive: true });
    await fs.appendFile(LEDGER, JSON.stringify(entry) + "\n");
  }
  if (!ok) throw new Error(`Claude failed on ${a.step}: ${(out!.result ?? "").slice(0, 300)}`);
  return { text: out!.result ?? "", data: out!.structured_output, usage };
}

/**
 * Ask Claude; past the budget or on failure, ask the local model the same thing instead.
 * The answer says who gave it, so a caller can mark fallback work for a closer look.
 */
export async function think<T = unknown>(a: Ask & { schema: object }, log: (s: string) => void = () => {}): Promise<{ data: T; by: string }> {
  try {
    const r = await askClaude(a);
    log(`  ${a.step}: Claude ${a.model ?? "sonnet"}, ${weigh(r.usage).toLocaleString("vi")} tokens`);
    return { data: r.data as T, by: `claude-${a.model ?? "sonnet"}` };
  } catch (err) {
    if (err instanceof BrainPaused) throw err;
    const cfg = await brainSettings();
    log(`  ${a.step}: ${(err as Error).message} → local ${cfg.fallbackModel}`);
    const local = await localModel(cfg.fallbackModel);
    const text = await local.chat({ messages: [{ role: "system", content: a.system }, { role: "user", content: a.prompt }], schema: a.schema, temperature: 0.7 });
    await local.release();
    return { data: JSON.parse(text) as T, by: `ollama-${local.model}` };
  }
}

/** The wanted local model, or the small one when it is not pulled yet. */
async function localModel(wanted: string): Promise<LlmProvider> {
  const p = ollama(wanted);
  try { await p.check(); return p; } catch { return ollama(); }
}

/**
 * The brain as an LlmProvider, for code written for the local model (scene planning): each
 * chat is one Claude call on the job's budget; past it, the local model answers instead.
 */
export function claudeProvider(job: string, phase: Phase, model: ClaudeModel = "sonnet", log: (s: string) => void = () => {}, notes: string[] = []): LlmProvider {
  let n = 0;
  return {
    id: "claude",
    model,
    async check() {
      if (!(await findClaude())) throw new Error("Claude Code is not installed (or set CLAUDE_BIN)");
    },
    async chat(req) {
      const system = [...req.messages.filter((m) => m.role === "system").map((m) => m.content), ...(notes.length ? [`The reviewer asked for these changes (follow them):\n${notes.map((x) => `- ${x}`).join("\n")}`] : [])].join("\n\n");
      const prompt = req.messages.filter((m) => m.role !== "system").map((m) => (m.role === "assistant" ? `(your earlier answer)\n${m.content}` : m.content)).join("\n\n");
      const { data } = await think({ job, phase, step: `${phase}-chat-${++n}`, model, system, prompt, schema: req.schema }, log);
      return JSON.stringify(data);
    },
    async release() {},
  };
}
