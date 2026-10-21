'use strict';
/**
 * ソルバーの中核: 通常の hCaptcha 向けにドラッグとグリッド処理を改善。
 *
 * - E1: プロンプト分類（prompt_classify.py に委譲し、高速化のためここにも同じ処理を置く）
 * - A1: ドラッグ元の検出（塗りつぶした塊 = S、細線 = T）
 * - A3: checkcaptcha の判定で S×T を総当たり
 * - B1: グリッドクリック用の空セルガード
 * - E2: 試行ログを JSONL で記録
 */
const fs = require('fs');
const { execSync } = require('child_process');

const LOG_FILE = '/tmp/solver_attempts.jsonl';

function logAttempt(entry) {
  entry.ts = new Date().toISOString();
  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n');
}

function classifyPrompt(prompt) {
  const p = (prompt || '').toLowerCase();
  const rules = [
    ['drag_letter', /drag.*letter|letter.*fits|place.*fits|matching outline|put.*correct.*into/],
    ['drag_shape', /drag.*shape|completes?.*pattern|pattern|empty cell|place the/],
    ['click_2choice', /different|incorrectly|odd one/],
    ['click_grid', /click on things|click on each|click.*all|select.*all|tap on|pick the thing/],
    ['click_single', /click on the|select the|pick.*that is/],
  ];
  for (const [type, re] of rules) {
    if (re.test(p)) return type;
  }
  return 'unknown';
}

// B1: cell_guard.py で 0-1000 座標のセルに中身があるか確認
function checkCellsHaveContent(shotPath, cellsSpec) {
  try {
    const out = execSync(
      `python3 ${__dirname}/cell_guard.py "${shotPath}"`,
      { input: JSON.stringify(cellsSpec), timeout: 15000 }
    ).toString();
    return JSON.parse(out);
  } catch (e) {
    return null; // ガードが使えなければ全セルを許可
  }
}

// A1 ヘルパー: som_detect.py を実行し、{S:[...], T:[...]} を返す
function detectDragCandidates(shotPath, overlayPath) {
  try {
    const out = execSync(
      `python3 ${__dirname}/som_detect.py "${shotPath}" "${overlayPath}"`,
      { timeout: 30000 }
    ).toString();
    return JSON.parse(out);
  } catch (e) {
    return { S: [], T: [] };
  }
}

// VLM: どの S がどの T に合うか選ぶ（座標指定ではなく分類）
function vlmPickPair(shotPath, overlayPath, prompt, sources, targets) {
  const srcDesc = sources.map(s => `${s.id}@(${s.x},${s.y})`).join(' ');
  const tgtDesc = targets.map(t => `${t.id}@(${t.x},${t.y})`).join(' ');
  const q = `Two images: raw hCaptcha then SAME with green S badges on letter candidates (${srcDesc}) and blue T badges on empty-slot candidates (${tgtDesc}). Task: "${prompt}". Which letter fits which empty slot? Reply ONLY JSON like {"from":"S2","to":"T1"}.`;
  fs.writeFileSync('/tmp/vl_prompt.txt', q);
  try {
    const out = execSync(
      `python3 ${__dirname}/vl_solve.py /tmp/vl_shot.png "$(cat /tmp/vl_prompt.txt)"`,
      { timeout: 180000, maxBuffer: 64 * 1024 * 1024 }
    ).toString();
    const m = out.match(/"from"\s*:\s*"(S\d)"[^}]*"to"\s*:\s*"(T\d)"/i);
    if (m) return { from: m[1].toUpperCase(), to: m[2].toUpperCase(), raw: out.slice(0, 500) };
  } catch (e) { /* 後続の処理へ */ }
  return null;
}

module.exports = { logAttempt, classifyPrompt, checkCellsHaveContent, detectDragCandidates, vlmPickPair };
