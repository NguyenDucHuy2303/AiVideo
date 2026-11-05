import fs from "node:fs";
import path from "node:path";

/** Short progress lines to the console, full detail (commands, ffmpeg stderr) to a log file. */
export class Logger {
  readonly file: string;
  private stream: fs.WriteStream;

  constructor(logDir: string, name = "render") {
    fs.mkdirSync(logDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    this.file = path.join(logDir, `${name}-${stamp}.log`);
    this.stream = fs.createWriteStream(this.file, { flags: "a" });
  }

  info(msg: string): void {
    console.log(msg);
    this.write(msg);
  }

  warn(msg: string): void {
    console.warn(`⚠ ${msg}`);
    this.write(`WARN ${msg}`);
  }

  /** Log-file only. */
  detail(msg: string): void {
    this.write(msg);
  }

  command(cmd: string, args: string[]): void {
    this.write(`$ ${cmd} ${JSON.stringify(args)}`);
  }

  private write(msg: string): void {
    this.stream.write(`[${new Date().toISOString()}] ${msg}\n`);
  }

  close(): Promise<void> {
    return new Promise((resolve) => this.stream.end(resolve));
  }
}
