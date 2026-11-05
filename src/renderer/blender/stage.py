"""
Paper-theatre stage for one scene, rendered with Blender's Eevee.

    blender -b --factory-startup --python stage.py -- spec.json

The painting becomes a relief seen from the camera: each pixel sits on its own ray at its
own depth, so from the first camera position the picture looks exactly as painted, and any
camera move afterwards shows real parallax (near reeds slide past, far mountains stay).
The depth comes from a depth map when there is one, otherwise from a ground plane under a
horizon ("tour into the picture"). The cut-out character stands in that space, lit by the
scene's light and kept in focus while the foreground blurs. Fog, light shafts, flashes and
shake are real, in the same space. Captions and texts are added later by ffmpeg.

The spec (JSON) is written by stage.ts; every value is in frame units or fractions of the
frame, so this script holds no project knowledge.
"""

import json
import math
import sys

import bpy
import numpy as np

spec = json.load(open(sys.argv[sys.argv.index("--") + 1]))
W, H, FPS, FRAMES = spec["width"], spec["height"], spec["fps"], spec["frames"]
ASPECT = W / H

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x, scene.render.resolution_y = W, H
scene.render.fps = FPS
scene.frame_start, scene.frame_end = 0, FRAMES - 1
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGB"
scene.render.filepath = spec["output"]
# The painting's own colours: no filmic tone curve on top of them.
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
ee = scene.eevee
ee.taa_render_samples = spec.get("samples", 16)
ee.volumetric_tile_size = "8"
ee.volumetric_samples = 32
ee.volumetric_start = 0.5
ee.volumetric_end = 90

# ---------------------------------------------------------------------------------------
# Camera. Built a little wider than it shows (MARGIN), so moves never reveal the edge.
HFOV = math.radians(spec.get("hfov", 50 if ASPECT >= 1 else 34))
MARGIN = 1.12
TX = math.tan(HFOV / 2) * MARGIN
TZ = TX / ASPECT
NEAR, FAR = 2.5, 70.0
HORIZON = spec.get("horizon", 0.48)
EYE = 1.6


def ease(t):
    t = min(1.0, max(0.0, t))
    return t * t * (3 - 2 * t)


def depth_grid(nx, nz):
    """Planar depth (distance along the view axis) for each grid vertex."""
    u = np.linspace(0, 1, nx)[None, :].repeat(nz, 0)
    v = np.linspace(0, 1, nz)[:, None].repeat(nx, 1)
    if spec.get("depth"):
        img = bpy.data.images.load(spec["depth"])
        img.colorspace_settings.name = "Non-Color"  # data, not a picture: no sRGB curve
        w, h = img.size
        px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)[::-1, :, 0]
        # Larger = nearer (relative disparity). Sample, then turn into distance.
        xi = np.clip((u * (w - 1)).astype(int), 0, w - 1)
        yi = np.clip((v * (h - 1)).astype(int), 0, h - 1)
        disp = px[yi, xi]
        lo, hi = np.percentile(disp, 2), np.percentile(disp, 98)
        disp = np.clip((disp - lo) / max(hi - lo, 1e-6), 0, 1)
        return 1.0 / (disp * (1 / NEAR - 1 / FAR) + 1 / FAR)
    # A ground plane below the horizon, a far wall above it, joined smoothly.
    below = np.maximum(v - HORIZON, 1e-4) * 2 * TZ
    ground = np.clip(EYE / below, NEAR, FAR)
    blend = np.clip((v - HORIZON) / 0.06, 0, 1)
    return FAR * (1 - blend) + ground * blend


