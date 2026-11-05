import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ROOT } from "../config.ts";
import { tagImage, focusFrom, cleanTags } from "../library/tag.ts";
import { TimelineError } from "../schema/load.ts";
import { ollama } from "../script/providers.ts";
import { LIBRARY_DIR, LibraryFile, type LibraryEntry } from "../storyboard/assets.ts";
import { acquireLock, exists, hashFile, slugify, tmpPathFor, writeFileAtomic } from "../utils/fs.ts";
import { probe } from "../utils/probe.ts";

const IMAGE_EXTS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
/** Shorter than this on its short side looks soft once cropped to 1080×1920. */
const MIN_SHORT_SIDE = 1080;

export interface AddOptions {
  /** Library folder under assets/library. */
  to: string;
  /** Manual tags: skip the vision model. */
  tags?: string[];
  source?: string;
  license?: string;
  model?: string;
  /** Re-run tagging for images that are already in the library. */
  retag?: boolean;
}

async function collectImages(inputs: string[]): Promise<string[]> {
  const files: string[] = [];
  for (const input of inputs) {
    const abs = path.resolve(input);
    const st = await fs.stat(abs).catch(() => undefined);
    if (!st) throw new TimelineError(`not found: ${input}`);
    if (st.isDirectory()) {
      const entries = (await fs.readdir(abs, { recursive: true })) as string[];
      files.push(...entries.filter((e) => IMAGE_EXTS.has(path.extname(e).toLowerCase())).sort().map((e) => path.join(abs, e)));
    } else if (IMAGE_EXTS.has(path.extname(abs).toLowerCase())) {
      files.push(abs);
    } else {
      throw new TimelineError(`not an image (jpg, png, webp): ${input}`);
    }
  }
  return files;
}

async function readIndex(indexFile: string): Promise<LibraryEntry[]> {
  if (!(await exists(indexFile))) return [];
  const parsed = LibraryFile.safeParse(JSON.parse(await fs.readFile(indexFile, "utf8")));
  // Never overwrite an index we can't read: it may hold hand-written tags.
  if (!parsed.success) throw new TimelineError(`${path.relative(ROOT, indexFile)} is invalid; fix it first:\n${z.prettifyError(parsed.error)}`);
  return parsed.data.images;
}

/**
 * Copy images into assets/library/<to>/ under content-hash names (so the same photo is
 * never added twice) and describe each one, with a local vision model unless tags are
 * given. The index is saved after every image, so an interrupted run keeps its progress.
 */
export async function addToLibrary(inputs: string[], opts: AddOptions): Promise<void> {
  const files = await collectImages(inputs);
  if (!files.length) throw new TimelineError("no images found (jpg, png, webp)");
  const dir = path.join(LIBRARY_DIR, slugify(opts.to) || "my");
  const indexFile = path.join(dir, "library.json");
  const release = await acquireLock(path.join(dir, ".lock"));
  const provider = opts.tags ? undefined : ollama(opts.model);

  let added = 0;
  let failed = 0;
  try {
    await provider?.check();
    const images = await readIndex(indexFile);
    if (!opts.license) console.warn("⚠ no --license given: record where each photo comes from before publishing videos with it");

    for (const [i, file] of files.entries()) {
      const label = `[${i + 1}/${files.length}] ${path.basename(file)}`;
      const name = `${(await hashFile(file)).slice(0, 12)}${path.extname(file).toLowerCase().replace(".jpeg", ".jpg")}`;
      const existing = images.findIndex((img) => img.file === name);
      if (existing >= 0 && !opts.retag) {
        console.log(`${label}: already in the library`);
        continue;
      }

      const video = (await probe(file).catch(() => undefined))?.streams.find((s) => s.codec_type === "video");
      if (!video?.width || !video.height) {
        console.warn(`⚠ ${label}: unreadable image, skipped`);
        failed++;
        continue;
      }
      const dest = path.join(dir, name);
      if (!(await exists(dest))) {
        const tmp = tmpPathFor(dest);
        await fs.copyFile(file, tmp);
        await fs.rename(tmp, dest);
      }

      let entry: LibraryEntry = {
        file: name,
        tags: cleanTags(opts.tags ?? []),
        source: opts.source ?? path.basename(file),
        ...(opts.license ? { license: opts.license } : {}),
        width: video.width,
        height: video.height,
        taggedBy: "manual",
      };
      if (provider) {
        process.stdout.write(`${label}: describing with ${provider.model}…`);
        const started = Date.now();
        try {
          const t = await tagImage(dest, provider, path.join(dir, ".work"));
          entry = { ...entry, tags: t.tags, description: t.description, focus: focusFrom(t.subject), taggedBy: provider.model };
          process.stdout.write(` ${((Date.now() - started) / 1000).toFixed(0)}s\n  ${t.description}\n  tags: ${t.tags.join(", ")}\n`);
        } catch (err) {
          process.stdout.write("\n");
          console.warn(`⚠ ${label}: ${(err as Error).message} — not added; run again to retry, or give --tags`);
          failed++;
          continue;
        }
      } else {
        console.log(`${label}: tags ${entry.tags.join(", ")}`);
      }
      if (Math.min(video.width, video.height) < MIN_SHORT_SIDE) {
        console.warn(`⚠ ${label}: only ${video.width}×${video.height}; it will look soft in 1080p video`);
      }

      if (existing >= 0) images[existing] = entry;
      else images.push(entry);
      await writeFileAtomic(indexFile, `${JSON.stringify({ images }, null, 2)}\n`);
      added++;
    }
  } finally {
    await provider?.release();
    await fs.rm(path.join(dir, ".work"), { recursive: true, force: true });
    await release();
  }
  console.log(`\n${added} image(s) added to ${path.relative(ROOT, indexFile)}${failed ? `, ${failed} failed` : ""}`);
  if (failed) throw new TimelineError(`${failed} image(s) were not added (see ⚠ above)`);
}

/** Summary of every library: image counts, and entries that would weaken matching. */
export async function listLibrary(): Promise<void> {
  const entries = ((await fs.readdir(LIBRARY_DIR, { recursive: true }).catch(() => [])) as string[]).filter((e) => path.basename(e) === "library.json").sort();
  if (!entries.length) {
    console.log("no libraries yet — add photos with: npm run wata -- library add <folder> --to NAME --license \"…\"");
    return;
  }
  for (const rel of entries) {
    const images = await readIndex(path.join(LIBRARY_DIR, rel));
    const noLicense = images.filter((img) => !img.license).length;
    const small = images.filter((img) => img.width && img.height && Math.min(img.width, img.height) < MIN_SHORT_SIDE).length;
    const notes = [noLicense && `${noLicense} without license`, small && `${small} under ${MIN_SHORT_SIDE}px`].filter(Boolean);
    console.log(`${path.dirname(rel).padEnd(20)} ${String(images.length).padStart(4)} image(s)${notes.length ? `  ⚠ ${notes.join(", ")}` : ""}`);
  }
}
