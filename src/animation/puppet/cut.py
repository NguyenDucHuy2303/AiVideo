"""Cut a painted person into a paper puppet (runtime/puppet.js).

Input pictures (same size, plain white background, three-quarter view facing right):
  base.png     the person, arms hanging a little away from the body
  armless.png  the same person without arms (the model's edit of base.png): the body under
               the arms, whole
  face.png     the same person with the mouth open and the eyes closed (optional)

Output in outdir: body, head, upper, fore, [thigh, shin], [mouth, eyes] .png (full-size,
transparent) and rig.json { size, parts, j: joints in pixels }.

usage: python -I cut.py <dir with the pictures> <outdir>
"""
import json, os, sys
import numpy as np
from PIL import Image, ImageFilter
from scipy import ndimage

src, out = sys.argv[1], sys.argv[2]
os.makedirs(out, exist_ok=True)
load = lambda n: np.asarray(Image.open(os.path.join(src, n)).convert("RGB")).astype(np.float32)
base = load("base.png")
H, W = base.shape[:2]
yy, xx = np.mgrid[0:H, 0:W]


def figure(a):
    """The person: everything but the near-white background touching the border."""
    white = (a.min(axis=2) > 226) & (np.ptp(a, axis=2) < 32)
    lab, _ = ndimage.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    fg = ~np.isin(lab, list(border))
    lab, n = ndimage.label(fg)
    if n > 1:
        sizes = ndimage.sum(fg, lab, range(1, n + 1))
        fg = lab == 1 + int(np.argmax(sizes))
    return ndimage.binary_fill_holes(fg)


def align(a, ref, ref_fg, r=10):
    """Shift picture a (a few pixels at most) to sit on ref."""
    best = None
    box = ndimage.binary_erosion(ref_fg, iterations=4)
    for dy in range(-r, r + 1, 2):
        for dx in range(-r, r + 1, 2):
            d = np.abs(np.roll(a, (dy, dx), axis=(0, 1))[box] - ref[box]).mean()
            if best is None or d < best[0]:
                best = (d, dy, dx)
    _, dy, dx = best
    for ddy in (-1, 0, 1):
        for ddx in (-1, 0, 1):
            d = np.abs(np.roll(a, (dy + ddy, dx + ddx), axis=(0, 1))[box] - ref[box]).mean()
            if d < best[0]:
                best = (d, dy + ddy, dx + ddx)
    return np.roll(a, (best[1], best[2]), axis=(0, 1))


def match_colour(a, ref, where):
    """Shift and scale a's colours to ref's over a region (edits drift in colour)."""
    out = a.copy()
    for c in range(3):
        x, y = a[..., c][where], ref[..., c][where]
        sx = x.std() or 1
        out[..., c] = (a[..., c] - x.mean()) * (y.std() / sx) + y.mean()
    return out.clip(0, 255)


def largest(m, k=1):
    lab, n = ndimage.label(m)
    if n == 0:
        return []
    sizes = ndimage.sum(m, lab, range(1, n + 1))
    order = np.argsort(sizes)[::-1][:k]
    return [lab == 1 + int(i) for i in order if sizes[i] > 0]


