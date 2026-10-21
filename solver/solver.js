'use strict';
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth');
chromium.use(stealth());
const fs = require('fs');
const S = __dirname;
const { execSync } = require('child_process');
const proxyLine = process.env.PROXY || fs.readFileSync(process.env.PROXY_FILE || './proxy.txt','utf8').trim().split(/\s+/)[0];
const px = new URL(proxyLine.startsWith('http')?proxyLine:'http://'+proxyLine);
const TARGET = process.env.TARGET || 'https://shark-sciences-portable-region.trycloudflare.com/';

async function somBlobs(cf){
  return await cf.evaluate(()=>{
    const c=[...document.querySelectorAll('canvas')].map(e=>({e,w:e.getBoundingClientRect()})).filter(o=>o.w.width*o.w.height>0).sort((a,b)=>b.w.width*b.w.height-a.w.width*a.w.height)[0];
    if(!c) return {err:'no canvas'};
    const cv=c.e, W=cv.width, H=cv.height;
    const gx=document.createElement('canvas'); const sw=130, sh=Math.round(130*H/W);
    gx.width=sw; gx.height=sh;
    const g=gx.getContext('2d',{willReadFrequently:true}); g.drawImage(cv,0,0,sw,sh);
    const d=g.getImageData(0,0,sw,sh).data;
    const seen=new Uint8Array(sw*sh), comps=[];
    const dark=i=>((d[i*4]+d[i*4+1]+d[i*4+2])/3)<110;
    const y0=Math.round(sh*0.24), y1=Math.round(sh*0.96), x0=Math.round(sw*0.04), x1=Math.round(sw*0.96);
    for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){ const i=y*sw+x; if(seen[i]||!dark(i)) continue;
      let q=[i],sx=0,sy=0,nn=0; seen[i]=1;
      while(q.length){ const j=q.pop(),jx=j%sw,jy=(j/sw)|0; sx+=jx; sy+=jy; nn++;
        const nb=[[1,0],[-1,0],[0,1],[0,-1]];
        for(const[dx,dy]of nb){ const nx=jx+dx,ny=jy+dy; if(nx<0||ny<0||nx>=sw||ny>=sh) continue; const k=ny*sw+nx; if(!seen[k]&&dark(k)){seen[k]=1;q.push(k);} } }
      if(nn>12) comps.push({x:sx/nn/sw, y:sy/nn/sh, n:nn});
    }
    // merge <0.2 normalized dist
    comps.sort((a,b)=>b.n-a.n);
    const mg=[];
    for(const c of comps){ let hit=null;
      for(const m of mg){ if(Math.hypot(c.x-m.x,c.y-m.y)<0.2){hit=m;break;} }
      if(hit){ const t=hit.n+c.n; hit.x=(hit.x*hit.n+c.x*c.n)/t; hit.y=(hit.y*hit.n+c.y*c.n)/t; hit.n=t; }
      else mg.push({...c});
    }
    mg.sort((a,b)=>b.n-a.n);
    const r=c.w;
    return {rect:{x:r.x,y:r.y,w:r.width,h:r.height}, comps:mg.slice(0,6).map(c=>({x:c.x,y:c.y}))};
  }).catch(e=>({err:String(e)}));
}
async function somBadges(cf, pts){
  return await cf.evaluate((pts)=>{
    const olds=document.querySelectorAll('[data-som]'); olds.forEach(o=>o.remove());
    const labels='ABCDEFGH';
    pts.forEach((p,i)=>{
      const el=document.ownerElement||document;
      const s=document.createElement('div');
      s.setAttribute('data-som','1');
      s.textContent=labels[i];
      s.style.cssText=`position:fixed;left:${p.px-15}px;top:${p.py-42}px;width:30px;height:30px;border-radius:50%;background:#f00;color:#fff;font:bold 20px sans-serif;display:flex;align-items:center;justify-content:center;z-index:2147483647;border:2px solid #fff;pointer-events:none;`;
      document.body.appendChild(s);
    });
    return true;
  }, pts).catch(()=>false);
}
function bezierPts(sx,sy,tx,ty,steps){
  const dx=tx-sx, dy=ty-sy, dist=Math.hypot(dx,dy)||1;
  const f=Math.min(0.3,Math.max(0.1,dist/1000));
  const mx=(sx+tx)/2+(Math.random()*2-1)*dist*f, my=(sy+ty)/2+(Math.random()*2-1)*dist*f;
  const pts=[];
  for(let i=0;i<=steps;i++){ const t=i/steps;
    pts.push([(1-t)*(1-t)*sx+2*(1-t)*t*mx+t*t*tx, (1-t)*(1-t)*sy+2*(1-t)*t*my+t*t*ty, t]); }
  return pts;
}
async function bezierDrag(page,sx,sy,tx,ty){
  await page.mouse.move(sx,sy); await page.waitForTimeout(120+Math.random()*120);
  await page.mouse.down(); await page.waitForTimeout(80);
  for(const [x,y,t] of bezierPts(sx,sy,tx,ty,25)){
    let nx=x, ny=y;
    if(t>0.7){ const nf=t>0.9?0.9:0.4; nx+=(Math.random()*2-1)*nf; ny+=(Math.random()*2-1)*nf; }
    await page.mouse.move(nx,ny);
    const f=t<0.5?2*t*t:1-Math.pow(-2*t+2,2)/2;
    await page.waitForTimeout(Math.round((15*(1.5-0.9*f))*(0.9+Math.random()*0.2)));
  }
  await page.mouse.move(tx,ty); await page.waitForTimeout(60+Math.random()*60);
  await page.mouse.up(); await page.waitForTimeout(100);
}
function gridCells(bb){
  const out = require('child_process').execSync('python3 '+S+'/grid_overlay.py /tmp/vl_shot.png /tmp/grid_shot.png 8 8',{timeout:30000}).toString();
  return JSON.parse(out);
}
async function somClear(cf){ await cf.evaluate(()=>{document.querySelectorAll('[data-som]').forEach(o=>o.remove());}).catch(()=>{}); }