def relief(painting):
    nx = 200 if ASPECT >= 1 else 120
    nz = max(2, round(nx / ASPECT))
    d = depth_grid(nx, nz)
    u = np.linspace(0, 1, nx)
    v = np.linspace(0, 1, nz)
    xs = ((u - 0.5) * 2 * TX)[None, :] * d
    zs = ((0.5 - v) * 2 * TZ)[:, None] * d
    verts = np.stack([xs, d, zs], -1).reshape(-1, 3)
    faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i) for j in range(nz - 1) for i in range(nx - 1)]
    mesh = bpy.data.meshes.new("painting")
    mesh.from_pydata(verts.tolist(), [], faces)
    uv = mesh.uv_layers.new()
    uvs = np.stack([u[None, :].repeat(nz, 0), 1 - v[:, None].repeat(nx, 1)], -1).reshape(-1, 2)
    loops = np.array([li for f in mesh.polygons for li in f.vertices], dtype=int)
    uv.data.foreach_set("uv", uvs[loops].reshape(-1))
    obj = bpy.data.objects.new("painting", mesh)
    scene.collection.objects.link(obj)

    mat = bpy.data.materials.new("painting")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(painting)
    tex.interpolation = "Cubic"
    tex.extension = "EXTEND"
    emit = nt.nodes.new("ShaderNodeEmission")
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    obj.data.materials.append(mat)
    return obj, d, emit


painting, DEPTH, painting_light = relief(spec["painting"])


def ground_at(x, y):
    """World point of the painting seen at fraction (x, y) of the camera's first view."""
    nz, nx = DEPTH.shape
    u = 0.5 + (x - 0.5) / MARGIN
    v = 0.5 + (y - 0.5) / MARGIN
    d = float(DEPTH[min(nz - 1, round(v * (nz - 1))), min(nx - 1, round(u * (nx - 1)))])
    return ((x - 0.5) * 2 * TX / MARGIN * d, d, (0.5 - y) * 2 * TZ / MARGIN * d)


cam_data = bpy.data.cameras.new("cam")
cam_data.sensor_fit = "HORIZONTAL"
cam_data.angle = HFOV
cam_data.clip_start, cam_data.clip_end = 0.1, 200
cam = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam)
scene.camera = cam

# ---------------------------------------------------------------------------------------
# Light and air, by time of day.
TIME = spec.get("time", "day")
TINT = {"dawn": (1.0, 0.82, 0.74), "day": (1.0, 0.96, 0.88), "dusk": (1.0, 0.62, 0.36), "night": (0.5, 0.6, 1.0)}[TIME]
world = bpy.data.worlds.new("world")
scene.world = world
world.use_nodes = True
wn = world.node_tree
wn.nodes["Background"].inputs["Color"].default_value = (*[c * 0.05 for c in TINT], 1)
fog = wn.nodes.new("ShaderNodeVolumePrincipled")
fog.inputs["Color"].default_value = (*TINT, 1)
effects = set(spec.get("effects", []))
density = 0.006 + (0.012 if "mist" in effects else 0) + (0.004 if TIME in ("dawn", "night") else 0)
fog.inputs["Density"].default_value = density
wn.links.new(fog.outputs[0], wn.nodes["World Output"].inputs["Volume"])

sun_data = bpy.data.lights.new("sun", "SUN")
sun_data.color = TINT
sun_data.energy = 2.5 if TIME != "night" else 0.6
sun = bpy.data.objects.new("sun", sun_data)
sun.rotation_euler = (math.radians(70), 0, math.radians(-35 if spec.get("sun_left") else 35))
scene.collection.objects.link(sun)

if "light_rays" in effects:
    # A spot behind the scene, aimed at the camera through the fog: visible shafts.
    spot_data = bpy.data.lights.new("rays", "SPOT")
    spot_data.color = (1.0, 0.92, 0.7)
    spot_data.energy = 60000
    spot_data.spot_size = math.radians(50)
    spot_data.spot_blend = 0.6
    spot = bpy.data.objects.new("rays", spot_data)
    spot.location = (FAR * 0.15, FAR * 0.6, FAR * 0.35)
    spot.rotation_euler = (math.radians(120), 0, math.radians(165))
    scene.collection.objects.link(spot)

