/*
 * Effects, all stateless: every particle has a fixed birth time and its whole life is a
 * formula, so any frame can be drawn on its own. Effects that follow a character ask the
 * player where it was at the particle's birth (ctx.pointsAt(id, time)).
 *
 *   { fx: "transform", on, at, dur }        aura, rotating beams, spiralling sparks, shockwave
 *   { fx: "fire", from, at, dur, power, up } flames out of a horse's mouth (up: tilt skywards)
 *   { fx: "dust", on, at, dur, rate }        dust kicked up by feet or hooves
 *   { fx: "impact", on, at }                 a ring and a puff of dust where something lands
 *   { fx: "smoke", x, at, dur }              a column of battle smoke
 *   { fx: "embers", x, at, dur }             sparks drifting up
 *   { fx: "sparkle", on, at, dur }           golden sparkles around someone (magic, a blessing)
 *   { fx: "glow", on, at, dur }              a soft halo that swells and fades
 *   { fx: "rays", x, at, dur }               light falling from the sky in shafts
 *   { fx: "pop", on, at }                    bits bursting off (threads of a shirt too small)
 *   { fx: "flash", at, power } · { fx: "shake", at, power, dur } · { fx: "speedlines", at, dur }
 */
(function () {
  const { rand, hash, seg, bump, smooth, EASE, f2, lerp, clamp } = WA.core;

  function render(S, list, t, ctx) {
    let html = "", screen = "", flash = 0, shakeAmp = 0;
    const W = S.W, H = S.H;
    list.forEach((e, idx) => {
      const seed = hash(`${idx}|${e.fx}|${e.at}`);
      const end = e.at + (e.dur ?? 1);
      if (t < e.at - 0.5 || t > end + 2) return;
      switch (e.fx) {
        case "transform": {
          const p = ctx.pointsAt(e.on, t), cy = (p.hips[1] + p.top) / 2, cx = p.hips[0];
          const dur = e.dur ?? 1.3, ga = seg(t, e.at - 0.2, e.at + dur + 0.5);
          const glow = Math.sin(Math.PI * ga);
          html += `<circle class="glow" cx="${f2(cx)}" cy="${f2(cy)}" r="${f2(250 + 1000 * ga)}" fill="url(#aura)" opacity="${f2(glow * 0.95)}"/>`;
          const beams = Math.sin(Math.PI * seg(t, e.at - 0.05, e.at + dur - 0.05)) * 0.8;
          if (beams > 0) {
            let b = "";
            for (let i = 0; i < 14; i++) b += `<path d="M 0 -18 L 1800 -70 L 1800 70 L 0 18 Z" fill="url(#beam)" transform="rotate(${f2(i * (360 / 14) + t * 25)})"/>`;
            html += `<g class="glow" opacity="${f2(beams)}" transform="translate(${f2(cx)},${f2(cy)}) scale(${f2(0.4 + ga * 1.2)})">${b}</g>`;
          }
          const ra = seg(t, e.at + 0.27, e.at + 1.35);
          if (ra > 0 && ra < 1) html += `<ellipse cx="${f2(cx)}" cy="4" rx="${f2(120 + 2200 * EASE.out(ra))}" ry="${f2(18 + 180 * EASE.out(ra))}" fill="none" stroke="#fbe3ad" stroke-width="22" opacity="${f2(0.85 * (1 - ra))}"/>`;
          for (let i = 0; i < 90; i++) {
            const r = rand(seed + i), born = e.at - 0.35 + r() * 1.6, age = t - born, life = 1.3;
            if (age < 0 || age > life) continue;
            const k = age / life, inward = born < e.at + 0.2, a = r() * Math.PI * 2 + (inward ? k * 2.5 : 0);
            const d = inward ? lerp(700 + r() * 500, 60, EASE.in(k)) : 100 + EASE.out(k) * (900 + r() * 900);
            html += `<circle class="glow" cx="${f2(cx + Math.cos(a) * d)}" cy="${f2(cy + Math.sin(a) * d * 0.8)}" r="${f2(14 * (1 - k) + 4)}" fill="url(#ember)" opacity="${f2(1 - k)}"/>`;
          }
          const hit = t > e.at + 0.27 ? Math.exp(-(t - e.at - 0.27) * 5.5) : 0;
          flash = Math.max(flash, 0.55 * hit);
          shakeAmp = Math.max(shakeAmp, hit);
          break;
        }
        case "fire": {
          const dur = e.dur ?? 0.4, power = e.power ?? 1, n = e.n ?? Math.round(110 * dur + 20);
          for (let i = 0; i < n; i++) {
            const r = rand(seed + i), born = e.at + r() * dur, age = t - born, life = 0.65 + r() * 0.3;
            if (age < 0 || age > life) continue;
            const m = ctx.pointsAt(e.from, born), now = ctx.pointsAt(e.from, t), k = age / life;
            // `up` (radians) tilts the jet towards the sky, whichever way the horse faces.
            const toSky = Math.cos(m.mouthAngle) >= 0 ? -1 : 1;
            const v = (1100 + r() * 700) * power, ang = m.mouthAngle + toSky * (e.up ?? 0) + 0.28 * Math.cos(m.mouthAngle) + (r() - 0.5) * 0.35;
            const x = m.mouth[0] + Math.cos(ang) * v * age + (now.feet[0] - m.feet[0]) * 0.75, y = m.mouth[1] + Math.sin(ang) * v * age * 0.8 - age * age * 420;
            const s = (0.5 + k * 2.4) * (0.8 + r() * 0.5) * power;
            html += `<path d="M 0 0 C 30 -26 90 -20 140 0 C 90 20 30 26 0 0 Z" fill="url(#flame)" opacity="${f2(Math.min(1, 1.6 * (1 - k)))}" transform="translate(${f2(x)},${f2(y)}) rotate(${f2((ang * 180) / Math.PI + (r() - 0.5) * 30)}) scale(${f2(s)})"/>`;
          }
          break;
        }
        case "dust": {
          const dur = e.dur ?? 1, rate = e.rate ?? 30, n = Math.round(rate * dur);
          for (let i = 0; i < n; i++) {
            const r = rand(seed + i), born = e.at + (i / n) * dur, age = t - born, life = 1.3;
            if (age < 0 || age > life) continue;
            const p = ctx.pointsAt(e.on, born), k = age / life, feet = p.hooves || [p.feet];
            const src = feet[Math.floor(r() * feet.length)], back = -(p.facing ?? 1), sz = e.size ?? (p.height / 400);
            const x = src[0] + back * age * (300 + r() * 200) * sz, y = -age * (160 + r() * 200) * sz - 10;
            html += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2((50 + k * 170) * sz)}" fill="url(#dust)" opacity="${f2(0.75 * (1 - k))}"/>`;
          }
          break;
        }
        case "impact": {
          const p = ctx.pointsAt(e.on, e.at), ra = seg(t, e.at, e.at + 0.7), sz = p.height / 400;
          if (ra > 0 && ra < 1) html += `<ellipse cx="${f2(p.feet[0])}" cy="4" rx="${f2((80 + 700 * EASE.out(ra)) * sz)}" ry="${f2((12 + 60 * EASE.out(ra)) * sz)}" fill="none" stroke="#f1d6a8" stroke-width="${f2(14 * sz)}" opacity="${f2(0.8 * (1 - ra))}"/>`;
          for (let i = 0; i < 16; i++) {
            const r = rand(seed + i), age = t - e.at, k = age / 0.9;
            if (age < 0 || k > 1) continue;
            const a = Math.PI + r() * Math.PI, d = EASE.out(k) * (200 + r() * 300) * sz;
            html += `<circle cx="${f2(p.feet[0] + Math.cos(a) * d * 1.6)}" cy="${f2(Math.sin(a) * d * 0.5)}" r="${f2((40 + k * 90) * sz)}" fill="url(#dust)" opacity="${f2(0.8 * (1 - k))}"/>`;
          }
          shakeAmp = Math.max(shakeAmp, (e.power ?? 0.4) * (t > e.at ? Math.exp(-(t - e.at) * 8) : 0));
          break;
        }
        case "smoke": {
          const dur = e.dur ?? 3;
          for (let i = 0; i < 40; i++) {
            const r = rand(seed + i), born = e.at + (i / 40) * dur, age = t - born, life = 3;
            if (age < 0 || age > life) continue;
            const k = age / life;
            html += `<circle cx="${f2(e.x + (r() - 0.5) * 200 + age * 60)}" cy="${f2(-age * 420 - 40)}" r="${f2(80 + k * 320)}" fill="url(#smoke)" opacity="${f2(0.7 * bump(k, 0, 1))}"/>`;
          }
          break;
        }
        case "embers": {
          const dur = e.dur ?? 3;
          for (let i = 0; i < 50; i++) {
            const r = rand(seed + i), born = e.at + r() * dur, age = t - born, life = 2;
            if (age < 0 || age > life) continue;
            const k = age / life;
            html += `<circle class="glow" cx="${f2((e.x ?? 0) + (r() - 0.5) * (e.width ?? 1600) + Math.sin(age * 3 + i) * 40)}" cy="${f2(-age * 500 - r() * 200)}" r="${f2(6 + 6 * r())}" fill="url(#ember)" opacity="${f2(bump(k, 0, 1))}"/>`;
          }
          break;
        }
        case "sparkle": {
          const dur = e.dur ?? 1.5;
          for (let i = 0; i < 60; i++) {
            const r = rand(seed + i), born = e.at + r() * dur, age = t - born, life = 0.9;
            if (age < 0 || age > life) continue;
            const p = ctx.pointsAt(e.on, t), k = age / life, a = r() * Math.PI * 2, d = (40 + r() * 1.1 * p.height * 0.5);
            const x = p.hips[0] + Math.cos(a) * d * 0.8, y = (p.hips[1] + p.feet[1]) / 2 - p.height * 0.2 + Math.sin(a) * d - age * 120;
            const sz = (6 + 10 * r()) * (1 - k) * Math.max(0.6, p.height / 400);
            html += `<path class="glow" d="M 0 ${f2(-sz * 2)} L ${f2(sz * 0.4)} ${f2(-sz * 0.4)} L ${f2(sz * 2)} 0 L ${f2(sz * 0.4)} ${f2(sz * 0.4)} L 0 ${f2(sz * 2)} L ${f2(-sz * 0.4)} ${f2(sz * 0.4)} L ${f2(-sz * 2)} 0 L ${f2(-sz * 0.4)} ${f2(-sz * 0.4)} Z" fill="#fff2b0" opacity="${f2(1 - k)}" transform="translate(${f2(x)},${f2(y)})"/>`;
          }
          break;
        }
        case "glow": {
          const p = ctx.pointsAt(e.on, t), k = seg(t, e.at, end), o = Math.sin(Math.PI * k);
          if (o > 0) html += `<circle class="glow" cx="${f2(p.hips[0])}" cy="${f2((p.hips[1] + p.top) / 2)}" r="${f2(p.height * (0.6 + 0.5 * k))}" fill="url(#aura)" opacity="${f2(o * (e.power ?? 0.8))}"/>`;
          break;
        }
        case "rays": {
          const k = Math.sin(Math.PI * seg(t, e.at, end));
          if (k <= 0) break;
          let r2 = "";
          for (let i = 0; i < 7; i++) r2 += `<path d="M ${-60 + i * 20} -3000 L ${60 + i * 20} -3000 L ${380 - i * 110 + Math.sin(t + i) * 30} 40 L ${120 - i * 110 + Math.sin(t + i) * 30} 40 Z" fill="url(#ray)" opacity="${f2(0.9)}"/>`;
          html += `<g class="glow" opacity="${f2(k)}" transform="translate(${f2(e.x ?? 0)},0) scale(${f2(e.scale ?? 2)})">${r2}</g>`;
          break;
        }
        case "pop": {
          const p = ctx.pointsAt(e.on, e.at);
          for (let i = 0; i < 18; i++) {
            const r = rand(seed + i), age = t - e.at, k = age / 0.8;
            if (age < 0 || k > 1) continue;
            const a = -Math.PI * (0.1 + 0.8 * r()), v = (500 + r() * 600) * Math.max(0.5, p.height / 400);
            const x = p.hips[0] + Math.cos(a) * v * age, y = p.hips[1] - p.height * 0.25 + Math.sin(a) * v * age + 900 * age * age;
            html += `<circle cx="${f2(x)}" cy="${f2(y)}" r="${f2(5 + 4 * r())}" fill="${i % 3 ? "#f1d08a" : "#c06a2c"}" stroke="#24150c" stroke-width="2" opacity="${f2(1 - k * 0.5)}"/>`;
          }
          break;
        }
        case "flash":
          flash = Math.max(flash, (e.power ?? 0.6) * (t > e.at ? Math.exp(-(t - e.at) * 5.5) : 0));
          break;
        case "shake":
          shakeAmp = Math.max(shakeAmp, (e.power ?? 0.5) * (t > e.at && t < end ? Math.exp(-(t - e.at) * (3 / (e.dur ?? 1))) : 0));
          break;
        case "speedlines": {
          const k = smooth(seg(t, e.at, e.at + 0.5)) * (1 - smooth(seg(t, end - 0.3, end)));
          if (k <= 0) break;
          for (let i = 0; i < 26; i++) {
            const r = rand(seed + i), y = 120 + r() * (H - 240), len = 200 + r() * 500, sp = 2600 + r() * 1400;
            const x = W + 200 - ((t * sp + r() * 4000) % (W + 1400));
            screen += `<rect x="${f2(x)}" y="${f2(y)}" width="${f2(len)}" height="${f2(2 + r() * 3)}" rx="2" fill="#fff3da" opacity="${f2(k * (0.15 + r() * 0.25))}"/>`;
          }
          break;
        }
      }
    });
    S.layer("fx").innerHTML = html;
    S.screen.innerHTML = screen;
    S.flash.setAttribute("opacity", f2(clamp(flash)));
    return [shakeAmp * 18 * Math.sin(t * 93), shakeAmp * 12 * Math.cos(t * 71)];
  }

  WA.fx = { render };
})();