function vl(prompt){
  fs.writeFileSync('/tmp/vl_prompt.txt', prompt);
  try { var out = execSync(`python3 ${S}/vl_solve.py /tmp/vl_shot.png "$(cat /tmp/vl_prompt.txt)"`, {timeout:180000, maxBuffer:64*1024*1024}).toString(); } catch(e){ console.log('VL call failed'); return null; }
  const nums = [...out.matchAll(/"(s?[xy]|t[xy]|source|target|src|dst)"?\s*[:=]\s*(\d+)/g)].map(m=>+m[2]);
  if(nums.length>=4) return {sx:nums[0],sy:nums[1],tx:nums[2],ty:nums[3]};
  const m = out.match(/\{[^{}]*"x"\s*:\s*(\d+)[^{}]*"y"\s*:\s*(\d+)[^{}]*\}/);
  if(m) return {x:+m[1], y:+m[2]};
  const pair = [...out.matchAll(/\b(\d{2,4})\s*[,\s]\s*(\d{2,4})/g)].map(m=>[+m[1],+m[2]]).filter(p=>p[0]<=1000&&p[1]<=1000);
  if(pair.length>=2) return {sx:pair[0][0],sy:pair[0][1],tx:pair[1][0],ty:pair[1][1]};
  return null;
}
function vlRaw(prompt){ fs.writeFileSync('/tmp/vl_prompt.txt', prompt);
  try { return execSync(`python3 ${S}/vl_solve.py /tmp/vl_shot.png "$(cat /tmp/vl_prompt.txt)"`, {timeout:180000, maxBuffer:64*1024*1024}).toString(); } catch(e){ return ''; } }(async()=>{
  const browser = await chromium.launch({ headless:true, executablePath:process.env.CHROME_PATH||undefined,
    args:['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--window-size=1366,768'],
    proxy:{ server:`${px.protocol}//${px.host}`, username:decodeURIComponent(px.username), password:decodeURIComponent(px.password) } });
  const ctx = await browser.newContext({ userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36',
    viewport:{width:1366,height:768}, locale:'en-US', timezoneId:'America/New_York',
    recordVideo:{dir:'/tmp/vid', size:{width:1366,height:768}} });
  const page = await ctx.newPage();
  await page.evaluate(()=>{ window.__hcToken=null; window.addEventListener('message',e=>{ try{ const d=typeof e.data==='string'?JSON.parse(e.data):e.data; if(d&&d.source==='hcaptcha'&&d.label==='challenge-passed'){ const t=(d.contents&&d.contents.response)||d.response; if(t&&t.length>10) window.__hcToken=t; } }catch(_){} }); });
  await page.goto(TARGET,{waitUntil:'domcontentloaded',timeout:30000}).catch(e=>console.log('goto err',e.message));
  await page.evaluate(()=>{ const d=document.createElement('div'); d.id='vl-dot';
    d.style.cssText='position:fixed;width:18px;height:18px;border-radius:50%;background:rgba(255,0,0,.85);border:2px solid #fff;z-index:2147483647;pointer-events:none;left:0;top:0;';
    document.body.appendChild(d);
    document.addEventListener('mousemove',e=>{ d.style.left=(e.clientX-9)+'px'; d.style.top=(e.clientY-9)+'px'; }); });
  await page.waitForTimeout(3000);
  let cb=null;
  for(let i=0;i<20;i++){ await page.waitForTimeout(400); cb=page.frames().find(f=>f.url().includes('frame=checkbox')); if(cb) break; }
  if(!cb){ console.log('NO CHECKBOX FRAME'); await browser.close(); return; }
  await cb.waitForSelector('#checkbox',{timeout:8000}).catch(()=>{});
  await page.waitForTimeout(600); await cb.click('#checkbox').catch(e=>console.log('click err',e.message)); console.log('clicked');
  const triedByPrompt = {};
  for(let round=0; round<10; round++){
    await page.waitForTimeout(1000);
    const pre = await page.evaluate(()=>window.__hcToken||(()=>{const el=document.querySelector('textarea[name="h-captcha-response"]');return el?el.value:null;})()).catch(()=>null);
    if(pre && pre.length>10){ console.log('TOKEN-pass:', pre.slice(0,60)); fs.writeFileSync((process.env.TOKEN_OUT||(process.env.TOKEN_OUT||'/tmp/selftest_token.txt')),pre); break; }
    let cf=null, prompt=null;
    for(let i=0;i<20;i++){ await page.waitForTimeout(500); cf=page.frames().find(f=>f.url().includes('frame=challenge'));
      if(cf){ prompt=await cf.evaluate(()=>{const el=document.querySelector('.prompt-text');return el?el.textContent.trim():null;}).catch(()=>null); if(prompt) break; } }
    if(!prompt){ console.log('no prompt round',round,'- waiting'); await page.waitForTimeout(4000); continue; }
    console.log('ROUND',round,'PROMPT:',prompt);
    await page.waitForTimeout(5000);
    const ifr=await page.$('iframe[src*="frame=challenge"]'); const bb=await ifr.boundingBox();
    await page.screenshot({path:'/tmp/vl_shot.png', clip:bb});
    // E1: classify prompt first, route to correct solver
    const { classifyPrompt, logAttempt } = require(S+'/solver_core.js');
    const challengeType = classifyPrompt(prompt);
    console.log('TYPE:', challengeType);
    const isDrag = challengeType === 'drag_letter';
    const isPattern = challengeType === 'drag_shape';
    const q = isPattern
      ? `hCaptcha 520x570. Task: "${prompt}". A grid has ONE empty cell; on the RIGHT side there are TWO candidate shapes stacked vertically (top one around y=300, bottom one around y=580). The grid follows a repeating row/column pattern. Decide TOP or BOTTOM candidate, then reply ONLY JSON {"sx":N,"sy":N,"tx":N,"ty":N} 0-1000 coords: (sx,sy)=center of the CORRECT candidate shape, (tx,ty)=center of the EMPTY grid cell.`
      : isDrag
      ? `hCaptcha 520x570. Task: "${prompt}". Image shows letters and ONE empty slot/outline where a letter fits. Which letter matches the empty slot? Reply ONLY JSON {"sx":N,"sy":N,"tx":N,"ty":N} 0-1000 coords: (sx,sy)=center of THAT matching letter, (tx,ty)=center of the EMPTY slot.`
      : `hCaptcha 520x570. Task: "${prompt}". Reply ONLY JSON {"x":N,"y":N} 0-1000 coords of the correct item to click.`;
    const isDragAct = isDrag || isPattern;
    const X = v => bb.x + v/1000*bb.width, Y = v => bb.y + v/1000*bb.height;
    if(challengeType === 'drag_letter'){
      // A1+A3: detect S (filled) + T (thin-stroke slot), VLM picks pair, brute-force rest
      const { detectDragCandidates, vlmPickPair } = require(S+'/solver_core.js');
      const det = detectDragCandidates('/tmp/vl_shot.png', '/tmp/som_overlay.png');
      console.log('DET S:', (det.S||[]).map(s=>s.id).join(','), 'T:', (det.T||[]).map(t=>t.id).join(','));
      logAttempt({ prompt, type: challengeType, det });
      let solved = false;
      // build attempt order: VLM pick first, then remaining S×T combos
      let queue = [];
      if (det.S.length && det.T.length) {
        const pick = vlmPickPair('/tmp/vl_shot.png', '/tmp/som_overlay.png', prompt, det.S, det.T);
        console.log('VLM pick:', JSON.stringify(pick));
        if (pick) queue.push(pick);
        for (const s of det.S) for (const t of det.T) {
          if (!queue.some(q => q.from === s.id && q.to === t.id)) queue.push({ from: s.id, to: t.id });
        }
      }
      queue = queue.slice(0, 5); // cap attempts (rqdata TTL on enterprise)
      for (const att of queue) {
        const s = det.S.find(x => x.id === att.from);
        const t = det.T.find(x => x.id === att.to);
        if (!s || !t) continue;
        console.log(`TRY ${att.from}(${s.x},${s.y}) -> ${att.to}(${t.x},${t.y})`);
        await bezierDrag(page, X(s.x), Y(s.y), X(t.x), Y(t.y));
        await page.waitForTimeout(2500);
        const tokChk = await page.evaluate(()=>window.__hcToken||(()=>{const el=document.querySelector('textarea[name="h-captcha-response"]');return el?el.value:null;})()).catch(()=>null);
        if (tokChk && tokChk.length > 10) { solved = true; break; }
        // check for try-again (wrong answer, keep going)
        const retry = await cf.evaluate(()=>document.body.innerText.includes('try again')).catch(()=>false);
        logAttempt({ prompt, type: challengeType, attempt: att, tryAgain: retry });
        if (!retry) { await page.waitForTimeout(2000); } // maybe passed, recheck next loop
      }
      if (!solved) console.log('drag_letter attempts exhausted, moving on');
      await page.waitForTimeout(1000);
    } else if(challengeType === 'drag_shape'){
      // Pattern: detect empty cell + top/bottom candidates, VLM picks TOP/BOT, try both
      const { execSync: exP } = require('child_process');
      let pat = null;
      try {
        const out = exP(`python3 ${S}/pattern_solver.py /tmp/vl_shot.png /tmp/pattern_overlay.png`, {timeout:60000}).toString();
        pat = JSON.parse(out);
        console.log('PATTERN:', JSON.stringify(pat).slice(0,200));
      } catch(e){ console.log('pattern detect failed'); }
      if (pat && pat.empty && (pat.top || pat.bottom)) {
        // VLM 2-choice: TOP or BOTTOM?
        fs.writeFileSync('/tmp/vl_prompt.txt', `Two images: raw hCaptcha grid then SAME with EMPTY zone (blue box) and TOP/BOT candidate badges. Task: "${prompt}". The grid has a repeating pattern with ONE empty cell. Which candidate completes it? Reply ONLY JSON like {"pick":"TOP"}.`);
        let pick = null;
        try {
          const out = exP(`PYTHONPATH=${S} python3 -c "
from vl_solve import ask_multi
print(ask_multi(['/tmp/vl_shot.png','/tmp/pattern_overlay.png'], open('/tmp/vl_prompt.txt').read()))"`, {timeout:180000, maxBuffer:64*1024*1024}).toString();
          const m = out.match(/"pick"\s*:\s*"(TOP|BOT|BOTTOM)"/i);
          if (m) pick = /TOP/i.test(m[1]) ? 'top' : 'bottom';
          console.log('VLM pick:', pick, '| raw:', out.slice(0,120));
        } catch(e){ console.log('VLM pick failed'); }
        // order: VLM pick first, then the other (max 2 attempts = guaranteed coverage)
        const order = pick === 'bottom' ? ['bottom','top'] : ['top','bottom'];
        logAttempt({ prompt, type: challengeType, pat, vlmPick: pick });
        for (const which of order) {
          const src = which === 'top' ? pat.top : pat.bottom;
          if (!src) continue;
          console.log(`PATTERN TRY ${which.toUpperCase()} (${src}) -> empty (${pat.empty})`);
          await bezierDrag(page, X(src[0]), Y(src[1]), X(pat.empty[0]), Y(pat.empty[1]));
          await page.waitForTimeout(2500);
          const tokChk = await page.evaluate(()=>window.__hcToken||(()=>{const el=document.querySelector('textarea[name="h-captcha-response"]');return el?el.value:null;})()).catch(()=>null);
          if (tokChk && tokChk.length > 10) break;
          const retry = await cf.evaluate(()=>document.body.innerText.includes('try again')).catch(()=>false);
          logAttempt({ prompt, type: challengeType, attempt: which, tryAgain: retry });
          if (!retry) { await page.waitForTimeout(2000); break; }
        }
      } else {
        console.log('pattern detect incomplete, falling back to coords');
        const ans = vl(q); console.log('ANS:', JSON.stringify(ans));
        if(!ans) break;
        await bezierDrag(page, X(ans.sx), Y(ans.sy), X(ans.tx), Y(ans.ty));
        console.log('dragged');
      }
      await page.waitForTimeout(1000);
    } else if(isDragAct){
      // legacy drag path (should not trigger now that types are split, kept as safety)
      const ans = vl(q); console.log('ANS:', JSON.stringify(ans));
      if(!ans) break;
      await bezierDrag(page, X(ans.sx), Y(ans.sy), X(ans.tx), Y(ans.ty));
      console.log('dragged');
      await page.waitForTimeout(1000);
    } else {
      // SoM click: local blobs -> badge overlay -> VLM picks marker -> exact centroid click
      const tried = triedByPrompt[prompt] || (triedByPrompt[prompt] = []);
      let clicked = false;
      for(let att=0; att<3 && !clicked; att++){
        const blobs = await somBlobs(cf);
        if(blobs.err || !blobs.comps || !blobs.comps.length){ console.log('no blobs', blobs.err||'empty'); break; }
        const avail = blobs.comps.map((c,i)=>i).filter(i=>!tried.includes(i));
        if(!avail.length){ console.log('all tried'); break; }
        const labels='ABCDEFGH';
        const pts = avail.map(i=>({px: blobs.rect.x + blobs.comps[i].x*blobs.rect.w, py: blobs.rect.y + blobs.comps[i].y*blobs.rect.h, ci:i}));
        await somBadges(cf, pts);
        await page.waitForTimeout(400);
        await page.screenshot({path:'/tmp/vl_shot.png', clip:bb});
        const out = vlRaw(`hCaptcha with red letter badges ${avail.map(i=>labels[avail.indexOf(i)]).join(',')} on candidate icons. Task: "${prompt}". Reply ONLY JSON like {"mark":"B"} naming the badge on the CORRECT item to click.`);
        await somClear(cf);
        const mm = out.match(/"mark"\s*:\s*"([A-H])"/i);
        if(!mm){ console.log('VL mark parse fail, retry'); continue; }
        const li = labels.indexOf(mm[1].toUpperCase());
        if(li<0 || li>=pts.length){ console.log('VL mark out of range', mm[1]); continue; }
        const pick = pts[li];
        tried.push(pick.ci);
        await page.mouse.click(bb.x + blobs.rect.x + blobs.comps[pick.ci].x*blobs.rect.w, bb.y + blobs.rect.y + blobs.comps[pick.ci].y*blobs.rect.h);
        console.log('SoM clicked', mm[1]);
        clicked = true;
      }
      if(!clicked){
        // smart-grid fallback: image-aligned cells -> VLM picks cells -> exact centers
        try {
          await page.screenshot({path:'/tmp/vl_shot.png', clip:bb});
          const { execSync: exS } = require('child_process');
          const spec = JSON.parse(exS(`python3 ${S}/smart_grid.py /tmp/vl_shot.png /tmp/grid_shot.png`, {timeout:30000}).toString());
          console.log('smart grid:', spec.grid.join('x'));
          const { execSync: ex3 } = require('child_process');
          fs.writeFileSync('/tmp/vl_prompt.txt', `Two images: raw hCaptcha then SAME with red-labeled grid cells. Task: "${prompt}". Reply ONLY JSON like {"cells":["B2","C3"]} listing cells with CORRECT items.`);
          const out = ex3(`PYTHONPATH=${S} python3 -c "
from vl_solve import ask_multi
print(ask_multi(['/tmp/vl_shot.png','/tmp/grid_shot.png'], open('/tmp/vl_prompt.txt').read()))"`, {timeout:180000, maxBuffer:64*1024*1024}).toString();
          const ms = [...out.matchAll(/"([A-H][1-8]|R\d+C\d+)"/gi)].map(m=>m[1].toUpperCase()).filter((v,i,a)=>a.indexOf(v)===i);
          let valid = ms.filter(c=>spec.cells[c]);
          // B1: empty-cell guard — drop cells with no content
          try {
            const { checkCellsHaveContent } = require(S+'/solver_core.js');
            const guard = checkCellsHaveContent('/tmp/vl_shot.png', spec);
            if (guard) {
              const before = valid.length;
              valid = valid.filter(c => guard[c] && guard[c].has_content);
              console.log(`guard: ${before} -> ${valid.length} cells (${valid.join(',')})`);
              logAttempt({ prompt, type: challengeType, gridCells: ms, guardFiltered: valid });
            }
          } catch(e){ console.log('guard unavailable, using unfiltered'); }
          if(valid.length){
            for(const c of valid.slice(0,4)){
              const cc = spec.cells[c];
              await page.mouse.click(bb.x+cc[0]/1000*bb.width, bb.y+cc[1]/1000*bb.height);
              await page.waitForTimeout(400);
            }
            console.log('grid clicked', valid.join(','));
            clicked = true;
          } else console.log('grid: no valid cells');
        } catch(e){ console.log('grid fallback unavailable'); }
      }
      if(!clicked){
        // fallback: coords-VL (DOM grids / no-canvas tasks)
        console.log('SoM unavailable, coords fallback');
        await page.screenshot({path:'/tmp/vl_shot.png', clip:bb});
        const ans2 = vl(`hCaptcha 520x570. Task: "${prompt}". Reply ONLY JSON {"x":N,"y":N} 0-1000 coords of the correct item to click.`);
        if(ans2 && ans2.x!==undefined){
          await page.mouse.click(X(ans2.x),Y(ans2.y));
          console.log('fallback clicked', ans2.x, ans2.y);
          clicked = true;
        } else { console.log('fallback parse fail'); break; }
      }
      await page.waitForTimeout(1000);
    }
    const vb = await cf.evaluate(()=>{ const els=[...document.querySelectorAll('button,div[role="button"]')]; const b=els.find(e=>/verify|next|submit/i.test(e.textContent||'')); if(!b) return null; const r=b.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2}; }).catch(()=>null);
    if(vb){ const fr2=await ifr.boundingBox(); await page.mouse.click(fr2.x+vb.x, fr2.y+vb.y); console.log('verify clicked'); }
    await page.waitForTimeout(5000);
    const tok = await page.evaluate(()=>window.__hcToken||(()=>{const el=document.querySelector('textarea[name="h-captcha-response"]');return el?el.value:null;})()).catch(()=>null);
    if(tok && tok.length>10){ console.log('TOKEN:', tok.slice(0,60)); fs.writeFileSync((process.env.TOKEN_OUT||(process.env.TOKEN_OUT||'/tmp/selftest_token.txt')),tok); break; }
  }
  await browser.close();
})().catch(e=>{console.error('FATAL',e);process.exit(1);});