# ---------------------------------------------------------------------------------------
# The cut-out character.
actor = spec.get("actor")
actor_obj = None
actor_fade = None
if actor:
    img = bpy.data.images.load(actor["src"])
    iw, ih = img.size
    base_y = actor.get("baseY", 0.92)
    gx, gd, gz = ground_at(actor.get("x", 0.5), base_y)
    gd *= 0.96  # just in front of the painted ground
    frame_h = 2 * TZ / MARGIN * gd
    # "height" is a share of the layout's tallest figure, itself a share of the frame.
    height = actor.get("height", 0.8) * actor.get("maxHeight", 0.7) * frame_h
    width = height * iw / ih
    mesh = bpy.data.meshes.new("actor")
    # Origin at the feet, so scaling grows the figure up from the ground.
    mesh.from_pydata([(-width / 2, 0, 0), (width / 2, 0, 0), (width / 2, 0, height), (-width / 2, 0, height)], [], [(0, 1, 2, 3)])
    uv = mesh.uv_layers.new()
    uv.data.foreach_set("uv", [0, 0, 1, 0, 1, 1, 0, 1])
    actor_obj = bpy.data.objects.new("actor", mesh)
    scene.collection.objects.link(actor_obj)
    mat = bpy.data.materials.new("actor")
    mat.use_nodes = True
    mat.surface_render_method = "BLENDED"
    nt = mat.node_tree
    nt.nodes.clear()
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = img
    tex.interpolation = "Cubic"
    tex.extension = "CLIP"
    emit = nt.nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.0
    nt.links.new(tex.outputs["Color"], emit.inputs["Color"])
    fade = nt.nodes.new("ShaderNodeMath")
    fade.operation = "MULTIPLY"
    fade.inputs[1].default_value = 1.0
    # The painted ground line under the feet fades into the scenery instead of floating.
    coords = nt.nodes.new("ShaderNodeTexCoord")
    split = nt.nodes.new("ShaderNodeSeparateXYZ")
    nt.links.new(coords.outputs["UV"], split.inputs[0])
    feet = nt.nodes.new("ShaderNodeMapRange")
    feet.interpolation_type = "SMOOTHSTEP"
    feet.inputs["From Min"].default_value = 0.01
    feet.inputs["From Max"].default_value = 0.09
    nt.links.new(split.outputs["Y"], feet.inputs["Value"])
    grounded = nt.nodes.new("ShaderNodeMath")
    grounded.operation = "MULTIPLY"
    nt.links.new(tex.outputs["Alpha"], grounded.inputs[0])
    nt.links.new(feet.outputs[0], grounded.inputs[1])
    nt.links.new(grounded.outputs[0], fade.inputs[0])
    clear = nt.nodes.new("ShaderNodeBsdfTransparent")
    mix = nt.nodes.new("ShaderNodeMixShader")
    nt.links.new(fade.outputs[0], mix.inputs["Fac"])
    nt.links.new(clear.outputs[0], mix.inputs[1])
    nt.links.new(emit.outputs[0], mix.inputs[2])
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(mix.outputs[0], out.inputs["Surface"])
    actor_obj.data.materials.append(mat)
    actor_fade = fade.inputs[1]
    ACTOR_HOME = (gx, gd, gz - 0.04 * height)  # the faded ground line sinks into the grass
    ACTOR_H = height
    VIEW_W = 2 * TX / MARGIN * gd

# ---------------------------------------------------------------------------------------
# Animation, keyed frame by frame (scenes are a few hundred frames).
MOVE = spec.get("camera", "ken_burns")
START = actor["startFrame"] if actor else 0
ACTION = actor["action"] if actor else None
HIT = spec.get("hitFrame", START + round(0.8 * FPS))
seconds = FRAMES / FPS
focus = ACTOR_HOME[1] if actor else 12.0
cam_data.dof.use_dof = True
cam_data.dof.focus_distance = focus
cam_data.dof.aperture_fstop = spec.get("fstop", 2.8)
cam_data.lens_unit = "FOV"


def camera_at(f):
    t = ease(f / max(1, FRAMES - 1))
    # Moves in metres at the scale of the stage: a few metres for a 10 m deep scene.
    x = y = z = 0.0
    if MOVE in ("pan_right", "pan_left"):
        x = (t - 0.5) * 1.6 * (1 if MOVE == "pan_right" else -1)
        y = 0.4 * t
    elif MOVE == "pan_up":
        z = (t - 0.3) * 0.9
    elif MOVE == "zoom_out":
        y = 1.8 * (1 - t)
    else:  # ken_burns, zoom_in: slow push in
        y = 1.4 * t
        x = 0.25 * (t - 0.5)
    rx, rz = 0.0, 0.0
    # Hand-held breathing, very small.
    rx += 0.0025 * math.sin(f / FPS * 1.3)
    rz += 0.0025 * math.sin(f / FPS * 0.9 + 1.0)
    if "shake" in effects and f >= HIT:
        k = math.exp(-(f - HIT) / (0.25 * FPS))
        rx += 0.02 * k * math.sin(f * 2.1)
        rz += 0.02 * k * math.sin(f * 2.9 + 0.5)
        z += 0.06 * k * math.sin(f * 3.3)
    return (x, y, z), (math.pi / 2 + rx, 0, rz)


