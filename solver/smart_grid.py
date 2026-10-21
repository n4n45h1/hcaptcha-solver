"""Smart grid: detect actual image grid lines, snap overlay to real cells.
Usage: smart_grid.py in.png out.png
  Prints {"cells": {"R1C1": [x,y], ...}, "grid": [rows, cols]}

Falls back to 3x3 split of central area if no lines found.
"""
import sys
import json
import numpy as np
from PIL import Image, ImageDraw


def find_lines(proj, min_gap=20):
    """Find peak positions (grid lines) in 1D projection."""
    thresh = proj.mean() + proj.std() * 1.2
    peaks = []
    in_peak = False
    start = 0
    for i, v in enumerate(proj):
        if v > thresh and not in_peak:
            in_peak = True
            start = i
        elif v <= thresh and in_peak:
            in_peak = False
            if i - start >= 2:
                peaks.append((start + i) // 2)
    # merge close peaks
    merged = []
    for p in peaks:
        if merged and p - merged[-1] < min_gap:
            merged[-1] = (merged[-1] + p) // 2
        else:
            merged.append(p)
    return merged


def main(inp, outp):
    img = Image.open(inp).convert('RGB')
    W, H = img.size
    arr = np.asarray(img).astype(float)
    gray = arr.mean(axis=2)

    # focus band (skip header/footer)
    y0, y1 = int(H * 0.15), int(H * 0.85)
    x0, x1 = int(W * 0.05), int(W * 0.95)
    band = gray[y0:y1, x0:x1]

    # vertical lines: column-edge energy
    vproj = np.abs(np.diff(band, axis=1)).mean(axis=0)
    # horizontal lines: row-edge energy
    hproj = np.abs(np.diff(band, axis=0)).mean(axis=1)

    vx = find_lines(vproj)
    hy = find_lines(hproj)

    # Need at least 2 interior lines each way for 3x3, else fallback
    if len(vx) >= 2 and len(hy) >= 2:
        # take the 2 strongest (closest to thirds)
        xs = sorted([0] + vx + [band.shape[1]])
        ys = sorted([0] + hy + [band.shape[0]])
        # pick splits nearest to 1/3, 2/3 for 3 cols
        def nearest_thirds(vals, total):
            t1, t2 = total / 3, total * 2 / 3
            c1 = min(vals, key=lambda v: abs(v - t1))
            c2 = min(vals, key=lambda v: abs(v - t2))
            if c1 == c2:
                return sorted(vals)[:2] if len(vals) >= 2 else vals
            return sorted([c1, c2])
        # only use if we have enough lines for 3x3
        if len(xs) >= 4 and len(ys) >= 4:
            # 3x3 assumed: boundaries at 0, w/3, 2w/3, w
            cols, rows = 3, 3
            bounds_x = [x0, x0 + band.shape[1] // 3, x0 + band.shape[1] * 2 // 3, x0 + band.shape[1]]
            bounds_y = [y0, y0 + band.shape[0] // 3, y0 + band.shape[0] * 2 // 3, y0 + band.shape[0]]
        else:
            # generic NxM from detected lines
            bounds_x = [x0 + v for v in ([0] + vx + [band.shape[1]])]
            bounds_y = [y0 + v for v in ([0] + hy + [band.shape[0]])]
            cols, rows = len(bounds_x) - 1, len(bounds_y) - 1
    else:
        # fallback: 3x3 over central band
        cols, rows = 3, 3
        bounds_x = [x0 + band.shape[1] * i // 3 for i in range(4)]
        bounds_y = [y0 + band.shape[0] * i // 3 for i in range(4)]

    d = ImageDraw.Draw(img)
    cells = {}
    letters = 'ABCDEFGH'
    for ri in range(rows):
        for ci in range(cols):
            L = f"{letters[ci]}{ri + 1}" if cols <= 8 and rows <= 8 else f"R{ri + 1}C{ci + 1}"
            cx = (bounds_x[ci] + bounds_x[ci + 1]) / 2 / W * 1000
            cy = (bounds_y[ri] + bounds_y[ri + 1]) / 2 / H * 1000
            cells[L] = [round(cx, 1), round(cy, 1)]
            # draw cell rect
            d.rectangle([bounds_x[ci], bounds_y[ri], bounds_x[ci + 1], bounds_y[ri + 1]],
                        outline=(255, 0, 0), width=2)
            d.rectangle([bounds_x[ci] + 2, bounds_y[ri] + 2, bounds_x[ci] + 22, bounds_y[ri] + 20],
                        fill=(255, 0, 0))
            d.text((bounds_x[ci] + 6, bounds_y[ri] + 4), L, fill=(255, 255, 255))
    img.save(outp)
    print(json.dumps({"grid": [rows, cols], "cells": cells}), flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
