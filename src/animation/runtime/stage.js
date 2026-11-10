/*
 * The stage: one SVG with a sky for the time of day, parallax layers that all stand on the
 * same ground line, haze between far layers (aerial depth), and screen overlays (speed
 * lines, flash, vignette, colour grade). Materials give every part rounded shading.
 */
(function () {
  const { el, g, f2, tr, shade, clamp } = WA.core;

  /** Light of the scene by time of day: sky stops, sun, haze, hills, rim light and grade. */
  const PALETTES = {
    dawn: { sky: ["#36406e", "#a77796", "#f2a99a", "#fcd7b8", "#fde9cf"], sun: { y: 0.42, core: "#fff4dc", glow: "#ffc9a0", r: 60 }, haze: "#f5c2ae", far: ["#a58aa8", "#86708f"], far2: ["#8a7896", "#6c5d7c"], mid: ["#6f8064", "#56664c"], rim: "#ffd9c0", grade: "#ff9f8a", field: ["#9fb565", "#5d7836"], water: ["#f4c2b0", "#c99a9a"], stars: 0.2 },
    day: { sky: ["#3f86c8", "#6fb0e0", "#a9d6f0", "#d8eef8", "#eef8fb"], sun: { y: 0.18, core: "#fffbe8", glow: "#fff2c0", r: 54 }, haze: "#dcecf3", far: ["#93aac4", "#7d93ad"], far2: ["#7f9a9e", "#677f83"], mid: ["#6f9a5a", "#557c45"], rim: "#fff6dc", grade: "#ffe9b0", field: ["#a9c95f", "#5f8a34"], water: ["#bfe0f0", "#8fbcd4"], stars: 0 },
    dusk: { sky: ["#28305e", "#9b5a86", "#ef8a62", "#fbc78a", "#fde2ae"], sun: { y: 0.3, core: "#fff3cc", glow: "#ffe09a", r: 64 }, haze: "#f6b28a", far: ["#b27b9a", "#8d6a8e"], far2: ["#8d6f8f", "#6d5878"], mid: ["#6c7a5e", "#4f5f47"], rim: "#ffd08a", grade: "#ff9a5a", field: ["#a7b85c", "#58702f"], water: ["#f6b98e", "#c98a7a"], stars: 0.15 },
    night: { sky: ["#070b24", "#121a42", "#24305e", "#3a4677", "#4f5b8a"], sun: { y: 0.22, core: "#f4f1e0", glow: "#c8d4ff", r: 46, moon: true }, haze: "#4a5888", far: ["#3c4670", "#2e3658"], far2: ["#323c62", "#262d4c"], mid: ["#2e4236", "#22332a"], rim: "#b8c8ff", grade: "#5a6cff", field: ["#3f5a38", "#22341f"], water: ["#4a5888", "#2a3460"], stars: 1 },
  };

  /** Layers back to front, with how much each follows the camera (parallax). */
  const LAYERS = [["clouds", 0.04], ["far", 0.1], ["mid", 0.25], ["village", 0.55], ["ground", 1], ["back", 1], ["shadows", 1], ["actors", 1], ["fx", 1], ["front", 1.45]];
  const HAZE_AFTER = { far: 0.1, mid: 0.07, village: 0.04 };

  /**
   * How the light of the time of day falls on the characters: a colour they are tinted towards
   * (amt), their brightness, and how long their shadows reach (cast: low sun = long shadows).
   * side: where the light comes from on screen (+1 right, -1 left); a scene may override any of it.
   */
  const LIGHT = {
    dawn: { tint: "#ffc4a8", amt: 0.2, bright: 0.96, cast: 0.7 },
    day: { tint: "#fff2d8", amt: 0.05, bright: 1, cast: 0.18 },
    dusk: { tint: "#ffa860", amt: 0.3, bright: 0.88, cast: 0.8 },
    night: { tint: "#8da2ff", amt: 0.42, bright: 0.64, cast: 0.08 },
  };

  function createStage(parent, W, H, time = "day") {
    const P = PALETTES[time] || PALETTES.day;
    const svg = el("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` }, parent);
    const defs = el("defs", {}, svg);
    const S = { svg, defs, W, H, palette: P, time, layers: {}, materials: {}, ids: 0, hazeNodes: [], light: { side: 1, ...(LIGHT[time] || LIGHT.day) } };

    S.addDefs = (html) => defs.insertAdjacentHTML("beforeend", html);
    S.id = (prefix = "d") => `${prefix}${S.ids++}`;
    /** Rounded shading across a part (shadow side, base, warm rim) or down it (vertical). */
    S.mat = (hex, vertical = false) => {
      // Flat styles (woodblock prints, paper cut-outs) fill with plain colour, no gradient.
      if (S.flat) return hex;
      // While a character is built its materials are its own (matScope), so the lit side of
      // them can be turned to the light whichever way the character faces (player.js).
      const store = S.matScope ? S.matScope.mats : S.materials, key = hex + (vertical ? "v" : "h");
      if (store[key]) return store[key];
      const id = S.id("m"), rim = P.rim;
      S.addDefs(vertical
        ? `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${shade(hex, 0.22)}"/><stop offset="0.35" stop-color="${hex}"/><stop offset="1" stop-color="${shade(hex, -0.32)}"/></linearGradient>`
        : `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${shade(hex, -0.34)}"/><stop offset="0.5" stop-color="${hex}"/><stop offset="0.82" stop-color="${shade(hex, 0.14)}"/><stop offset="1" stop-color="${WA.core.mixColor(shade(hex, 0.3), rim, 0.35)}"/></linearGradient>`);
      if (S.matScope && !vertical) S.matScope.list.push(defs.lastElementChild);
      return (store[key] = `url(#${id})`);
    };
    /** A vertical two-colour gradient (hills, ground). */
    S.grad = (top, bottom, at = 0.6) => {
      const id = S.id("lg");
      S.addDefs(`<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${top}"/><stop offset="${at}" stop-color="${bottom}"/></linearGradient>`);
      return `url(#${id})`;
    };

    S.addDefs(`
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">${P.sky.map((c, i) => `<stop offset="${[0, 0.38, 0.66, 0.86, 1][i]}" stop-color="${c}"/>`).join("")}</linearGradient>
      <radialGradient id="sunGlow"><stop offset="0" stop-color="${P.sun.core}" stop-opacity="1"/><stop offset="0.18" stop-color="${P.sun.glow}" stop-opacity="0.7"/><stop offset="0.5" stop-color="${P.sun.glow}" stop-opacity="0.2"/><stop offset="1" stop-color="${P.sun.glow}" stop-opacity="0"/></radialGradient>
      <radialGradient id="aura"><stop offset="0" stop-color="#fffbe0" stop-opacity="1"/><stop offset="0.35" stop-color="#ffd25a" stop-opacity="0.6"/><stop offset="1" stop-color="#ff8a00" stop-opacity="0"/></radialGradient>
      <radialGradient id="flame" cx="0.25" cy="0.5" r="0.75"><stop offset="0" stop-color="#fff0a0"/><stop offset="0.22" stop-color="#ffc23a"/><stop offset="0.55" stop-color="#ff7a1a"/><stop offset="0.85" stop-color="#e0401a" stop-opacity="0.85"/><stop offset="1" stop-color="#b82a12" stop-opacity="0"/></radialGradient>
      <radialGradient id="ember"><stop offset="0" stop-color="#fff3b0"/><stop offset="0.5" stop-color="#ffb02e" stop-opacity="0.8"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></radialGradient>
      <radialGradient id="dust"><stop offset="0" stop-color="#efd2a2" stop-opacity="0.85"/><stop offset="1" stop-color="#e0b98a" stop-opacity="0"/></radialGradient>
      <radialGradient id="smoke"><stop offset="0" stop-color="#5a4a48" stop-opacity="0.6"/><stop offset="1" stop-color="#5a4a48" stop-opacity="0"/></radialGradient>
      <radialGradient id="shadow"><stop offset="0" stop-color="#1e1006" stop-opacity="0.45"/><stop offset="1" stop-color="#1e1006" stop-opacity="0"/></radialGradient>
      <radialGradient id="vignette" cx="0.5" cy="0.5" r="0.78"><stop offset="0.55" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#160804" stop-opacity="0.55"/></radialGradient>
      <linearGradient id="beam" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff5c8" stop-opacity="0.9"/><stop offset="1" stop-color="#ffd27a" stop-opacity="0"/></linearGradient>
      <linearGradient id="ray" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff1c4" stop-opacity="0.3"/><stop offset="1" stop-color="#fff1c4" stop-opacity="0"/></linearGradient>
      <linearGradient id="cape" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0453a"/><stop offset="0.6" stop-color="#b3261e"/><stop offset="1" stop-color="#6e130f"/></linearGradient>
      <linearGradient id="iron" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#93a0b2"/><stop offset="0.35" stop-color="#66727f"/><stop offset="1" stop-color="#323943"/></linearGradient>
      <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="0.5" stop-color="#e8b93a"/><stop offset="1" stop-color="#a87a1a"/></linearGradient>
      <filter id="blur3" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="2.5"/></filter>
      <filter id="soft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="14"/></filter>
    `);
    S.field = S.grad(P.field[0], P.field[1], 1);
    S.water = S.grad(P.water[0], P.water[1], 1);

    el("rect", { width: W, height: H, fill: "url(#sky)" }, svg);
    S.starsNode = g(svg, { opacity: P.stars });
    const R = WA.core.rand(77);
    for (let i = 0; i < 120 * P.stars; i++) el("circle", { cx: f2(R() * W), cy: f2(R() * H * 0.55), r: f2(0.8 + R() * 1.8), fill: "#fff8e0", opacity: f2(0.4 + R() * 0.6) }, S.starsNode);
    S.sun = g(svg);
    el("circle", { r: P.sun.r * 6, fill: "url(#sunGlow)" }, S.sun);
    el("circle", { r: P.sun.r, fill: P.sun.core }, S.sun);
    if (P.sun.moon) for (const [x, y, r] of [[-12, -8, 9], [10, 6, 6], [-4, 16, 5]]) el("circle", { cx: x, cy: y, r, fill: "#d8d4c4", opacity: 0.7 }, S.sun); // a full moon with its seas
    S.sunRays = g(S.sun, { style: "mix-blend-mode: screen" });
    if (!P.sun.moon) for (let i = 0; i < 9; i++) el("path", { d: "M -14 0 L 14 0 L 120 1100 L -120 1100 Z", fill: "url(#ray)", transform: `rotate(${-60 + i * 15})` }, S.sunRays);

    // A painted backdrop (optional) sits between the sky and the vector layers.
    S.backdropNode = g(svg);
    for (const [name, f] of LAYERS) {
      S.layers[name] = { f, node: g(svg) };
      if (HAZE_AFTER[name]) S.hazeNodes.push(el("rect", { width: W, height: H, fill: P.haze, opacity: HAZE_AFTER[name] }, svg));
    }
    S.layers.front.node.setAttribute("filter", "url(#blur3)");
    S.screen = g(svg, { style: "mix-blend-mode: screen" });
    S.flash = el("rect", { width: W, height: H, fill: "#fff6d8", opacity: 0 }, svg);
    el("rect", { width: W, height: H, fill: "url(#vignette)" }, svg);
    S.grade = el("rect", { width: W, height: H, fill: P.grade, opacity: 0.06, style: "mix-blend-mode: soft-light" }, svg);
    S.black = el("rect", { width: W, height: H, fill: "#000", opacity: 0 }, svg);
    S.layer = (name) => S.layers[name].node;

    /**
     * A painting of sky and far land behind everything (see backdrops.ts). Tiled as mirror
     * images so a long tracking shot never runs off its edge; its lower part goes behind the
     * vector ground, so the painted fields meet the road. Resolves once the image is loaded.
     */
    S.setBackdrop = (href, size = [768, 448]) => {
      S.backdrop = { href, w: size[0], h: size[1], tiles: [] };
      S.backdropNode.setAttribute("filter", "");
      // The model's pictures often have a stray line of pixels at the edge, which mirroring
      // doubles into a visible seam: each tile is drawn a little larger and clipped to size.
      const cid = S.id("bdclip");
      // Neighbouring (mirrored) tiles also overlap by 2 units, so no hairline of the sky shows
      // between them at small frame sizes, where 0.4 unit is under half a pixel.
      el("rect", { x: -2, y: 0, width: size[0] + 4, height: size[1] }, el("clipPath", { id: cid }, defs));
      for (let i = -3; i <= 3; i++) {
        const t = g(S.backdropNode, { "clip-path": `url(#${cid})` });
        el("image", { href, x: -4, y: -3, width: size[0] + 8, height: size[1] + 6, preserveAspectRatio: "none" }, t);
        S.backdrop.tiles.push({ node: t, i });
      }
      // The vector sky elements the painting replaces.
      for (const name of ["clouds", "far", "mid"]) S.layers[name].node.setAttribute("display", "none");
      S.sun.setAttribute("display", "none");
      S.starsNode.setAttribute("display", "none");
      S.hazeNodes.forEach((n) => n.setAttribute("display", "none"));
      const img = new Image();
      img.src = href;
      return img.decode().catch(() => undefined);
    };
    S.backdropBlur = el("filter", { id: "bdblur", x: "-5%", y: "-5%", width: "110%", height: "110%" }, defs);
    S.backdropBlurAmt = el("feGaussianBlur", { stdDeviation: 0 }, S.backdropBlur);
    S.swaying = [];
    S.drifting = [];

    /**
     * Camera {x, y, z}: world point at the frame centre and zoom. Every layer keeps the
     * same ground line on screen; far layers zoom and pan less. shake: [dx, dy] in pixels.
     */
    S.setCamera = (cam, t, shake = [0, 0]) => {
      const groundLine = H / 2 - cam.y * cam.z;
      for (const name in S.layers) {
        const { f, node } = S.layers[name];
        const z = Math.pow(cam.z, Math.min(1, f));
        node.setAttribute("transform", `translate(${f2(W / 2 + shake[0])},${f2(groundLine + shake[1])}) scale(${z.toFixed(4)}) translate(${f2(-cam.x * f)},0)`);
      }
      tr(S.sun, W * 0.7 - cam.x * 0.015, groundLine - H * (0.8 - P.sun.y), 0);
      tr(S.sunRays, 0, 0, 3 * Math.sin(t * 0.4));
      for (const s of S.swaying) s.node.setAttribute("transform", `translate(${s.x},0) rotate(${f2(s.amp * Math.sin(t * 1.7 + s.phase))})`);
      for (const d of S.drifting) tr(d.node, d.x + t * d.v, d.y, 0);
      S.groundLine = groundLine;
      if (S.backdrop) {
        // Cover the frame above the ground (and a little below it), however tall the frame.
        const B = S.backdrop, zb = Math.pow(cam.z, 0.1);
        // The painting reaches the bottom of the frame: its foreground fields lie around the road.
        const bottom = Math.max(H * 1.02, groundLine + H * 0.08);
        const scale = Math.max((W * 1.25) / B.w, bottom / (B.h * 0.97)) * zb;
        const w = B.w * scale, h = B.h * scale;
        const top = bottom - h;
        const x0 = W / 2 - w / 2 - cam.x * 0.12 * zb + shake[0] * 0.3;
        for (const { node, i } of B.tiles) {
          const x = x0 + i * w;
          // Odd tiles are mirrored, so neighbours meet seamlessly.
          node.setAttribute("transform", i % 2 ? `translate(${f2(x + w)},${f2(top + shake[1] * 0.3)}) scale(${f2(-scale)},${f2(scale)})` : `translate(${f2(x)},${f2(top + shake[1] * 0.3)}) scale(${f2(scale)})`);
        }
        // Close-ups throw the far land out of focus.
        const blur = Math.max(0, Math.min(6, (cam.z - 0.9) * 4));
        S.backdropBlurAmt.setAttribute("stdDeviation", f2(blur));
        S.backdropNode.setAttribute("filter", blur > 0.2 ? "url(#bdblur)" : "");
      }
    };
    /** Screen position of a world point (actors layer). */
    S.toScreen = (cam, x, y) => [W / 2 + (x - cam.x) * cam.z, H / 2 + (y - cam.y) * cam.z];
    return S;
  }

  WA.stage = { createStage, PALETTES };
})();
