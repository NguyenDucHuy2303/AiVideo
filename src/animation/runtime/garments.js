/**
 * Clothes put together from parts, for every era after Văn Lang: a look's outfit
 * { type: "parts", top, inner, lower, belt } instead of one fixed costume. New eras are
 * described with these words (by the era builder, from research), so an era needs no new code
 * unless it brings a garment the parts cannot make.
 *
 *   top:   { cut, color, trim, length, sleeves, pattern }
 *          cut:     chui (áo chui đầu) · canh (áo cánh, cài khuy) · tu_than (áo tứ thân, mở ngực,
 *                   thắt vạt, mặc ngoài yếm) · giao_linh (cổ chéo) · vien_linh (cổ tròn, quan lại) ·
 *                   ngu_than (áo ngũ thân, cổ đứng, cài chéo) · yem (chỉ mặc yếm)
 *          length:  waist · hip · knee · shin · ankle      sleeves: none · short · long · wide
 *          pattern: none · dongson · dragon (rồng, của vua) · flowers · dots
 *   inner: { color }                  the yếm under an open top (tu_than)
 *   lower: { type, color, length }    type: skirt (váy) · pants (quần) · loincloth (khố) · none
 *   belt:  { color, ends }            thắt lưng; ends: true = tied, the ends hang in front
 *
 * Headwear (look.headwear): khan_mo_qua · khan_van · khan_xep · non_quai_thao · non_chop ·
 * mu_canh_chuon · binh_thien · khan_chit (khăn chít đầu, đàn ông).
 */
