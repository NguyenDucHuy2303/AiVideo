/**
 * The words a look may use: what runtime/human.js, garments.js and horse.js can draw. Given to
 * the brain when it designs a cast or an era, and used to check what it answers.
 */
export const OUTFITS = ["dongson", "plume", "armor", "enemy", "loincloth", "tunic", "robe", "dress", "parts"] as const;
export const CUTS = ["chui", "canh", "tu_than", "giao_linh", "vien_linh", "ngu_than", "yem"] as const;
export const LENGTHS = ["waist", "hip", "knee", "shin", "ankle"] as const;
export const SLEEVES = ["none", "short", "long", "wide"] as const;
export const PATTERNS = ["none", "dongson", "dragon", "flowers", "dots"] as const;
export const LOWERS = ["skirt", "pants", "loincloth", "none"] as const;
export const HEADWEAR = ["feather", "feather_band", "helmet", "enemy_helmet", "crown", "nonla", "khan_van", "khan_mo_qua", "khan_chit", "khan_xep", "non_quai_thao", "non_chop", "mu_canh_chuon", "binh_thien", "space_helmet"] as const;
export const HAIR = ["traidao", "bun", "long", "short", "turban", "bald"] as const;
export const PROPS = ["iron_whip", "broken_whip", "bamboo", "spear", "bronze_axe", "shield", "horn", "sword", "stick", "basket", "bowl", "scroll", "flag"] as const;
export const HOUSES = ["boat", "thatch", "tile"] as const;

export const VOCABULARY = `Người (kind "human"), look là object:
- body: child | man | strong (tráng sĩ, lực sĩ) | woman | elder (dáng còng)
- build: slim | average | heavy
- skin: mã màu hex (da người Việt: #e8b27c, #e0aa74, #d9a06c, #d0a070…)
- outfit, một trong:
  · bộ có sẵn { type, color, skirt, trim }: dongson (thời Văn Lang: áo chui đầu dải hoa văn trống đồng; nữ váy, nam khố) · plume (lễ phục vua Hùng) · armor (giáp sắt tráng sĩ) · enemy (quân giặc phương Bắc) · loincloth (khố)
  · ghép mảnh (mọi thời đại sau Văn Lang): { type: "parts", top, inner, lower, belt }
    top: { cut, color, trim, length, sleeves, pattern }
      cut: chui (áo chui đầu) | canh (áo cánh cài khuy, ngắn) | tu_than (áo tứ thân mở ngực, mặc ngoài yếm, thắt lưng) | giao_linh (áo cổ chéo) | vien_linh (áo cổ tròn của quan, vua) | ngu_than (áo ngũ thân cổ đứng, thời Nguyễn) | yem (chỉ mặc yếm)
      length: waist | hip | knee | shin | ankle    sleeves: none | short | long | wide (tay thụng)
      pattern: none | dongson | dragon (rồng, chỉ vua) | flowers | dots
    inner: { color } (màu yếm bên trong áo tứ thân)
    lower: { type: skirt (váy) | pants (quần) | loincloth (khố) | none, color, length: knee | shin | ankle }
    belt: { color, ends: true } (thắt lưng bao, hai đầu buông trước bụng)
- hair: { style, color } style: traidao (trẻ con để chỏm) | bun (búi) | long | short | turban | bald
- headwear: feather (mũ lông chim vua Hùng) | feather_band (dải lông chim, thời Văn Lang) | helmet (nón sắt tráng sĩ) | enemy_helmet | crown
    | khan_van (khăn vấn, phụ nữ) | khan_mo_qua (khăn mỏ quạ, phụ nữ Bắc Bộ) | khan_chit (khăn chít đầu, đàn ông lao động) | khan_xep (khăn xếp, đàn ông thời Nguyễn)
    | nonla (nón lá) | non_quai_thao (nón quai thao, phụ nữ Bắc Bộ) | non_chop (nón chóp, lính, dân) | mu_canh_chuon (mũ cánh chuồn, quan) | binh_thien (mũ bình thiên, vua)
- beard: mã màu râu; cape: true; bareChest: true; tattoo: true (xăm mình); bracelets: true; earrings: true
- prop: { type } và props: [{ type }, …], type: iron_whip broken_whip bamboo spear bronze_axe shield horn (tù và) sword stick basket bowl scroll flag
- face: { shape: round|oval|square|jowl, eyes: round|almond|narrow|droopy, nose: button|round|long, brows: thin|thick|bushy, wrinkles: true, mustache: thin|thick|droopy, iris: mã màu, eyeScale: 0.9–1.2 }
Ngựa (kind "horse"), look: { kind: iron (ngựa sắt bờm lửa) | plain, color, mane, saddle }
Thú vật (kind "animal"), look: { species, color }: species buffalo (trâu) | tiger (hổ) | elephant (voi) | dog (chó) | cat (mèo) | rabbit (thỏ) | fox (cáo) | turtle (rùa) | deer (hươu) | goat (dê). Thú biết nói trong truyện ngụ ngôn: miệng mở theo lời thoại.`;

const has = <T extends string>(list: readonly T[], v: unknown): v is T => typeof v === "string" && (list as readonly string[]).includes(v);

/** A look with the words the library cannot draw taken out (it draws the rest). */
export function cleanLook(look: Record<string, any>): { look: Record<string, any>; dropped: string[] } {
  const out: Record<string, any> = JSON.parse(JSON.stringify(look ?? {})), dropped: string[] = [];
  const drop = (path: string, del: () => void) => { dropped.push(path); del(); };
  if (out.headwear !== undefined && !has(HEADWEAR, out.headwear)) drop(`headwear ${out.headwear}`, () => delete out.headwear);
  if (out.hair && !has(HAIR, out.hair.style)) drop(`hair ${out.hair.style}`, () => delete out.hair.style);
  for (const k of ["prop"] as const) if (out[k] && !has(PROPS, out[k].type)) drop(`prop ${out[k].type}`, () => delete out[k]);
  if (Array.isArray(out.props)) out.props = out.props.filter((p: any) => has(PROPS, p?.type) || (dropped.push(`prop ${p?.type}`), false));
  const o = out.outfit;
  if (o && !has(OUTFITS, o.type)) drop(`outfit ${o.type}`, () => (out.outfit = { type: "parts", top: { cut: "canh", color: o.color ?? "#6a4a2a" } }));
  if (out.outfit?.type === "parts") {
    const p = out.outfit;
    if (p.top && !has(CUTS, p.top.cut)) drop(`cut ${p.top.cut}`, () => (p.top.cut = "canh"));
    if (p.top?.length && !has(LENGTHS, p.top.length)) drop(`length ${p.top.length}`, () => delete p.top.length);
    if (p.top?.sleeves && !has(SLEEVES, p.top.sleeves)) drop(`sleeves ${p.top.sleeves}`, () => delete p.top.sleeves);
    if (p.top?.pattern && !has(PATTERNS, p.top.pattern)) drop(`pattern ${p.top.pattern}`, () => delete p.top.pattern);
    if (p.lower && !has(LOWERS, p.lower.type)) drop(`lower ${p.lower.type}`, () => delete p.lower);
  }
  return { look: out, dropped };
}