def actor_at(f):
    """Location offset (fractions of the view), scale and opacity of the figure at frame f."""
    s = (f - START) / FPS
    dx = dz = 0.0
    scale = 1.0
    alpha = 1.0
    tilt = 0.0
    walk = lambda period, amp: abs(math.sin(math.pi * s / period)) * amp
    if s < 0:
        alpha = 0.0 if ACTION in ("appear", "grow", "rise", "fly_up") else alpha
        s = 0
    if ACTION == "appear":
        alpha *= ease(s / 0.8)
        dz = 0.004 * math.sin(s * 2.0)
    elif ACTION in ("enter_left", "enter_right"):
        side = -1 if ACTION == "enter_left" else 1
        p = ease(s / 1.8)
        dx = side * 0.75 * (1 - p)
        dz = walk(0.45, 0.02) * (1 - p * 0.8)
        tilt = side * 0.03 * (1 - p)
    elif ACTION == "grow":
        p = ease(s / 1.4)
        scale = 0.35 + 0.65 * p + 0.05 * math.sin(math.pi * min(1, s / 1.4)) * (1 - p)
        alpha *= ease(s / 0.3)
    elif ACTION == "charge":
        # Gallops across the whole frame, bouncing with the stride, leaning into it.
        span = max(1.0, seconds - START / FPS)
        dx = -0.85 + 1.7 * (s / span)
        dz = walk(0.36, 0.035)
        tilt = -0.06 + 0.03 * math.sin(2 * math.pi * s / 0.36)
    elif ACTION == "rise":
        p = ease(s / 1.6)
        dz = -0.9 * (1 - p)
    elif ACTION == "fly_up":
        lift = max(0.0, s - 0.5)
        dz = 0.18 * lift * lift
        scale = 1 / (1 + 0.25 * lift * lift)
        alpha *= ease(s / 0.5) * (1 - ease((lift - 2.5) / 1.5))
    return dx, dz, scale, alpha, tilt


for f in range(FRAMES):
    loc, rot = camera_at(f)
    cam.location = loc
    cam.rotation_euler = rot
    cam.keyframe_insert("location", frame=f)
    cam.keyframe_insert("rotation_euler", frame=f)
    if actor_obj:
        dx, dz, scale, alpha, tilt = actor_at(f)
        actor_obj.location = (ACTOR_HOME[0] + dx * VIEW_W, ACTOR_HOME[1], ACTOR_HOME[2] + dz * ACTOR_H * 2)
        actor_obj.scale = (scale, scale, scale)
        actor_obj.rotation_euler = (0, tilt, 0)
        actor_obj.keyframe_insert("location", frame=f)
        actor_obj.keyframe_insert("scale", frame=f)
        actor_obj.keyframe_insert("rotation_euler", frame=f)
        actor_fade.default_value = alpha
        actor_fade.keyframe_insert("default_value", frame=f)
    if "flash" in effects:
        k = math.exp(-max(0, f - HIT) / (0.18 * FPS)) if f >= HIT else 0
        painting_light.inputs["Strength"].default_value = 1 + 1.6 * k
        painting_light.inputs["Strength"].keyframe_insert("default_value", frame=f)

for obj in [cam, actor_obj]:
    if obj and obj.animation_data:
        for fc in obj.animation_data.action.fcurves if hasattr(obj.animation_data.action, "fcurves") else []:
            for kp in fc.keyframe_points:
                kp.interpolation = "LINEAR"

only = spec.get("only")
if only is not None:
    for f in only:
        scene.frame_set(f)
        scene.render.filepath = spec["output"].replace("####", f"{f:04d}")
        bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