(function () {
  const { el, g, f2, shade, INK, OUT } = WA.core;
  const LEN = { waist: 0, hip: 0.12, knee: 0.38, shin: 0.68, ankle: 0.92 };

  /** Colours and lengths the body needs before it is drawn (legs, arms, skirt, coat tail). */
  function resolve(outfit, look, B, skin) {
    const top = outfit.top || { cut: "canh", color: "#6a4a2a" }, lower = outfit.lower || { type: look.body === "woman" ? "skirt" : "pants", color: "#2e2420" };
    const color = top.color || "#6a4a2a";
    const sleeves = top.sleeves || (top.cut === "yem" ? "none" : "long");
    const legLen = B.thigh + B.shin;
    const pants = lower.type === "pants" ? lower.color || "#2e2a24" : null;
    // A skirt hangs from the hips; a long top hangs over it as a coat tail.
    const skirtL = lower.type === "skirt" ? B.thigh + B.shin * (LEN[lower.length || "ankle"] ?? 0.85) : 0;
    const coatL = ["knee", "shin", "ankle"].includes(top.length) && top.cut !== "yem" ? B.thigh * 0.5 + legLen * (LEN[top.length] - 0.05) : 0;
    return {
      pantsHex: pants || skin,
      legHex: pants || skin,
      feetHex: shade(skin, -0.1),
      sleeveHex: sleeves === "none" ? skin : color,
      foreHex: sleeves === "long" || sleeves === "wide" ? color : skin,
      wide: sleeves === "wide",
      skirt: skirtL ? { len: skirtL, color: lower.color || "#2e2420" } : null,
      coat: coatL ? { len: coatL, color, trim: top.trim } : null,
      loincloth: lower.type === "loincloth" ? lower.color || "#6a4a2a" : null,
    };
  }

  /** A wide sleeve hangs from the forearm (officials, kings, ceremonial dress). */
  function sleeve(S, elbow, B, color, front) {
    const L = B.fore, w = B.armW;
    el("path", { d: `M ${f2(-w * 0.55)} ${f2(L * 0.15)} L ${f2(-w * 1.4)} ${f2(L * 0.95)} Q ${f2(-w * 0.2)} ${f2(L * 1.15)} ${f2(w * 0.6)} ${f2(L * 0.9)} L ${f2(w * 0.5)} ${f2(L * 0.15)} Z`, fill: S.mat(front ? color : shade(color, -0.25), true), ...OUT }, elbow);
  }

  function pattern(t, kind, w, T, color) {
    const gold = "#f1d08a";
    if (kind === "dongson") WA.human.dongsonBand(t, -w / 2 + 2, w / 2 + 2, -T * 0.2, 16, color);
    if (kind === "dots" || kind === "flowers") for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      const x = -w * 0.3 + c * w * 0.28 + (r % 2) * w * 0.14, y = -T * 0.8 + r * T * 0.2;
      if (kind === "dots") el("circle", { cx: f2(x), cy: f2(y), r: 3, fill: gold, opacity: 0.8 }, t);
      else for (let k = 0; k < 5; k++) el("circle", { cx: f2(x + Math.cos(k * 1.256) * 4.5), cy: f2(y + Math.sin(k * 1.256) * 4.5), r: 2.6, fill: gold, opacity: 0.85 }, t);
    }
    if (kind === "dragon") {
      // A dragon coiled on the chest: a gold S-curve with a head and scales, as on royal robes.
      el("path", { d: `M ${f2(-w * 0.3)} ${f2(-T * 0.25)} C ${f2(-w * 0.45)} ${f2(-T * 0.6)} ${f2(w * 0.35)} ${f2(-T * 0.45)} ${f2(w * 0.2)} ${f2(-T * 0.75)} C ${f2(w * 0.1)} ${f2(-T * 0.92)} ${f2(-w * 0.2)} ${f2(-T * 0.85)} ${f2(-w * 0.1)} ${f2(-T * 0.7)}`, stroke: gold, "stroke-width": 7, fill: "none", "stroke-linecap": "round" }, t);
      el("circle", { cx: f2(-w * 0.1), cy: f2(-T * 0.7), r: 7, fill: gold, stroke: INK, "stroke-width": 1.5 }, t);
      for (let i = 0; i < 6; i++) el("circle", { cx: f2(-w * 0.28 + i * w * 0.1), cy: f2(-T * (0.32 + (i % 3) * 0.12)), r: 2.5, fill: "#c0392b" }, t);
    }
  }

  /** The upper body: top, yếm, collar, buttons, belt (torso coordinates: hips 0, shoulders -T). */
  function torso(S, t, B, outfit, skin, look) {
    const T = B.torsoH, w = B.torsoW, belly = (B.belly || 0) * w;
    const top = outfit.top || { cut: "canh", color: "#6a4a2a" }, color = top.color || "#6a4a2a", trim = top.trim || shade(color, -0.35);
    const female = look.body === "woman";
    const body = `M ${f2(-w / 2)} 8 C ${f2(-w * 0.56)} ${f2(-T * 0.4)} ${f2(-w * 0.52)} ${f2(-T * 0.8)} ${f2(-w * 0.44)} ${f2(-T + 6)} Q 0 ${f2(-T - 14)} ${f2(w * 0.46)} ${f2(-T + 6)} C ${f2(w * 0.56 + belly * 0.3)} ${f2(-T * 0.7)} ${f2(w * 0.5 + belly)} ${f2(-T * 0.3)} ${f2(w / 2 + 4)} 8 Q 2 20 ${f2(-w / 2)} 8 Z`;
    const folds = () => el("path", { d: `M ${f2(-w * 0.3)} ${f2(-T * 0.62)} q ${f2(w * 0.1)} ${f2(T * 0.12)} ${f2(w * 0.04)} ${f2(T * 0.3)} M ${f2(w * 0.18)} ${f2(-T * 0.35)} q ${f2(w * 0.08)} ${f2(T * 0.1)} ${f2(w * 0.02)} ${f2(T * 0.25)}`, stroke: shade(color, -0.3), "stroke-width": 2.5, fill: "none", opacity: 0.6, "stroke-linecap": "round" }, t);
    const lower = outfit.lower || {};
    if (lower.type === "loincloth") {
      el("path", { d: `M ${f2(-w / 2)} -12 L ${f2(w / 2 + 4)} -12 L ${f2(w / 2 + 2)} 12 L ${f2(w * 0.22)} 46 L ${f2(-w * 0.08)} 12 L ${f2(-w / 2)} 10 Z`, fill: S.mat(lower.color || "#6a4a2a", true), ...OUT }, t);
    }
    switch (top.cut) {
      case "yem": {
        el("path", { d: body, fill: S.mat(skin), ...OUT }, t);
        // The yếm: a diamond of cloth on the chest, tied at the neck and round the back.
        el("path", { d: `M ${f2(-w * 0.1)} ${f2(-T * 0.86)} L ${f2(w * 0.5)} ${f2(-T * 0.62)} L ${f2(w * 0.46)} ${f2(-T * 0.06)} L ${f2(-w * 0.36)} ${f2(-T * 0.08)} Z`, fill: S.mat((outfit.inner || {}).color || color), ...OUT }, t);
        el("path", { d: `M ${f2(-w * 0.1)} ${f2(-T * 0.86)} L ${f2(-w * 0.05)} ${f2(-T - 4)} M ${f2(-w * 0.36)} ${f2(-T * 0.5)} L ${f2(-w * 0.5)} ${f2(-T * 0.48)}`, stroke: INK, "stroke-width": 2.5 }, t);
        break;
      }
      case "chui": {
        el("path", { d: `M ${f2(-w / 2)} -2 L ${f2(-w * 0.46)} ${f2(-T + 6)} Q 0 ${f2(-T - 14)} ${f2(w * 0.48)} ${f2(-T + 6)} L ${f2(w / 2 + 4)} -2 Q 2 8 ${f2(-w / 2)} -2 Z`, fill: S.mat(color), ...OUT }, t);
        folds();
        el("path", { d: `M ${f2(-w * 0.18)} ${f2(-T - 1)} Q 4 ${f2(-T * 0.72)} ${f2(w * 0.26)} ${f2(-T - 1)}`, stroke: trim, "stroke-width": 5, fill: "none" }, t);
        break;
      }
      case "tu_than": {
        // The yếm shows in the V of the open front; the panels cross at the waist under the belt.
        el("path", { d: body, fill: S.mat(color), ...OUT }, t);
        folds();
        el("path", { d: `M ${f2(w * 0.02)} ${f2(-T - 4)} L ${f2(w * 0.5)} ${f2(-T * 0.86)} L ${f2(w * 0.52)} ${f2(-T * 0.12)} Z`, fill: S.mat((outfit.inner || {}).color || "#c0392b"), ...OUT, "stroke-width": 2.5 }, t);
        el("path", { d: `M ${f2(w * 0.02)} ${f2(-T - 4)} L ${f2(w * 0.5)} ${f2(-T * 0.12)}`, stroke: trim, "stroke-width": 6, fill: "none" }, t);
        break;
      }
      case "giao_linh": {
        // The cross collar: a wide band from the back of the neck down to the front of the waist.
        el("path", { d: body, fill: S.mat(color), ...OUT }, t);
        folds();
        el("path", { d: `M ${f2(-w * 0.2)} ${f2(-T - 3)} Q ${f2(w * 0.1)} ${f2(-T * 0.9)} ${f2(w * 0.5)} ${f2(-T * 0.3)}`, stroke: trim, "stroke-width": 11, fill: "none" }, t);
        el("path", { d: `M ${f2(w * 0.14)} ${f2(-T - 4)} L ${f2(w * 0.36)} ${f2(-T * 0.72)}`, stroke: shade(trim, 0.2), "stroke-width": 7, fill: "none" }, t);
        break;
      }
      case "vien_linh": {
        // The round collar of officials and kings.
        el("path", { d: body, fill: S.mat(color), ...OUT }, t);
        folds();
        el("path", { d: `M ${f2(-w * 0.24)} ${f2(-T - 2)} Q 4 ${f2(-T * 0.62)} ${f2(w * 0.34)} ${f2(-T - 2)}`, stroke: trim, "stroke-width": 9, fill: "none" }, t);
        break;
      }
      case "ngu_than": {
        // Áo ngũ thân: a standing collar and buttons running from the neck to under the arm.
        el("path", { d: body, fill: S.mat(color), ...OUT }, t);
        folds();
        el("rect", { x: f2(-w * 0.14), y: f2(-T - 12), width: f2(w * 0.4), height: 12, rx: 4, fill: S.mat(trim), ...OUT, "stroke-width": 2 }, t);
        el("path", { d: `M ${f2(w * 0.24)} ${f2(-T)} Q ${f2(w * 0.42)} ${f2(-T * 0.85)} ${f2(w * 0.5)} ${f2(-T * 0.62)}`, stroke: shade(color, -0.4), "stroke-width": 3, fill: "none" }, t);
        for (let i = 0; i < 3; i++) el("circle", { cx: f2(w * (0.3 + i * 0.08)), cy: f2(-T * (0.93 - i * 0.1)), r: 3, fill: "#f1d08a", stroke: INK, "stroke-width": 1.2 }, t);
        break;
      }
      default: { // canh: a short jacket buttoned down the front
        el("path", { d: body, fill: S.mat(color), ...OUT }, t);
        folds();
        el("path", { d: `M 6 ${f2(-T + 2)} L 10 6`, stroke: shade(color, -0.3), "stroke-width": 3 }, t);
        for (let i = 0; i < 4; i++) el("circle", { cx: 12, cy: f2(-T * 0.8 + i * T * 0.2), r: 3, fill: "#f1d08a", stroke: INK, "stroke-width": 1.5 }, t);
        el("path", { d: `M ${f2(-w * 0.2)} ${f2(-T - 1)} Q 4 ${f2(-T * 0.72)} ${f2(w * 0.28)} ${f2(-T - 1)}`, stroke: trim, "stroke-width": 4, fill: "none" }, t);
      }
    }
    if (top.pattern && top.pattern !== "none" && top.cut !== "yem") pattern(t, top.pattern, w, T, top.trim || "#c9902a");
    // The belt (thắt lưng bao), tied in front with its ends hanging.
    const belt = outfit.belt;
    if (belt || top.cut === "tu_than") {
      const bc = (belt && belt.color) || (female ? "#3f8f5a" : "#6a3a22");
      el("rect", { x: f2(-w / 2 - 1), y: -12, width: f2(w + 6), height: 14, rx: 6, fill: S.mat(bc, true), ...OUT, "stroke-width": 2.5 }, t);
      if (!belt || belt.ends !== false) el("path", { d: `M ${f2(w * 0.3)} 0 q -6 22 -2 42 l 9 0 q -2 -20 4 -42 M ${f2(w * 0.42)} 0 q 4 18 10 34 l 8 -3 q -6 -16 -8 -31`, fill: S.mat(bc, true), ...OUT, "stroke-width": 2 }, t);
    }
  }

  /** Era headwear; false when the type is not one of these. */
  function headwear(S, h, type, cx, cy, R) {
    const black = "#1f1a18";
    switch (type) {
      case "khan_van": // a black cloth wound round the hair like a ring
        el("path", { d: `M ${f2(cx - R * 1.02)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 1.45)} ${f2(cx + R * 0.96)} ${f2(cy - R * 0.42)} L ${f2(cx + R * 0.86)} ${f2(cy - R * 0.08)} Q ${f2(cx)} ${f2(cy - R * 1.0)} ${f2(cx - R * 0.95)} ${f2(cy + R * 0.12)} Z`, fill: S.mat(black, true), ...OUT }, h);
        for (let i = 0; i < 3; i++) el("path", { d: `M ${f2(cx - R * 0.8)} ${f2(cy - R * (0.35 + i * 0.22))} Q ${f2(cx)} ${f2(cy - R * (1.0 + i * 0.12))} ${f2(cx + R * 0.75)} ${f2(cy - R * (0.5 + i * 0.12))}`, stroke: "#4a403a", "stroke-width": 2, fill: "none" }, h);
        return true;
      case "khan_mo_qua": // the "crow's beak" scarf: black, folded to a point over the forehead
        el("path", { d: `M ${f2(cx - R * 1.08)} ${f2(cy + R * 0.3)} Q ${f2(cx - R * 1.2)} ${f2(cy - R * 1.2)} ${f2(cx + R * 0.1)} ${f2(cy - R * 1.22)} L ${f2(cx + R * 1.25)} ${f2(cy - R * 0.85)} L ${f2(cx + R * 0.7)} ${f2(cy - R * 0.55)} Q ${f2(cx)} ${f2(cy - R * 0.8)} ${f2(cx - R * 0.55)} ${f2(cy - R * 0.4)} L ${f2(cx - R * 0.72)} ${f2(cy + R * 0.55)} Z`, fill: S.mat(black, true), ...OUT }, h);
        return true;
      case "khan_chit": // a plain cloth tied round a man's head, the knot at the back
        el("path", { d: `M ${f2(cx - R * 1.0)} ${f2(cy - R * 0.25)} Q ${f2(cx)} ${f2(cy - R * 0.85)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.5)} L ${f2(cx + R * 0.92)} ${f2(cy - R * 0.25)} Q ${f2(cx)} ${f2(cy - R * 0.6)} ${f2(cx - R * 0.98)} ${f2(cy + R * 0.02)} Z`, fill: S.mat("#5a4632", true), ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.98)} ${f2(cy - R * 0.1)} l ${f2(-R * 0.4)} ${f2(R * 0.3)} l ${f2(R * 0.1)} ${f2(R * 0.12)} Z`, fill: "#5a4632", ...OUT, "stroke-width": 2 }, h);
        return true;
      case "khan_xep": // the pleated, round headwrap of men in later times
        el("path", { d: `M ${f2(cx - R * 1.04)} ${f2(cy - R * 0.1)} Q ${f2(cx - R * 1.1)} ${f2(cy - R * 1.25)} ${f2(cx)} ${f2(cy - R * 1.3)} Q ${f2(cx + R * 1.05)} ${f2(cy - R * 1.2)} ${f2(cx + R * 0.98)} ${f2(cy - R * 0.35)} L ${f2(cx + R * 0.86)} ${f2(cy - R * 0.2)} Q ${f2(cx)} ${f2(cy - R * 0.75)} ${f2(cx - R * 0.95)} ${f2(cy + R * 0.12)} Z`, fill: S.mat(black, true), ...OUT }, h);
        for (let i = 0; i < 4; i++) el("path", { d: `M ${f2(cx - R * 0.95)} ${f2(cy - R * (0.15 + i * 0.27))} Q ${f2(cx)} ${f2(cy - R * (0.82 + i * 0.12))} ${f2(cx + R * 0.92)} ${f2(cy - R * (0.4 + i * 0.2))}`, stroke: "#4a403a", "stroke-width": 2, fill: "none" }, h);
        return true;
      case "non_quai_thao": { // a wide, flat palm-leaf hat with fringed straps
        el("path", { d: `M ${f2(cx - R * 2.2)} ${f2(cy - R * 0.75)} Q ${f2(cx)} ${f2(cy - R * 1.25)} ${f2(cx + R * 2.2)} ${f2(cy - R * 0.75)} Q ${f2(cx)} ${f2(cy - R * 0.45)} ${f2(cx - R * 2.2)} ${f2(cy - R * 0.75)} Z`, fill: S.mat("#e2c27a", true), ...OUT }, h);
        el("path", { d: `M ${f2(cx - R * 0.8)} ${f2(cy - R * 0.85)} Q ${f2(cx)} ${f2(cy - R * 1.35)} ${f2(cx + R * 0.8)} ${f2(cy - R * 0.85)}`, fill: "#d4b066", ...OUT, "stroke-width": 2.5 }, h);
        for (const s of [-1, 1]) el("path", { d: `M ${f2(cx + s * R * 0.7)} ${f2(cy - R * 0.7)} q ${f2(s * R * 0.1)} ${f2(R * 1.0)} 0 ${f2(R * 1.6)}`, stroke: "#2a2a2a", "stroke-width": 3, fill: "none", "stroke-dasharray": "3 3" }, h);
        return true;
      }
      case "non_chop": // the tall conical hat with a knob on top (soldiers, villagers)
        el("path", { d: `M ${f2(cx - R * 1.35)} ${f2(cy - R * 0.45)} L ${f2(cx + R * 0.05)} ${f2(cy - R * 2.1)} L ${f2(cx + R * 1.4)} ${f2(cy - R * 0.45)} Q ${f2(cx)} ${f2(cy - R * 0.25)} ${f2(cx - R * 1.35)} ${f2(cy - R * 0.45)} Z`, fill: S.mat("#b88a4a", true), ...OUT }, h);
        el("circle", { cx: f2(cx + R * 0.05), cy: f2(cy - R * 2.15), r: f2(R * 0.16), fill: "#8a5a2a", ...OUT, "stroke-width": 2 }, h);
        return true;
      case "mu_canh_chuon": // the official's hat with two wings behind
        el("path", { d: `M ${f2(cx - R * 1.0)} ${f2(cy - R * 0.25)} Q ${f2(cx - R * 1.05)} ${f2(cy - R * 1.45)} ${f2(cx)} ${f2(cy - R * 1.5)} Q ${f2(cx + R * 1.0)} ${f2(cy - R * 1.4)} ${f2(cx + R * 0.95)} ${f2(cy - R * 0.4)} Q ${f2(cx)} ${f2(cy - R * 0.75)} ${f2(cx - R * 1.0)} ${f2(cy - R * 0.25)} Z`, fill: S.mat(black, true), ...OUT }, h);
        el("ellipse", { cx: f2(cx - R * 1.35), cy: f2(cy - R * 0.95), rx: f2(R * 0.75), ry: f2(R * 0.28), fill: S.mat(black, true), ...OUT, "stroke-width": 2.5, transform: `rotate(-12 ${f2(cx - R * 1.35)} ${f2(cy - R * 0.95)})` }, h);
        el("path", { d: `M ${f2(cx - R * 0.6)} ${f2(cy - R * 1.2)} L ${f2(cx + R * 0.6)} ${f2(cy - R * 1.15)}`, stroke: "#c9a04a", "stroke-width": 3 }, h);
        return true;
      case "binh_thien": { // the king's crown: a flat board on top, strings of beads front and back
        el("path", { d: `M ${f2(cx - R * 0.95)} ${f2(cy - R * 0.35)} Q ${f2(cx - R * 1.0)} ${f2(cy - R * 1.35)} ${f2(cx)} ${f2(cy - R * 1.4)} Q ${f2(cx + R * 0.95)} ${f2(cy - R * 1.3)} ${f2(cx + R * 0.9)} ${f2(cy - R * 0.45)} Q ${f2(cx)} ${f2(cy - R * 0.75)} ${f2(cx - R * 0.95)} ${f2(cy - R * 0.35)} Z`, fill: S.mat(black, true), ...OUT }, h);
        el("rect", { x: f2(cx - R * 1.5), y: f2(cy - R * 1.62), width: f2(R * 3.0), height: f2(R * 0.22), rx: 3, fill: S.mat("#2a2a2a", true), ...OUT, "stroke-width": 2.5, transform: `rotate(-6 ${f2(cx)} ${f2(cy - R * 1.5)})` }, h);
        for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
          const x = cx + s * R * (1.1 + i * 0.1);
          el("path", { d: `M ${f2(x)} ${f2(cy - R * (1.45 + s * 0.1))} l 0 ${f2(R * 0.6)}`, stroke: "#c9a04a", "stroke-width": 2, "stroke-dasharray": "3 3" }, h);
        }
        el("circle", { cx: f2(cx), cy: f2(cy - R * 1.05), r: f2(R * 0.13), fill: "url(#gold)", ...OUT, "stroke-width": 1.5 }, h);
        return true;
      }
    }
    return false;
  }

  /** Extra height a hat adds above the head (camera framing). */
  const TALL = { non_chop: 1.6, binh_thien: 1.1, mu_canh_chuon: 0.9, khan_xep: 0.6, khan_mo_qua: 0.5, non_quai_thao: 0.5 };

  WA.garments = { resolve, sleeve, torso, headwear, TALL };
})();
