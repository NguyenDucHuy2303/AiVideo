/*
 * Shots, framed from the characters rather than from numbers: a shot names who it is on and
 * how close, and the camera works out position and zoom every frame (so it pulls back by
 * itself while a boy grows into a giant, and keeps a rider in frame at full gallop).
 *
 *   { at, type, on, part, lead, push, gy, follow, ease }
 *   type:  "wide" (subject 40 % of the height) · "full" (70 %) · "medium" (cut at the knees)
 *          · "close" (the head, or `part` of the subject: "mouth", "head", "seat")
 *   on:    an actor id or a list of ids (framed together)
 *   lead:  room in front of a moving subject, in frame widths (default 0.12 when it moves)
 *   push:  slow zoom over the shot (0.1 = 10 % closer by its end)
 *   gy:    where the ground sits, as a share of the frame height (default 0.86)
 *   dx/dy: shift the framing, as a share of the frame width / height
 *   follow: keep tracking the subject sideways (default: only "track" and moving subjects)
 *   ease:  seconds to move from the previous shot instead of cutting
 *   sizeLag: the camera reacts to a change of size this late (default 0.5 s), like an
 *          operator: a growing giant first bursts out of the frame, then the camera pulls back
 */
(function () {
  const { lerp, smooth, seg, EASE } = WA.core;
  const SHARE = { wide: 0.5, full: 0.75, medium: 0.95, track: 0.5 };

  function frame(shot, t, ctx, S) {
    const ids = [].concat(shot.on || []);
    const pts = ids.map((id) => ctx.pointsAt(id, t));
    const lockT = shot.follow || shot.type === "track" ? t : shot.at;
    const ptsLock = ids.map((id) => ctx.pointsAt(id, Math.max(shot.at, Math.min(t, lockT))));
    const { W, H } = S;
    if (!pts.length) return { x: 0, y: (H / 2 - 0.86 * H) / 0.5, z: 0.5 };
    const k = smooth(seg(t, shot.at, shot.end ?? shot.at + 4));
    const push = 1 + (shot.push || 0) * k;
    const facing = pts[0].facing ?? 1;
    const moving = ctx.speedOf ? Math.abs(ctx.speedOf(ids[0], t)) > 50 : false;
    const lead = shot.lead ?? (moving ? 0.12 : 0);
    if (shot.type === "close") {
      const p = pts[0], part = p[shot.part || "head"] || p.head;
      // A face close-up shows head and shoulders, the face a little above the centre.
      // Sized by the head itself: a face fills about half the frame, child or adult.
      const size = shot.size ?? (shot.part && shot.part !== "head" ? p.height * 0.55 : p.headR ? p.headR * 2.3 : p.height * 0.19);
      // Close-ups fill the short side of the frame, so they work in 16:9 and 9:16 alike.
      const z = ((Math.min(W, H) * 0.5) / size) * push;
      const lift = !shot.part || shot.part === "head" ? H * 0.06 : 0;
      return { x: part[0] + (facing * lead * W) / z + ((shot.dx || 0) * W) / z, y: part[1] + (lift + (shot.dy || 0) * H) / z, z };
    }
    // Everything the shot is on must fit: the union of their boxes, sized a little late.
    const sized = ids.map((id) => ctx.pointsAt(id, Math.max(shot.at, t - (shot.sizeLag ?? 0.5))));
    const place = shot.follow || shot.type === "track" || moving ? pts : ptsLock;
    const boxH = Math.max(...sized.map((p) => p.box[3] - p.box[1]));
    const boxW = Math.max(...sized.map((p) => p.box[2] - p.box[0])) + (Math.max(...place.map((p) => p.feet[0])) - Math.min(...place.map((p) => p.feet[0])));
    const left = Math.min(...place.map((p) => p.box[0])), right = Math.max(...place.map((p) => p.box[2]));
    const vertical = H > W;
    // In a tall frame the ground sits higher, so the captions stay below the feet.
    const gy = shot.gy ?? (shot.type === "medium" ? (vertical ? 0.9 : 1.08) : vertical ? 0.74 : 0.86);
    const share = shot.share ?? SHARE[shot.type] ?? 0.42;
    let z = ((H * share) / boxH) * push;
    if (shot.type !== "medium") z = Math.min(z, (H * (gy - 0.07)) / boxH); // the top stays in frame
    z = Math.min(z, (W * 0.86) / boxW); // and so do both ends
    const cx = (left + right) / 2;
    // Lead room in front of a moving subject, but never pushing it out of the frame.
    const room = Math.max(0, (W * 0.93 - (right - left) * z) / 2);
    const leadPx = Math.max(-room, Math.min(room, facing * lead * W));
    let y = (H / 2 - gy * H) / z;
    // Off the ground (flying): rise with the subject; followY < 1 lets it drift up the frame.
    const top = Math.min(...place.map((p) => p.box[1])), bottom = Math.max(...place.map((p) => p.box[3]));
    if ((shot.follow || shot.type === "track") && bottom < -40) y = Math.min(y, lerp(y, (top + bottom) / 2, shot.followY ?? 1));
    return { x: cx + leadPx / z + ((shot.dx || 0) * W) / z, y, z };
  }

  /** The camera at time t from a list of shots (sorted by `at`). */
  function at(shots, t, ctx, S) {
    let i = 0;
    while (i + 1 < shots.length && shots[i + 1].at <= t) i++;
    const shot = shots[i];
    let cam = frame(shot, t, ctx, S);
    if (shot.ease && i > 0 && t < shot.at + shot.ease) {
      const prev = frame(shots[i - 1], t, ctx, S), k = EASE.inOut(seg(t, shot.at, shot.at + shot.ease));
      cam = { x: lerp(prev.x, cam.x, k), y: lerp(prev.y, cam.y, k), z: Math.exp(lerp(Math.log(prev.z), Math.log(cam.z), k)) };
    }
    // A hand-held breath, so the frame is never dead still.
    cam.x += (6 / cam.z) * Math.sin(t * 0.9 + 1);
    cam.y += (4 / cam.z) * Math.sin(t * 1.3);
    return cam;
  }

  WA.camera = { at, frame };
})();
