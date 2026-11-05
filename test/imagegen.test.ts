import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

test("sdTurbo runs sd-cli with a deterministic seed, verifies the image and caches it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wata-sd-"));
  try {
    // A stand-in sd-cli: records its arguments and writes a 512×512 PNG with ffmpeg.
    await fs.mkdir(path.join(dir, "bin", "build"), { recursive: true });
    await fs.mkdir(path.join(dir, "models"));
    await fs.writeFile(path.join(dir, "models", "sd_turbo-f16-q8_0.gguf"), "");
    const cli = path.join(dir, "bin", "build", "sd-cli");
    await fs.writeFile(cli, `#!/usr/bin/env bash\nprintf '%s\\n' "$@" >> "${dir}/args.txt"\nwhile [[ $# -gt 0 ]]; do [[ $1 == -o ]] && out=$2; shift; done\nffmpeg -v error -y -f lavfi -i color=c=navy:s=512x512 -frames:v 1 "$out"\n`);
    await fs.chmod(cli, 0o755);
    process.env.WATA_SD_DIR = dir;
    const { sdTurbo } = await import(`../src/imagegen/sd.ts?${Date.now()}`);
    const gen = await sdTurbo();
    assert.ok(gen, "found sd-cli in a nested folder");
    const out = path.join(dir, "out");
    const a = await gen.generate("a cozy bedroom", out);
    const b = await gen.generate("a cozy bedroom", out);
    assert.equal(a.cached, false);
    assert.equal(b.cached, true);
    assert.equal(a.file, b.file);
    const args = (await fs.readFile(path.join(dir, "args.txt"), "utf8")).split("\n");
    assert.equal(args[args.indexOf("--steps") + 1], "4");
    assert.equal(args[args.indexOf("--cfg-scale") + 1], "1");
    assert.match(args[args.indexOf("-p") + 1]!, /^a cozy bedroom, .*no text$/);
    assert.deepEqual((await fs.readdir(out)).filter((f) => f.includes(".tmp-")), [], "no temp files left");
  } finally {
    delete process.env.WATA_SD_DIR;
    await fs.rm(dir, { recursive: true, force: true });
  }
});
