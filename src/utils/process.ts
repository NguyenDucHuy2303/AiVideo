import { spawn, type ChildProcess } from "node:child_process";

export class ProcessError extends Error {
  readonly stderrTail: string;
  constructor(message: string, stderrTail: string) {
    super(message);
    this.stderrTail = stderrTail;
  }
}

export interface RunOptions {
  cwd?: string;
  timeoutMs: number;
  /** Written to the child's stdin, which is then closed. */
  input?: string;
  env?: NodeJS.ProcessEnv;
  /** Receives every stderr chunk (for log files). */
  onStderr?: (chunk: string) => void;
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

const TAIL_CHARS = 4000;

const active = new Set<ChildProcess>();
let interrupted = false;

/**
 * Stop every running child (on Ctrl+C, a cancelled job, …). Without this, killing the
 * Node process leaves ffmpeg running as an orphan that keeps burning CPU.
 */
export function killAllChildren(): void {
  interrupted = true;
  for (const child of active) child.kill("SIGKILL");
}

export function wasInterrupted(): boolean {
  return interrupted;
}

/**
 * Run an external program with an argument array — never through a shell, so text
 * coming from timelines or LLMs can't be interpreted as commands.
 */
export function run(cmd: string, args: string[], opts: RunOptions): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    if (interrupted) {
      reject(new ProcessError("interrupted", ""));
      return;
    }
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: opts.env ?? process.env,
      stdio: [opts.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
    });
    active.add(child);
    if (opts.input !== undefined && child.stdin) {
      child.stdin.on("error", () => {}); // child may exit before reading; the exit code reports it
      child.stdin.end(opts.input, "utf8");
    }
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, opts.timeoutMs);

    child.stdout!.setEncoding("utf8").on("data", (d: string) => (stdout += d));
    child.stderr!.setEncoding("utf8").on("data", (d: string) => {
      stderr += d;
      if (stderr.length > 1_000_000) stderr = stderr.slice(-TAIL_CHARS);
      opts.onStderr?.(d);
    });

    child.on("error", (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      active.delete(child);
      const hint = err.code === "ENOENT" ? ` (is "${cmd}" installed and on PATH?)` : "";
      reject(new ProcessError(`failed to start ${cmd}: ${err.message}${hint}`, ""));
    });

    child.on("close", (code, signal) => {
      clearTimeout(timer);
      active.delete(child);
      const tail = stderr.slice(-TAIL_CHARS);
      if (interrupted) {
        reject(new ProcessError("interrupted", tail));
      } else if (timedOut) {
        reject(new ProcessError(`${cmd} timed out after ${Math.round(opts.timeoutMs / 1000)}s`, tail));
      } else if (code !== 0) {
        reject(new ProcessError(`${cmd} exited with ${code ?? signal}`, tail));
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}
