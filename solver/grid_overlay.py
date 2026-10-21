"""スクリーンショットにラベル付き座標グリッドを描き、セル中心を JSON で出力。
使い方: grid_overlay.py in.png out.png [cols] [rows] -> {"cols":8,"rows":8,"cells":{"A1":[x,y],...}}（0-1000）。"""
import sys, json
from PIL import Image, ImageDraw
def main(inp, outp, cols=8, rows=8, margin=0.05):
    img = Image.open(inp).convert('RGB')
    W,H = img.size
    d = ImageDraw.Draw(img)
    # グリッド領域を全辺から margin 分内側に寄せる（ラベルがプロンプトに重ならないように）
    gx0, gy0 = margin*W, margin*H
    gw, gh = (1-2*margin)*W, (1-2*margin)*H
    cells = {}
    for ci in range(cols):
        for ri in range(rows):
            L = f"{chr(65+ci)}{ri+1}"
            cx = (gx0 + (ci+0.5)/cols*gw)/W*1000
            cy = (gy0 + (ri+0.5)/rows*gh)/H*1000
            cells[L] = [round(cx,1), round(cy,1)]
    # グリッド線（余白の内側だけ）
    for ci in range(1, cols):
        x = gx0 + ci/cols*gw
        d.line([x,gy0,x,gy0+gh], fill=(255,0,0), width=1)
    for ri in range(1, rows):
        y = gy0 + ri/rows*gh
        d.line([gx0,y,gx0+gw,y], fill=(255,0,0), width=1)
    # ラベル: 列はグリッドの上、行は左に配置
    for ci in range(cols):
        L = chr(65+ci)
        x = gx0 + (ci+0.5)/cols*gw
        d.rectangle([x-9,max(0,gy0-20),x+9,max(0,gy0-20)+16], fill=(255,0,0)); d.text((x-5,max(0,gy0-20)+2), L, fill=(255,255,255))
    for ri in range(rows):
        L = str(ri+1)
        y = gy0 + (ri+0.5)/rows*gh
        d.rectangle([max(0,gx0-22),y-8,max(0,gx0-22)+18,y+8], fill=(255,0,0)); d.text((max(0,gx0-22)+4,y-7), L, fill=(255,255,255))
    img.save(outp)
    print(json.dumps({"cols":cols,"rows":rows,"margin":margin,"cells":cells}))
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], int(sys.argv[3]) if len(sys.argv)>3 else 8, int(sys.argv[4]) if len(sys.argv)>4 else 8)
