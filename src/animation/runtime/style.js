/*
 * Drawing styles (library/styles.json): the same vector cartoon dressed as a Đông Hồ print,
 * a lacquer painting, a silk painting, a watercolour, a crayon drawing or a paper cut-out.
 * Shapes and motion stay; what changes is the outline (colour, weight), the colour grade,
 * flat colour (posterize), hand-drawn wobble, paper-layer shadows and a material texture laid
 * over the whole frame (paper fibres, silk weave, lacquer crackle…), all drawn in code.
 *
 *   WA.style.apply(S, look)   once the stage, set and actors are built
 *   S.styleTick(t)            every frame (the wobble "boils" a few times a second)
 */
(function () {
  const { el, g, f2, rand } = WA.core;

  const dark = (hex) => {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return false;
    const n = parseInt(hex.slice(1), 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
    return 0.2126 * r + 0.7152 * gg + 0.0722 * b < 52;
  };

  /** A canvas the size of the frame, drawn by fn, as an image URL. */
  function paint(W, H, fn, type = "image/jpeg") {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const x = c.getContext("2d");
    fn(x, W, H);
    return c.toDataURL(type, 0.9);
  }

  /** Grey noise around a level, per pixel (grain), or in clumps of `cell` pixels. */
  function noise(x, W, H, R, base, spread, alpha = 255, cell = 1) {
    const img = x.getImageData(0, 0, W, H), d = img.data;
    for (let py = 0; py < H; py += cell) for (let px = 0; px < W; px += cell) {
      const v = base + (R() - 0.5) * spread;
      for (let yy = py; yy < Math.min(H, py + cell); yy++) for (let xx = px; xx < Math.min(W, px + cell); xx++) {
        const i = (yy * W + xx) * 4;
        d[i] = (d[i] * (255 - alpha) + v * alpha) / 255; d[i + 1] = (d[i + 1] * (255 - alpha) + v * alpha) / 255; d[i + 2] = (d[i + 2] * (255 - alpha) + v * alpha) / 255; d[i + 3] = 255;
      }
    }
    x.putImageData(img, 0, 0);
  }

  /** Soft cloudy stains: a coarse random grid, smoothly enlarged to the frame. */
  function clouds(x, W, H, R, cells, rgb, alpha) {
    const c = document.createElement("canvas"), h = Math.max(2, Math.round((cells * H) / W));
    c.width = cells; c.height = h;
    const cx = c.getContext("2d");
    for (let j = 0; j < h; j++) for (let i = 0; i < cells; i++) { cx.fillStyle = `rgba(${rgb},${(R() * alpha).toFixed(3)})`; cx.fillRect(i, j, 1, 1); }
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = "high";
    x.drawImage(c, 0, 0, W, H);
  }

  /** Material textures, multiplied (or screened) over the frame. */
  const TEXTURES = {
    // Giấy dó: warm handmade paper with long fibres.
    paper(x, W, H, R) {
      x.fillStyle = "#f4e7c9"; x.fillRect(0, 0, W, H);
      noise(x, W, H, R, 236, 26, 70);
      x.lineCap = "round";
      for (let i = 0; i < 2600; i++) {
        const px = R() * W, py = R() * H, l = 10 + R() * 60, a = R() * Math.PI;
        x.strokeStyle = `rgba(${120 + R() * 40},${90 + R() * 30},${50 + R() * 20},${0.08 + R() * 0.16})`;
        x.lineWidth = 0.6 + R() * 1.2;
        x.beginPath(); x.moveTo(px, py);
        x.quadraticCurveTo(px + Math.cos(a) * l * 0.5 + (R() - 0.5) * 12, py + Math.sin(a) * l * 0.5 + (R() - 0.5) * 12, px + Math.cos(a) * l, py + Math.sin(a) * l);
        x.stroke();
      }
    },
    // Điệp: the seashell coat of Đông Hồ paper, tiny sparkles (screened, black elsewhere).
    flecks(x, W, H, R) {
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 9000; i++) {
        x.fillStyle = `rgba(255,${240 + R() * 15},${220 + R() * 30},${0.25 + R() * 0.6})`;
        const s = 0.6 + R() * 1.8;
        x.fillRect(R() * W, R() * H, s, s * (0.5 + R()));
      }
    },
    // Lụa: a fine weave, threads a little uneven, with soft stains of age.
    silk(x, W, H, R) {
      x.fillStyle = "#efe3c8"; x.fillRect(0, 0, W, H);
      clouds(x, W, H, R, 16, "180,150,100", 0.2);
      for (let y = 0; y < H; y += 2) { x.fillStyle = `rgba(150,125,85,${0.05 + R() * 0.07})`; x.fillRect(0, y, W, 1); }
      for (let xx = 0; xx < W; xx += 2) { x.fillStyle = `rgba(255,250,235,${0.04 + R() * 0.06})`; x.fillRect(xx, 0, 1, H); }
    },
    // Sơn mài: crackle of the lacquer and of crushed eggshell, and a glossy sheen.
    lacquer(x, W, H, R) {
      x.fillStyle = "#fff"; x.fillRect(0, 0, W, H);
      x.strokeStyle = "rgba(40,20,8,0.35)";
      for (let i = 0; i < 700; i++) {
        let px = R() * W, py = R() * H;
        x.lineWidth = 0.5 + R() * 0.9;
        x.beginPath(); x.moveTo(px, py);
        for (let k = 0; k < 4; k++) { px += (R() - 0.5) * 50; py += (R() - 0.5) * 50; x.lineTo(px, py); }
        x.stroke();
      }
      noise(x, W, H, R, 242, 18, 60);
    },
    // Eggshell chips (screened) and the light band of a polished panel.
    sheen(x, W, H, R) {
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      const gr = x.createLinearGradient(0, 0, W, H);
      gr.addColorStop(0.25, "rgba(255,230,180,0)"); gr.addColorStop(0.42, "rgba(255,230,180,0.22)"); gr.addColorStop(0.5, "rgba(255,240,210,0.3)"); gr.addColorStop(0.6, "rgba(255,230,180,0)");
      x.fillStyle = gr; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) {
        const cx = R() < 0.5 ? R() * W * 0.18 : W - R() * W * 0.18, cy = R() * H, s = 3 + R() * 9;
        x.fillStyle = `rgba(255,245,225,${0.25 + R() * 0.4})`;
        x.beginPath(); x.moveTo(cx, cy);
        for (let k = 1; k < 5; k++) x.lineTo(cx + Math.cos(k * 1.4 + R()) * s, cy + Math.sin(k * 1.4 + R()) * s);
        x.closePath(); x.fill();
      }
    },
    // Màu nước: cold-press paper grain and the soft blooms where washes dried unevenly.
    watercolor(x, W, H, R) {
      x.fillStyle = "#fbf7ee"; x.fillRect(0, 0, W, H);
      clouds(x, W, H, R, 22, "120,110,100", 0.16);
      clouds(x, W, H, R, 60, "130,120,110", 0.08);
      noise(x, W, H, R, 240, 34, 80, 2);
    },
    // Sáp màu: the paper's tooth showing white through the wax (screened).
    crayon(x, W, H, R) {
      x.fillStyle = "#000"; x.fillRect(0, 0, W, H);
      for (let i = 0; i < 26000; i++) {
        const px = R() * W, py = R() * H, l = 3 + R() * 9;
        x.strokeStyle = `rgba(255,255,250,${0.15 + R() * 0.45})`;
        x.lineWidth = 0.7 + R() * 1.1;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + l * 0.8, py - l * 0.5); x.stroke();
      }
    },
    // Giấy thủ công: a smooth card with faint fibres.
    cutpaper(x, W, H, R) {
      x.fillStyle = "#f7f0e2"; x.fillRect(0, 0, W, H);
      noise(x, W, H, R, 244, 16, 80);
      for (let i = 0; i < 900; i++) {
        x.strokeStyle = `rgba(140,120,90,${0.05 + R() * 0.08})`;
        x.lineWidth = 0.5 + R() * 0.6;
        const px = R() * W, py = R() * H, a = R() * Math.PI, l = 8 + R() * 30;
        x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
      }
    },
  };
  /** How each texture is laid over the frame. */
  const BLEND = { paper: "multiply", silk: "multiply", lacquer: "multiply", watercolor: "multiply", cutpaper: "multiply", flecks: "screen", sheen: "screen", crayon: "screen" };

  function apply(S, look) {
    if (!look || !Object.keys(look).length) { S.styleTick = () => {}; return; }
    const { svg, W, H } = S, R = rand(4242);

    // Outlines: every dark stroke takes the style's ink and weight.
    if (look.ink || look.line) {
      for (const n of svg.querySelectorAll("[stroke]")) {
        if (!dark(n.getAttribute("stroke"))) continue;
        if (look.ink) n.setAttribute("stroke", look.ink);
        const w = parseFloat(n.getAttribute("stroke-width"));
        if (look.line && Number.isFinite(w)) n.setAttribute("stroke-width", f2(w * look.line));
      }
    }

    // Everything but the fade to black goes into one group, so the grade covers the picture.
    const world = el("g", {}, svg);
    for (const n of [...svg.childNodes]) if (n !== world && n !== S.black && n.tagName !== "defs") world.appendChild(n);
    svg.appendChild(S.black);

    // The vector layers (from the village forward) get the drawing effects; the painting
    // behind them is already painted in the style.
    const vec = el("g", {}, world);
    world.insertBefore(vec, S.layers.village.node);
    let n = S.layers.village.node;
    while (n && n !== S.screen) { const next = n.nextSibling; vec.appendChild(n); n = next; }

    let fx = "", src = "SourceGraphic";
    if (look.posterize) {
      const k = look.posterize, steps = Array.from({ length: k }, (_, i) => f2(i / (k - 1))).join(" ");
      fx += `<feComponentTransfer in="${src}" result="flat"><feFuncR type="discrete" tableValues="${steps}"/><feFuncG type="discrete" tableValues="${steps}"/><feFuncB type="discrete" tableValues="${steps}"/></feComponentTransfer>`;
      src = "flat";
    }
    if (look.wobble) {
      const w = look.wobble;
      fx += `<feTurbulence type="fractalNoise" baseFrequency="${w.freq ?? 0.03}" numOctaves="2" seed="1" result="noise"/><feDisplacementMap in="${src}" in2="noise" scale="${w.scale ?? 4}" xChannelSelector="R" yChannelSelector="G" result="wob"/>`;
      src = "wob";
    }
    if (look.shadow) {
      const s = look.shadow;
      fx += `<feDropShadow in="${src}" dx="${s.dx ?? 5}" dy="${s.dy ?? 7}" stdDeviation="${s.blur ?? 4}" flood-color="${s.color ?? "#2a1a0a"}" flood-opacity="${s.opacity ?? 0.35}" result="shad"/>`;
      src = "shad";
    }
    if (fx) {
      const id = S.id("style");
      S.addDefs(`<filter id="${id}" filterUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}" color-interpolation-filters="sRGB">${fx}</filter>`);
      vec.setAttribute("filter", `url(#${id})`);
    }

    // Colour grade on the whole picture (a CSS filter: cheap, done by the compositor).
    const css = [];
    if (look.saturate !== undefined) css.push(`saturate(${look.saturate})`);
    if (look.brightness !== undefined) css.push(`brightness(${look.brightness})`);
    if (look.contrast !== undefined) css.push(`contrast(${look.contrast})`);
    if (look.sepia) css.push(`sepia(${look.sepia})`);
    if (css.length) world.setAttribute("style", `filter: ${css.join(" ")}`);

    // Over the picture: a colour wash, the material, a vignette.
    const over = g(svg);
    svg.insertBefore(over, S.black);
    if (look.tint) el("rect", { width: W, height: H, fill: look.tint, opacity: look.tintAmt ?? 0.25, style: `mix-blend-mode: ${look.tintMode ?? "multiply"}` }, over);
    const textures = [].concat(look.texture || []);
    if (look.flecks) textures.push("flecks");
    if (look.sheen) textures.push("sheen");
    for (const t of textures) {
      if (!TEXTURES[t]) continue;
      const amt = t === "flecks" ? look.flecks : t === "sheen" ? look.sheen : look.textureAmt ?? 0.7;
      el("image", { href: paint(W, H, (x, w, h) => TEXTURES[t](x, w, h, R)), width: W, height: H, preserveAspectRatio: "none", opacity: amt, style: `mix-blend-mode: ${BLEND[t]}` }, over);
    }
    if (look.vignette) {
      const vid = S.id("svig");
      S.addDefs(`<radialGradient id="${vid}" cx="0.5" cy="0.5" r="0.75"><stop offset="0.5" stop-color="${look.vignetteColor ?? "#1a0a04"}" stop-opacity="0"/><stop offset="1" stop-color="${look.vignetteColor ?? "#1a0a04"}" stop-opacity="${look.vignette}"/></radialGradient>`);
      el("rect", { width: W, height: H, fill: `url(#${vid})` }, over);
    }

    // The wobble boils: a new noise a few times a second, like redrawn frames.
    const turb = svg.querySelector("feTurbulence");
    const boil = look.wobble?.boil;
    S.styleTick = (t) => { if (turb && boil) turb.setAttribute("seed", String(1 + Math.floor(t * boil) % 7)); };
  }

  WA.style = { apply };
})();
