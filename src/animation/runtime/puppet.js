/*
 * Hand-painted paper puppets: a person painted by the image model (three-quarter view, facing
 * right), cut into pieces (puppet/cut.py) and moved by the same poses as the vector people
 * (WA.motions → WA.human's pose: legF/legB/armF/armB [joint, bend], lean, headTilt, dy, …).
 * The far arm and leg are the near ones again, a shade darker, a little behind.
 *
 *   look.puppet = {
 *     dir: "file:///…/",  size: [w, h],
 *     parts: { body, head, upper, fore, thigh, shin, mouth, eyes }  (file names; missing → none)
 *     j: { hip, neck, shoulder, elbow, wrist, legHip, knee, ankle, top, feet, shoulderFar, legHipFar }
 *   }
 *   Joints are in picture pixels. Without thigh/shin (a long robe) the legs are not moved.
 */
(function () {
  const { el, g, f2, clamp } = WA.core;
  const deg = (r) => (r * 180) / Math.PI;

  /** The angle of a bone from a to b, from straight down, forward (+x) positive, in degrees. */
  const restAngle = (a, b) => deg(Math.atan2(b[0] - a[0], b[1] - a[1]));

  function build(S, parent, look, seed = 1) {
    const Q = look.puppet, J = Q.j, [W, H] = Q.size;
    if (!S.defs.querySelector("#pupFar")) {
      S.addDefs(`<filter id="pupFar" color-interpolation-filters="sRGB"><feComponentTransfer><feFuncR type="linear" slope="0.72"/><feFuncG type="linear" slope="0.72"/><feFuncB type="linear" slope="0.74"/></feComponentTransfer></filter>`);
    }
    const B = { ...WA.human.BODIES[look.body || "man"] };
    // The puppet stands as tall as a vector person of its body type (headwear aside).
    const target = B.thigh + B.shin + B.legW * 0.5 + B.torsoH + B.headR * (B.round ? 2 : 2.35);
    const k = target / ((J.feet[1] - J.top[1]) * 0.93);
    const img = (par, name, attrs = {}) => (Q.parts[name] ? el("image", { href: Q.dir + Q.parts[name], width: W, height: H, ...attrs }, par) : null);
    const P = { root: g(parent), B, look, S, Q, J, k, puppet: true, seed };
    P.legLen = (J.feet[1] - J.hip[1]) * k;
    P.height = (J.feet[1] - J.top[1]) * k;
    P.inner = g(P.root);
    P.hasLegs = !!(Q.parts.thigh && Q.parts.shin);
    P.rest = {
      upper: restAngle(J.shoulder, J.elbow), fore: restAngle(J.elbow, J.wrist),
      thigh: P.hasLegs ? restAngle(J.legHip, J.knee) : 0, shin: P.hasLegs ? restAngle(J.knee, J.ankle) : 0,
    };
    const leg = (far) => {
      const hip = g(P.inner, far ? { filter: "url(#pupFar)" } : {});
      img(hip, "thigh");
      const knee = g(hip);
      img(knee, "shin");
      return { hip, knee };
    };
    if (P.hasLegs) { P.legB = leg(true); P.legF = leg(false); }
    P.torso = g(P.inner);
    const arm = (far) => {
      const sh = g(P.torso, far ? { filter: "url(#pupFar)" } : {});
      img(sh, "upper");
      const elbow = g(sh);
      img(elbow, "fore");
      // The hand's frame, for props: at the wrist, pointing along the forearm, in world units.
      const hand = g(elbow, { transform: `translate(${f2(J.wrist[0])},${f2(J.wrist[1])}) rotate(${f2(-P.rest.fore)}) scale(${f2(1 / k)})` });
      return { sh, elbow, hand };
    };
    P.armB = arm(true);
    img(P.torso, "body");
    P.head = g(P.torso);
    img(P.head, "head");
    P.mouth = img(P.head, "mouth", { opacity: 0 });
    P.eyes = img(P.head, "eyes", { opacity: 0 });
    P.armF = arm(false);
    P.props = {};
    for (const pr of [look.prop, ...(look.props || [])].filter(Boolean)) {
      const hand = pr.hand === "back" ? P.armB.hand : P.armF.hand;
      P.props[pr.type] = WA.human.prop(S, hand, pr.type);
    }
    P.activeProp = look.prop?.type ?? null;
    // Loaded before the first frame is captured.
    P.ready = Promise.all(Object.values(Q.parts).filter(Boolean).map((f) => new Promise((r) => { const i = new Image(); i.onload = r; i.onerror = r; i.src = Q.dir + f; })));
    return P;
  }

  const rot = (a, c) => `rotate(${f2(a)} ${f2(c[0])} ${f2(c[1])})`;

  /** Rotations of the joints for a pose (picture degrees, SVG sense). */
  function angles(P, p) {
    const R = P.rest, a = (k) => p[k] || [0, 0];
    const arm = (k) => { const [s, e] = a(k); const sh = R.upper - s; return [sh, R.fore - R.upper - e]; };
    const leg = (k) => { const [h, kn] = a(k); return [R.thigh - h, R.shin - R.thigh - kn]; };
    return { armF: arm("armF"), armB: arm("armB"), legF: leg("legF"), legB: leg("legB"), lean: (p.lean || 0) + (P.B.stoop || 0) };
  }

  function apply(P, p, t) {
    const J = P.J, k = P.k, s = p.scale ?? 1, facing = p.facing ?? 1;
    const hipY = p.seated ? p.y : p.y - (P.legLen - (p.dy || 0)) * s * (p.sy || 1);
    P.root.setAttribute("transform", `translate(${f2(p.x)},${f2(hipY)}) rotate(${f2((p.rot || 0) * facing)}) scale(${(s * facing * (p.sx || 1) * k).toFixed(4)},${(s * (p.sy || 1) * k).toFixed(4)}) translate(${f2(-J.hip[0])},${f2(-J.hip[1])})`);
    P.root.setAttribute("opacity", f2(clamp(p.opacity ?? 1)));
    const A = angles(P, p);
    // The torso bends at the hips (a bow, a lean into a run) and breathes.
    P.torso.setAttribute("transform", `translate(${f2(J.hip[0])},${f2(J.hip[1])}) rotate(${f2(A.lean)}) scale(1,${f2(1 + (p.breath || 0))}) translate(${f2(-J.hip[0])},${f2(-J.hip[1])})`);
    P.head.setAttribute("transform", rot(p.headTilt || 0, J.neck));
    const farSh = J.shoulderFar || [J.shoulder[0] - 14, J.shoulder[1] + 2];
    P.armF.sh.setAttribute("transform", rot(A.armF[0], J.shoulder));
    P.armF.elbow.setAttribute("transform", rot(A.armF[1], J.elbow));
    P.armB.sh.setAttribute("transform", `translate(${f2(farSh[0] - J.shoulder[0])},${f2(farSh[1] - J.shoulder[1])}) ${rot(A.armB[0], J.shoulder)}`);
    P.armB.elbow.setAttribute("transform", rot(A.armB[1], J.elbow));
    if (P.hasLegs) {
      const farHip = J.legHipFar || [J.legHip[0] - 20, J.legHip[1]];
      P.legF.hip.setAttribute("transform", rot(A.legF[0], J.legHip));
      P.legF.knee.setAttribute("transform", rot(A.legF[1], J.knee));
      P.legB.hip.setAttribute("transform", `translate(${f2(farHip[0] - J.legHip[0])},${f2(farHip[1] - J.legHip[1])}) ${rot(A.legB[0], J.legHip)}`);
      P.legB.knee.setAttribute("transform", rot(A.legB[1], J.knee));
      P.legB.hip.setAttribute("opacity", p.hideBackLeg ? 0 : 1);
    }
    // A hand raised high passes behind the head, as on the vector people.
    const behind = p.armsBehindHead || (p.armF?.[0] ?? 0) - (p.lean || 0) > 115;
    if (behind) { if (P.armF.sh.nextSibling !== P.head) P.torso.insertBefore(P.armF.sh, P.head); }
    else if (P.armF.sh.nextSibling === P.head) P.torso.appendChild(P.armF.sh);
    // The mouth opens on the voice (not on m/b/p) and for open-mouthed faces; eyes blink.
    const face = typeof p.face === "string" ? p.face : "";
    const open = (p.talk || 0) > 0.32 && p.viseme !== "m" || /shout|surprised|laugh|yawn|scared/.test(face);
    if (P.mouth) P.mouth.setAttribute("opacity", open ? 1 : 0);
    if (P.eyes) {
      const period = 3.1 + (P.seed % 7) * 0.37, ph = (t + (P.seed % 13) * 0.29) % period;
      const shut = ph < 0.13 || /sleep|tired/.test(face);
      P.eyes.setAttribute("opacity", shut ? 1 : 0);
    }
    const shown = p.prop !== undefined ? p.prop : P.activeProp;
    for (const key in P.props) P.props[key].setAttribute("opacity", key === shown ? 1 : 0);
  }

  /** Affine matrices [a b c d e f] (SVG order), for forward kinematics in points(). */
  const mul = (m, n) => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
  const T = (x, y) => [1, 0, 0, 1, x, y];
  const Sc = (x, y) => [x, 0, 0, y, 0, 0];
  const Rd = (a) => { const r = (a * Math.PI) / 180; return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]; };
  const about = (a, c) => mul(T(c[0], c[1]), mul(Rd(a), T(-c[0], -c[1])));
  const ap = (m, q) => [m[0] * q[0] + m[2] * q[1] + m[4], m[1] * q[0] + m[3] * q[1] + m[5]];

  const PROP_LEN = { iron_whip: 250, broken_whip: 120, bamboo: 380, spear: 270, sword: 170, flag: 300, stick: 170, bronze_axe: 180, horn: 90 };

  /** World points of a posed puppet (camera framing, effects, riding), like WA.human.points. */
  function points(P, p) {
    const J = P.J, k = P.k, s = p.scale ?? 1, f = p.facing ?? 1;
    const hipY = p.seated ? p.y : p.y - (P.legLen - (p.dy || 0)) * s;
    const A = angles(P, p);
    const root = mul(mul(mul(T(p.x, hipY), Rd((p.rot || 0) * f)), Sc(s * f * k, s * k)), T(-J.hip[0], -J.hip[1]));
    const torso = mul(root, about(A.lean, J.hip));
    const head = ap(mul(torso, about(p.headTilt || 0, J.neck)), [(J.top[0] + J.neck[0]) / 2, (J.top[1] * 0.35 + J.neck[1] * 0.65)]);
    const arm = mul(mul(torso, about(A.armF[0], J.shoulder)), about(A.armF[1], J.elbow));
    const wrist = ap(arm, J.wrist);
    const reach = (PROP_LEN[p.prop !== undefined ? p.prop : P.activeProp] || 0);
    const dir = ap(arm, [J.wrist[0] + Math.sin((P.rest.fore * Math.PI) / 180) * 10, J.wrist[1] + Math.cos((P.rest.fore * Math.PI) / 180) * 10]);
    const len = Math.hypot(dir[0] - wrist[0], dir[1] - wrist[1]) || 1;
    const hand = [wrist[0] + ((dir[0] - wrist[0]) / len) * reach * s, wrist[1] + ((dir[1] - wrist[1]) / len) * reach * s];
    const top = ap(torso, J.top)[1];
    const half = ((J.feet[1] - J.top[1]) * 0.22) * k * s;
    const xs = [p.x - half, p.x + half, hand[0], wrist[0]];
    let box = [Math.min(...xs), Math.min(top, hand[1]), Math.max(...xs), p.seated ? hipY + (P.legLen * 0.5) * s : p.y];
    if (Math.abs(p.rot || 0) > 45) { const L = P.height * s * 0.85; box = [p.x - L * 0.6, p.y - P.height * s * 0.45, p.x + L * 0.6, p.y]; }
    const headR = ((J.neck[1] - J.top[1]) * 0.42) * k * s;
    return { feet: [p.x, p.y], hips: [p.x, hipY], head, headR, hand, top, height: P.height * s, box };
  }

  WA.puppet = { build, apply, points };
})();
