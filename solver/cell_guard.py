"""Empty-cell guard: check if a grid cell actually contains an object.
Usage: cell_guard.py image.png
  Reads cells JSON from stdin: {"cells": {"B2": [x,y], ...}, "img_w": W, "img_h": H}
  Prints JSON: {"B2": {"has_content": true, "score": 0.87}, ...}

A cell "has content" if it differs enough from blank background:
  score = saturation_mean * variance_norm * nonwhite_ratio
"""
import sys
import json
import numpy as np
from PIL import Image


def cell_has_content(img_arr, cx, cy, cell_w, cell_h, thresh=0.08):
    """Check 0-1000 center coords + cell size (0-1000 units)."""
    H, W, _ = img_arr.shape
    px = int(cx / 1000 * W)
    py = int(cy / 1000 * H)
    hw = int(cell_w / 1000 * W / 2)
    hh = int(cell_h / 1000 * H / 2)
    x0, x1 = max(0, px - hw), min(W, px + hw)
    y0, y1 = max(0, py - hh), min(H, py + hh)
    if x1 <= x0 or y1 <= y0:
        return {"has_content": False, "score": 0.0}
    crop = img_arr[y0:y1, x0:x1].astype(float)
    if crop.size == 0:
        return {"has_content": False, "score": 0.0}
    # saturation per pixel: (max-min)/max
    mx = crop.max(axis=2)
    mn = crop.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    sat_mean = float(sat.mean())
    # variance (grayscale std, normalized 0-1)
    gray = crop.mean(axis=2)
    var_norm = float(gray.std() / 128.0)
    var_norm = min(1.0, var_norm)
    # non-white ratio (pixels where not all channels > 235)
    nonwhite = float(((crop < 235).any(axis=2)).mean())
    score = sat_mean * var_norm * nonwhite
    return {"has_content": bool(score >= thresh), "score": round(score, 4)}


def main():
    img_path = sys.argv[1]
    spec = json.load(sys.stdin)
    img = Image.open(img_path).convert("RGB")
    arr = np.asarray(img)
    H, W, _ = arr.shape
    cells = spec["cells"]
    if "grid" in spec:
        # smart_grid spec: derive cell size from neighbor distances (nonzero only)
        pts = list(cells.values())
        dxs, dys = [], []
        for i, (x1, y1) in enumerate(pts):
            ds = sorted([abs(x1 - x2) for j, (x2, y2) in enumerate(pts) if j != i and abs(x1 - x2) > 1])
            if ds:
                dxs.append(ds[0])
            ds = sorted([abs(y1 - y2) for j, (x2, y2) in enumerate(pts) if j != i and abs(y1 - y2) > 1])
            if ds:
                dys.append(ds[0])
        cell_w = sorted(dxs)[len(dxs) // 2] * 0.8 if dxs else 200
        cell_h = sorted(dys)[len(dys) // 2] * 0.8 if dys else 200
    else:
        cols = spec.get("cols", 8)
        rows = spec.get("rows", 8)
        margin = spec.get("margin", 0.05)
        cell_w = (1 - 2 * margin) * 1000 / cols
        cell_h = (1 - 2 * margin) * 1000 / rows
    out = {}
    for label, (cx, cy) in cells.items():
        out[label] = cell_has_content(arr, cx, cy, cell_w, cell_h)
    print(json.dumps(out))


if __name__ == "__main__":
    main()
