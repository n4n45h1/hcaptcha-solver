"""パターンドラッグ用ソルバー: 空きセルが 1 つあるグリッドと右側の候補 2 つを扱う。
使い方: pattern_solver.py shot.png overlay.png
  {"empty": [x,y], "top": [x,y], "bottom": [x,y]}（0-1000）を出力し、オーバーレイを保存。

方針:
  1. グリッド線を検出して配置を求める（画像の左約 75% に 4x4 または 3x3 を想定）
  2. 各セルの中身を彩度×ばらつき×白以外の割合で確認
  3. 最も空に近いセルをドロップ先にする
  4. 右約 25% の帯状領域で大きい塊を 2 つ探し、上下の候補にする
"""
import sys
import json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from collections import deque


def find_grid_lines(gray, axis):
    """投影から強い縦線（axis=1）または横線（axis=0）を探す。"""
    H, W = gray.shape
    if axis == 1:  # 縦線: 列ごとの平均
        proj = np.abs(np.diff(gray.astype(float), axis=1)).mean(axis=0)
    else:
        proj = np.abs(np.diff(gray.astype(float), axis=0)).mean(axis=1)
    thresh = proj.mean() + proj.std() * 1.5
    peaks = []
    in_peak = False
    start = 0
    for i, v in enumerate(proj):
        if v > thresh and not in_peak:
            in_peak = True
            start = i
        elif v <= thresh and in_peak:
            in_peak = False
            peaks.append((start + i) // 2)
    return peaks


def cell_content_score(arr, x0, y0, x1, y1):
    crop = arr[y0:y1, x0:x1].astype(float)
    if crop.size == 0:
        return 0.0
    mx = crop.max(axis=2)
    mn = crop.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0).mean()
    gray = crop.mean(axis=2)
    var = min(1.0, float(gray.std() / 128.0))
    nonwhite = float(((crop < 235).any(axis=2)).mean())
    return float(sat * var * nonwhite)


def comps(mask, min_n=60):
    H, W = mask.shape
    seen = np.zeros_like(mask, bool)
    out = []
    for y in range(H):
        for x in range(W):
            if seen[y, x] or not mask[y, x]:
                continue
            q = deque([(x, y)])
            seen[y, x] = True
            sx = sy = n = 0
            x0 = y0 = 10 ** 9
            x1 = y1 = -1
            while q:
                cx, cy = q.popleft()
                sx += cx
                sy += cy
                n += 1
                x0, x1 = min(x0, cx), max(x1, cx)
                y0, y1 = min(y0, cy), max(y1, cy)
                for dx, dy in ((2, 0), (-2, 0), (0, 2), (0, -2)):
                    nx, ny = cx + dx, cy + dy
                    if 0 <= nx < W and 0 <= ny < H and not seen[ny, nx] and mask[ny, nx]:
                        seen[ny, nx] = True
                        q.append((nx, ny))
            if n >= min_n:
                out.append([sx / n, sy / n, n])
    return out


def main(inp, outp):
    img = Image.open(inp).convert('RGB')
    W, H = img.size
    arr = np.asarray(img)
    gray = arr.mean(axis=2)

    # 中央の帯状領域を対象にする（上部のプロンプトと下部のボタンを除く）
    y_top, y_bot = int(H * 0.22), int(H * 0.88)
    band = gray[y_top:y_bot, :]

    # 左 75% のグリッド線
    left = band[:, :int(W * 0.75)]
    vlines = find_grid_lines(left, axis=1)
    hlines = find_grid_lines(left, axis=0)
    # グリッドの境界
    gx = [0] + vlines + [left.shape[1]]
    gy = [0] + hlines + [left.shape[0]]
    # グリッドサイズを推定: 線は 3-5 本を想定
    ncols = len(gx) - 1
    nrows = len(gy) - 1

    cells = []
    for ri in range(nrows):
        for ci in range(ncols):
            x0, x1 = gx[ci], gx[ci + 1]
            y0, y1 = gy[ri] + y_top, gy[ri + 1] + y_top
            # グリッド線を避けるため 10% 内側に寄せる
            ix0 = int(x0 + (x1 - x0) * 0.12)
            ix1 = int(x0 + (x1 - x0) * 0.88)
            iy0 = int(y0 + (y1 - y0) * 0.12)
            iy1 = int(y0 + (y1 - y0) * 0.88)
            score = cell_content_score(arr, ix0, iy0, ix1, iy1)
            cells.append({
                "r": ri, "c": ci,
                "cx": (x0 + x1) / 2 / W * 1000,
                "cy": (y0 + y1) / 2 / H * 1000,
                "score": round(score, 4),
            })
    cells.sort(key=lambda c: c["score"])
    empty = cells[0] if cells else None

    # 右の帯状領域の候補（y 座標で上下を判定）
    strip = arr[y_top:y_bot, int(W * 0.75):]
    mx = strip.max(axis=2)
    mn = strip.min(axis=2)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
    lum = Image.fromarray((strip.mean(axis=2)).astype(np.uint8))
    opened = np.asarray(lum.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7)))
    cmask = (opened < 180) & (sat > 0.08)
    blobs = comps(cmask, min_n=200)
    blobs = [b for b in blobs if b[2] < 0.3 * strip.size]
    blobs.sort(key=lambda b: b[1])  # 上から下へ
    cands = []
    for i, (bx, by, n) in enumerate(blobs[:4]):
        cands.append({
            "x": round((bx + W * 0.75) / W * 1000),
            "y": round((by + y_top) / H * 1000),
        })
    top = cands[0] if len(cands) > 0 else None
    # 下の候補は最後の塊（途中のノイズを飛ばす）
    bottom = cands[-1] if len(cands) > 1 else None

    # オーバーレイを描画
    d = ImageDraw.Draw(img)
    if empty:
        ex, ey = empty["cx"] / 1000 * W, empty["cy"] / 1000 * H
        d.rectangle([ex - 30, ey - 30, ex + 30, ey + 30], outline=(0, 80, 220), width=4)
        d.text((ex - 10, ey - 45), "EMPTY", fill=(0, 80, 220))
    for i, c in enumerate([top, bottom]):
        if not c:
            continue
        x, y = c["x"] / 1000 * W, c["y"] / 1000 * H
        L = ["TOP", "BOT"][i]
        d.ellipse([x - 15, y - 30, x + 15, y - 2], fill=(0, 150, 0), outline=(255, 255, 255), width=2)
        d.text((x - 12, y - 26), L, fill=(255, 255, 255))
    img.save(outp)

    print(json.dumps({
        "grid": [nrows, ncols],
        "empty": [empty["cx"], empty["cy"]] if empty else None,
        "empty_score": empty["score"] if empty else None,
        "top": [top["x"], top["y"]] if top else None,
        "bottom": [bottom["x"], bottom["y"]] if bottom else None,
    }), flush=True)


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
