import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { ROOT } from "../config.ts";
import { exists, hashFile } from "../utils/fs.ts";

export const LIBRARY_DIR = path.join(ROOT, "assets", "library");

export const LibraryEntry = z.object({
  file: z.string().min(1),
  tags: z.array(z.string().min(1)).min(1),
  /** One-sentence English description; its words count for matching, less than tags. */
  description: z.string().optional(),
  source: z.string().optional(),
  license: z.string().optional(),
  licenseUrl: z.string().optional(),
  author: z.string().optional(),
  focus: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) }).optional(),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
  /** Who wrote the tags: "manual" or the vision model id. */
  taggedBy: z.string().optional(),
});
export type LibraryEntry = z.infer<typeof LibraryEntry>;
export const LibraryFile = z.object({ images: z.array(LibraryEntry) });

export interface LibraryImage {
  path: string;
  tags: Set<string>;
  words: Set<string>;
  source?: string;
  license?: string;
  licenseUrl?: string;
  author?: string;
  focus?: { x: number; y: number };
}

export function toLibraryImage(file: string, e: LibraryEntry): LibraryImage {
  return {
    path: file,
    tags: new Set(e.tags.flatMap(tokens)),
    words: new Set(tokens(e.description ?? "")),
    source: e.source,
    license: e.license,
    licenseUrl: e.licenseUrl,
    author: e.author,
    focus: e.focus,
  };
}

/** Load every `library.json` under assets/library. Entries whose file is missing are skipped with a warning. */
export async function loadLibrary(warnings: string[], dir = LIBRARY_DIR): Promise<LibraryImage[]> {
  const entries = await fs.readdir(dir, { recursive: true }).catch(() => [] as string[]);
  const images: LibraryImage[] = [];
  for (const rel of entries.filter((e) => path.basename(e) === "library.json").sort()) {
    const indexFile = path.join(dir, rel);
    const parsed = LibraryFile.safeParse(JSON.parse(await fs.readFile(indexFile, "utf8")));
    if (!parsed.success) {
      warnings.push(`${path.relative(ROOT, indexFile)} is invalid and was skipped: ${z.prettifyError(parsed.error)}`);
      continue;
    }
    for (const img of parsed.data.images) {
      const file = path.resolve(path.dirname(indexFile), img.file);
      if (!(await exists(file))) {
        warnings.push(`library image missing: ${path.relative(ROOT, file)}`);
        continue;
      }
      images.push(toLibraryImage(file, img));
    }
  }
  return images;
}

const STOPWORDS = new Set(["the", "and", "with", "for", "from", "that", "this", "into", "onto", "của", "một", "những", "các", "và"]);

export function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFC")
    .split(/[^\p{L}\d]+/u)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
}

/**
 * Best library image for a scene: 2 points per query word found in the tags, 1 per word only
 * in the description, and half a point for not being used yet in this video (so a better
 * match still wins over variety). Deterministic: ties go to the first image in path order.
 * `minTagHits` rejects weak matches: an image sharing one word with the query is often wrong.
 */
export function matchImage(query: string, library: LibraryImage[], used: Set<string>, minTagHits = 0): LibraryImage | undefined {
  const wanted = new Set(tokens(query));
  if (!wanted.size) return undefined;
  const need = Math.min(minTagHits, wanted.size);
  let best: LibraryImage | undefined;
  let bestScore = 0;
  for (const img of library) {
    let score = 0;
    let hits = 0;
    for (const t of wanted) {
      if (img.tags.has(t)) hits++;
      score += img.tags.has(t) ? 2 : img.words.has(t) ? 1 : 0;
    }
    if (score === 0 || hits < need) continue;
    if (!used.has(img.path)) score += 0.5;
    if (score > bestScore) {
      best = img;
      bestScore = score;
    }
  }
  return best;
}

/** Copy an image into the project (content-addressed) so the project is self-contained. Returns the project-relative path. */
export async function importImage(img: LibraryImage, projectDir: string): Promise<string> {
  const rel = path.join("gen", "assets", `${(await hashFile(img.path)).slice(0, 12)}${path.extname(img.path).toLowerCase()}`);
  const dest = path.join(projectDir, rel);
  if (!(await exists(dest))) {
    await fs.mkdir(path.dirname(dest), { recursive: true });
    await fs.copyFile(img.path, dest);
  }
  return rel;
}

/** Fallback backgrounds when no image matches: a scene never fails for lack of a picture. */
const PALETTES: Record<string, [string, string]> = {
  calm: ["#1E3A8A", "#0F172A"],
  dark: ["#1F2937", "#030712"],
  warm: ["#9A3412", "#1C1917"],
  energetic: ["#BE185D", "#3B0764"],
  nature: ["#047857", "#022C22"],
  serious: ["#334155", "#020617"],
};
const CYCLE = ["calm", "serious", "warm", "nature", "energetic", "dark"] as const;

export function fallbackGradient(mood: string | undefined, index: number): { from: string; to: string; known: boolean } {
  const key = mood?.toLowerCase().trim();
  const palette = key ? PALETTES[key] : undefined;
  const [from, to] = palette ?? PALETTES[CYCLE[index % CYCLE.length]!]!;
  return { from, to, known: !mood || palette !== undefined };
}
