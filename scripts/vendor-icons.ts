// Copies the curated Lucide icons used by graphic scenes into assets/icons/lucide.json, so
// rendering never depends on node_modules and an icon can't vanish in a Lucide update.
// Run after changing the list: node scripts/vendor-icons.ts
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LUCIDE = path.join(ROOT, "node_modules", "lucide-static");

const ICONS = `
moon moon-star sun sunrise bed bed-double alarm-clock clock hourglass timer calendar bell
brain brain-circuit heart heart-pulse activity shield shield-check bug pill syringe stethoscope hospital dna microscope flask-conical atom
apple salad carrot coffee cup-soda droplet glass-water utensils wine cigarette fish
dumbbell bike footprints person-standing users user baby eye ear hand bone
face-grinning face-slightly-smiling face-neutral face-slightly-frowning face-angry
smartphone laptop monitor tv camera image mic message-circle gamepad-2
book-open graduation-cap lightbulb target puzzle key lock rocket sparkles star award trophy
trending-up trending-down chart-column chart-pie gauge scale clipboard-list list-checks
battery-low battery-full battery-charging zap flame thermometer
wind cloud cloud-rain leaf tree-pine sprout flower mountain waves-horizontal earth globe recycle trash
wallet piggy-bank coins banknote briefcase handshake house building car plane map-pin dog cat
check x circle-check circle-x triangle-exclamation-point info
`.trim().split(/\s+/);

const nodes = JSON.parse(fs.readFileSync(path.join(LUCIDE, "icon-nodes.json"), "utf8")) as Record<string, [string, Record<string, string>][]>;
const version = (JSON.parse(fs.readFileSync(path.join(LUCIDE, "package.json"), "utf8")) as { version: string }).version;
const missing = ICONS.filter((n) => !nodes[n]);
if (missing.length) throw new Error(`not in lucide-static ${version}: ${missing.join(", ")}`);

const out: Record<string, [string, Record<string, string>][]> = {};
for (const name of ICONS) out[name] = nodes[name]!.map(([tag, attrs]) => [tag, Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== "key"))]);
fs.writeFileSync(path.join(ROOT, "assets", "icons", "lucide.json"), `${JSON.stringify({ source: `lucide-static ${version}`, license: "ISC", icons: out })}\n`);
fs.copyFileSync(path.join(LUCIDE, "LICENSE"), path.join(ROOT, "assets", "icons", "LICENSE-lucide"));
console.log(`${ICONS.length} icons from lucide-static ${version} → assets/icons/lucide.json`);
