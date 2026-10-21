"""Letter/slot detection v2: texture-suppress via grayscale open, drop giant bg.
Usage: som_detect.py in.png out.png -> {"S":[...],"T":[...]} 0-1000."""
import sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFilter
from collections import deque
def comps(mask, min_n=40):
    H,W = mask.shape; seen=np.zeros_like(mask,bool); out=[]
    for y in range(H):
        for x in range(W):
            if seen[y,x] or not mask[y,x]: continue
            q=deque([(x,y)]); seen[y,x]=True; sx=sy=n=0
            x0=y0=10**9; x1=y1=-1
            while q:
                cx,cy=q.popleft(); sx+=cx; sy+=cy; n+=1
                x0=min(x0,cx);x1=max(x1,cx);y0=min(y0,cy);y1=max(y1,cy)
                for dx,dy in ((2,0),(-2,0),(0,2),(0,-2)):
                    nx,ny=cx+dx,cy+dy
                    if 0<=nx<W and 0<=ny<H and not seen[ny,nx] and mask[ny,nx]:
                        seen[ny,nx]=True; q.append((nx,ny))
            if n>=min_n: out.append([sx/n,sy/n,n,x0,y0,x1,y1])
    return out
def main(inp, outp):
    img = Image.open(inp).convert('RGB')
    W,H = img.size
    a = np.asarray(img).astype(int)
    mx, mn = a.max(axis=2), a.min(axis=2)
    sat = np.where(mx==0,0,(mx-mn)/np.maximum(mx,1))
    lum = Image.fromarray((a.sum(axis=2)/3).astype(np.uint8))
    opened = np.asarray(lum.filter(ImageFilter.MinFilter(7)).filter(ImageFilter.MaxFilter(7)))
    zone = np.zeros((H,W), bool); zone[int(H*0.27):int(H*0.86), int(W*0.05):int(W*0.95)] = True
    solid = zone & (opened < 100) & (sat > 0.12)
    allc = comps(solid)
    allc = [c for c in allc if c[2] < 0.25*W*H]  # drop giant bg
    mg=[]
    for c in sorted(allc,key=lambda c:-c[2]):
        for m in mg:
            if ((c[0]-m[0])**2+(c[1]-m[1])**2)**.5 < 0.09*W:
                t=m[2]+c[2]
                m[0]=(m[0]*m[2]+c[0]*c[2])/t; m[1]=(m[1]*m[2]+c[1]*c[2])/t; m[2]=t
                m[3]=min(m[3],c[3]);m[4]=min(m[4],c[4]);m[5]=max(m[5],c[5]);m[6]=max(m[6],c[6])
                break
        else: mg.append(c)
    cands=[]
    for x,y,n,x0,y0,x1,y1 in mg:
        bw,bh = max(1,x1-x0+1), max(1,y1-y0+1)
        cands.append({"x":x/W*1000,"y":y/H*1000,"n":n,"fill":n/(bw*bh),"cx":x,"cy":y})
    cands.sort(key=lambda c:-c["n"])
    for c in cands: c["role"] = "T" if c["fill"]<0.30 else "S"
    ss=[c for c in cands if c["role"]=="S"][:5]
    ts=[c for c in cands if c["role"]=="T"][:4]
    # thin-stroke slot scan on original (outlines): low fill but bigger
    res={"S":[{"id":f"S{i+1}","x":round(c["x"]),"y":round(c["y"])} for i,c in enumerate(ss)],
           "T":[{"id":f"T{i+1}","x":round(c["x"]),"y":round(c["y"])} for i,c in enumerate(ts)]}
    d = ImageDraw.Draw(img)
    for i,c in enumerate(ss):
        x,y = c["cx"],c["cy"]; L=f"S{i+1}"
        d.ellipse([x-15,y-30,x+15,y-2],fill=(0,150,0),outline=(255,255,255),width=2); d.text((x-5,y-26),L,fill=(255,255,255))
    for i,c in enumerate(ts):
        x,y = c["cx"],c["cy"]; L=f"T{i+1}"
        d.ellipse([x-15,y-30,x+15,y-2],fill=(0,80,220),outline=(255,255,255),width=2); d.text((x-5,y-26),L,fill=(255,255,255))
    img.save(outp)
    print(json.dumps(res))
if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
