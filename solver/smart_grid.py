"""スマートグリッド: 画像のグリッド線を検出し、実際のセルにオーバーレイを合わせる。
使い方: smart_grid.py in.png out.png
  {"cells": {"R1C1": [x,y], ...}, "grid": [rows, cols]} を出力

線が見つからなければ中央領域を 3x3 に分割する。
"""
import sys
import json
import numpy as np
from PIL import Image, ImageDraw


def find_lines(proj, min_gap=20):
    """1 次元投影からピーク位置（グリッド線）を探す。"""
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
    # 近いピークを統合
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

    # 対象の帯状領域（ヘッダーとフッターを除く）
    y0, y1 = int(H * 0.15), int(H * 0.85)
    x0, x1 = int(W * 0.05), int(W * 0.95)
    band = gray[y0:y1, x0:x1]

    # 縦線: 列方向のエッジ強度
    vproj = np.abs(np.diff(band, axis=1)).mean(axis=0)
    # 横線: 行方向のエッジ強度
    hproj = np.abs(np.diff(band, axis=0)).mean(axis=1)

    vx = find_lines(vproj)
    hy = find_lines(hproj)

    # 3x3 には縦横それぞれ内部線が 2 本以上必要。足りなければフォールバック
    if len(vx) >= 2 and len(hy) >= 2:
        # 強い線を 2 本選ぶ（3 等分位置に近いもの）
        xs = sorted([0] + vx + [band.shape[1]])
        ys = sorted([0] + hy + [band.shape[0]])
        # 3 列用に 1/3、2/3 に最も近い分割位置を選ぶ
        def nearest_thirds(vals, total):
            t1, t2 = total / 3, total * 2 / 3
            c1 = min(vals, key=lambda v: abs(v - t1))
            c2 = min(vals, key=lambda v: abs(v - t2))
            if c1 == c2:
                return sorted(vals)[:2] if len(vals) >= 2 else vals
            return sorted([c1, c2])
        # 3x3 に必要な線がそろっている場合だけ使う
        if len(xs) >= 4 and len(ys) >= 4:
            # 3x3 を想定: 境界は 0、w/3、2w/3、w
            cols, rows = 3, 3
            bounds_x = [x0, x0 + band.shape[1] // 3, x0 + band.shape[1] * 2 // 3, x0 + band.shape[1]]
            bounds_y = [y0, y0 + band.shape[0] // 3, y0 + band.shape[0] * 2 // 3, y0 + band.shape[0]]
        else:
            # 検出した線から汎用の NxM グリッドを作る
            bounds_x = [x0 + v for v in ([0] + vx + [band.shape[1]])]
            bounds_y = [y0 + v for v in ([0] + hy + [band.shape[0]])]
            cols, rows = len(bounds_x) - 1, len(bounds_y) - 1
    else:
        # フォールバック: 中央の帯状領域を 3x3 に分割
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
            # セルの枠を描画
            d.rectangle([bounds_x[ci], bounds_y[ri], bounds_x[ci + 1], bounds_y[ri + 1]],
                        outline=(255, 0, 0), width=2)
            d.rectangle([bounds_x[ci] + 2, bounds_y[ri] + 2, bounds_x[ci] + 22, bounds_y[ri] + 20],
                        fill=(255, 0, 0))
            d.text((bounds_x[ci] + 6, bounds_y[ri] + 4), L, fill=(255, 255, 255))
    img.save(outp)
    print(json.dumps({"grid": [rows, cols], "cells": cells}), flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
