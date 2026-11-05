"""
Depth of a painting with Depth Anything V2 Small (ONNX), run in vendor/depth/venv.

    python depth.py model.onnx WIDTH HEIGHT in.rgb24 out.gray16le

Output: relative disparity (larger = nearer), stretched to the full 16-bit range.

WIDTH and HEIGHT are multiples of 14 (the model's patch size); depth.ts scales the picture.
"""

import sys

import numpy as np
import onnxruntime as ort

model, w, h, src, dst = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), sys.argv[4], sys.argv[5]
rgb = np.fromfile(src, dtype=np.uint8).reshape(h, w, 3).astype(np.float32) / 255
mean = np.array([0.485, 0.456, 0.406], dtype=np.float32)
std = np.array([0.229, 0.224, 0.225], dtype=np.float32)
x = ((rgb - mean) / std).transpose(2, 0, 1)[None]

opts = ort.SessionOptions()
opts.log_severity_level = 3
session = ort.InferenceSession(model, opts, providers=["CPUExecutionProvider"])
out = session.run(None, {session.get_inputs()[0].name: x})[0].reshape(h, w)

lo, hi = np.percentile(out, 1), np.percentile(out, 99)
d = np.clip((out - lo) / max(hi - lo, 1e-6), 0, 1)
(d * 65535).astype("<u2").tofile(dst)