def save(img, mask, name, feather=0.7):
    alpha = Image.fromarray((mask * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(feather))
    rgba = Image.fromarray(img.clip(0, 255).astype(np.uint8))
    rgba.putalpha(alpha)
    rgba.save(os.path.join(out, f"{name}.png"))


fg = figure(base)
ys = np.where(fg.any(axis=1))[0]
top, bottom = int(ys[0]), int(ys[-1])
fig_h = bottom - top
parts, j = {}, {"top": [float(xx[top][fg[top]].mean()), top], "feet": [0, bottom]}

# ---- arms: what the armless picture lost ----
armless = align(load("armless.png"), base, fg)
fga = figure(armless)
diff = np.abs(armless - base).sum(axis=2)
arms = fg & (~fga | (diff > 120))
arms = ndimage.binary_opening(arms, iterations=2)
pieces = largest(arms, 2)
if not pieces:
    sys.exit("no arms found: the armless edit did not remove them")
arm = ndimage.binary_closing(pieces[0], iterations=2) & fg   # the near arm: the bigger piece
armless = match_colour(armless, base, fga & ~ndimage.binary_dilation(arms, iterations=6))

# The arm's axis (principal direction), from the shoulder end (top) to the hand.
py, px = np.where(arm)
c = np.array([px.mean(), py.mean()])
cov = np.cov(np.vstack([px - c[0], py - c[1]]))
w, v = np.linalg.eigh(cov)
axis = v[:, np.argmax(w)]
if axis[1] < 0:
    axis = -axis
tproj = (px - c[0]) * axis[0] + (py - c[1]) * axis[1]
t0, t1 = tproj.min(), tproj.max()
L = t1 - t0
width = 2 * np.sqrt(w.min()) * 1.7
at = lambda f: (c + axis * (t0 + f * L)).tolist()
j["shoulder"], j["elbow"], j["wrist"] = at(0.08), at(0.46), at(0.83)
T = (xx - c[0]) * axis[0] + (yy - c[1]) * axis[1]
r = width / 2
te = t0 + 0.46 * L
upper = arm & (T <= te + r * 0.9)
# A round top, so a raised arm does not show a cut edge at the shoulder.
sh = np.array(j["shoulder"])
upper &= (T >= t0 + 0.08 * L) | (np.hypot(xx - sh[0], yy - sh[1]) <= r * 1.1)
fore = arm & (T >= te - r * 0.9)
save(base, upper, "upper"); parts["upper"] = "upper.png"
save(base, fore, "fore"); parts["fore"] = "fore.png"
# The far shoulder (the other arm's top), for the darker copy of the arm.
if len(pieces) > 1:
    fy, fx = np.where(pieces[1])
    j["shoulderFar"] = [float(fx[fy <= fy.min() + 6].mean()), float(fy.min() + 0.08 * L)]

# ---- head and neck (on the armless picture: nothing beside the head) ----
def runs(row):
    d = np.diff(np.concatenate([[0], row.astype(np.int8), [0]]))
    return list(zip(np.where(d == 1)[0], np.where(d == -1)[0] - 1))

widths = np.array([(r_[-1][1] - r_[0][0] + 1) if (r_ := runs(fga[y])) else 0 for y in range(H)])
lo, hi = top + int(fig_h * 0.1), top + int(fig_h * 0.28)
neck = lo + int(np.argmin(widths[lo:hi]))
cut = neck + 12
neck_x = float(xx[neck][fga[neck]].mean())
j["neck"] = [neck_x, float(neck + 8)]
head = fga & (yy < cut)
save(armless, head, "head"); parts["head"] = "head.png"

# ---- legs: below the hem, where the figure splits in two narrow runs ----
two = [y for y in range(top + fig_h // 2, bottom - 4) if len(runs(fga[y])) >= 2 and max(b - a for a, b in runs(fga[y])) < W * 0.22]
legs = []
if len(two) > fig_h * 0.12:
    hem = min(two)
    below = fga & (yy >= hem)
    legs = [m for m in largest(below, 2) if m.sum() > fig_h * 8]
body = fga & (yy >= neck - 4)
j["hip"] = [float(xx[top + int(fig_h * 0.5)][fga[top + int(fig_h * 0.5)]].mean()), float(top + fig_h * 0.5)]
if len(legs) == 2:
    # The front leg (toward the facing side, +x) is the near one; its copy is the far one.
    legs.sort(key=lambda m: -np.where(m)[1].mean())
    near, far = legs
    for m in legs:
        body &= ~m
    ly, lx = np.where(near)
    top_leg = ly.min()
    colx = lambda m, y: float(np.where(m[y])[0].mean()) if m[y].any() else float(np.where(m)[1].mean())
    # Proportions of a standing person: hip joint ~47 % up, knee ~27 %, ankle ~4 %.
    yh, yk, ya = bottom - fig_h * 0.47, bottom - fig_h * 0.27, bottom - fig_h * 0.045
    xk, xa = colx(near, int(yk)), colx(near, int(ya))
    xt = colx(near, int(top_leg) + 2)
    j["legHip"] = [xt + (xt - xk) * 0.3, float(yh)]
    j["knee"], j["ankle"] = [xk, float(yk)], [xa, float(ya)]
    j["legHipFar"] = [colx(far, int(np.where(far)[0].min()) + 2), float(yh)]
    # Under the hem the leg goes on upward (its top row, smeared), hidden by the clothes.
    ext = int(min(top_leg - yh + 6, fig_h * 0.12))
    img = base.copy()
    near_ext = near.copy()
    row = near[top_leg]
    for k in range(1, ext + 1):
        y = top_leg - k
        near_ext[y] = row
        img[y][row] = base[top_leg][row]
    thigh = near_ext & (yy <= yk + r)
    shin = near_ext & (yy >= yk - r)
    save(img, thigh, "thigh"); parts["thigh"] = "thigh.png"
    save(img, shin, "shin"); parts["shin"] = "shin.png"
save(armless, body, "body"); parts["body"] = "body.png"
j["feet"] = [float(xx[bottom][fg[bottom]].mean()), float(bottom)]

# ---- face: the open mouth and the closed eyes, as soft patches ----
if os.path.exists(os.path.join(src, "face.png")):
    face = align(load("face.png"), base, fg, 6)
    head_box = fg & (yy < neck)
    strong = (np.abs(face - base).sum(axis=2) > 200) & head_box
    strong = ndimage.binary_opening(strong, iterations=1)
    hy0, hy1 = top, neck
    band = lambda a, b: (yy >= hy0 + (hy1 - hy0) * a) & (yy < hy0 + (hy1 - hy0) * b)
    for name, (a, b) in (("mouth", (0.66, 1.0)), ("eyes", (0.42, 0.68))):
        m = strong & band(a, b)
        blobs = largest(ndimage.binary_dilation(m, iterations=3), 1 if name == "mouth" else 2)
        if not blobs:
            continue
        m = np.any(blobs, axis=0) & m
        y_, x_ = np.where(m)
        pad = 7
        cy, cx = (y_.min() + y_.max()) / 2, (x_.min() + x_.max()) / 2
        ry, rx = (y_.max() - y_.min()) / 2 + pad, (x_.max() - x_.min()) / 2 + pad
        rr = ((yy - cy) / ry) ** 2 + ((xx - cx) / rx) ** 2
        alpha = np.clip((1 - rr) / 0.35, 0, 1) * head_box
        ring = (alpha > 0.05) & ~ndimage.binary_dilation(m, iterations=3)
        patch = face + ((base[ring].mean(axis=0) - face[ring].mean(axis=0)) if ring.sum() > 40 else 0)
        rgba = np.dstack([patch.clip(0, 255), alpha * 255]).astype(np.uint8)
        Image.fromarray(rgba, "RGBA").save(os.path.join(out, f"{name}.png"))
        parts[name] = f"{name}.png"

rig = {"size": [W, H], "parts": parts, "j": {k: [round(float(a), 1), round(float(b), 1)] for k, (a, b) in j.items()}}
json.dump(rig, open(os.path.join(out, "rig.json"), "w"), indent=1)
print(json.dumps(rig))
