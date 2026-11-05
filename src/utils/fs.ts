import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export async function exists(file: string): Promise<boolean> {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

export function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

const fileHashCache = new Map<string, string>();

/** Content hash of a file, memoized by path + size + mtime. */
export async function hashFile(file: string): Promise<string> {
  const st = await fs.stat(file);
  const key = `${file}:${st.size}:${st.mtimeMs}`;
  const cached = fileHashCache.get(key);
  if (cached) return cached;
  const digest = sha256(await fs.readFile(file));
  fileHashCache.set(key, digest);
  return digest;
}

/** Path for a file being written; renamed into place only after it has been verified. */
export function tmpPathFor(finalPath: string): string {
  const { dir, name, ext } = path.parse(finalPath);
  return path.join(dir, `${name}.tmp-${process.pid}${ext}`);
}

export async function writeFileAtomic(file: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = tmpPathFor(file);
  await fs.writeFile(tmp, data);
  await fs.rename(tmp, file);
}

/**
 * Exclusive lock so two renders of the same project can't clobber each other.
 * A lock left by a dead process is taken over.
 */
export async function acquireLock(lockFile: string): Promise<() => Promise<void>> {
  await fs.mkdir(path.dirname(lockFile), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const handle = await fs.open(lockFile, "wx");
      await handle.writeFile(String(process.pid));
      await handle.close();
      return () => fs.rm(lockFile, { force: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;
      const pid = Number(await fs.readFile(lockFile, "utf8").catch(() => "0"));
      if (pid && isAlive(pid)) {
        throw new Error(`project is already being rendered by process ${pid} (${lockFile})`);
      }
      await fs.rm(lockFile, { force: true });
    }
  }
  throw new Error(`could not acquire lock ${lockFile}`);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Remove leftovers of interrupted renders. */
export async function removeTmpFiles(dir: string): Promise<void> {
  const entries = await fs.readdir(dir, { recursive: true }).catch(() => [] as string[]);
  await Promise.all(
    entries.filter((e) => /\.tmp-\d+\./.test(e)).map((e) => fs.rm(path.join(dir, e), { force: true })),
  );
}

export function slugify(text: string): string {
  return (
    text
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[đĐ]/g, "d")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "video"
  );
}
