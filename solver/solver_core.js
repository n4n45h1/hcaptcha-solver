'use strict';
/**
 * Solver core: improved drag/grid logic for normal hCaptcha.
 *
 * - E1: prompt classification (delegated to prompt_classify.py, mirrored here for speed)
 * - A1: source detection (filled blobs = S, thin-stroke = T)
 * - A3: brute-force S×T with checkcaptcha judgment
 * - B1: empty-cell guard for grid clicks
 * - E2: JSONL attempt logging
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

// B1: check a 0-1000 cell has content via cell_guard.py
function checkCellsHaveContent(shotPath, cellsSpec) {
  try {
    const out = execSync(
      `python3 ${__dirname}/cell_guard.py "${shotPath}"`,
      { input: JSON.stringify(cellsSpec), timeout: 15000 }
    ).toString();
    return JSON.parse(out);
  } catch (e) {
    return null; // guard unavailable -> allow all
  }
}

// A1 helper: run som_detect.py, returns {S:[...], T:[...]}
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

// VLM: pick which S matches which T (classification, not coords)
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
  } catch (e) { /* fallthrough */ }
  return null;
}

module.exports = { logAttempt, classifyPrompt, checkCellsHaveContent, detectDragCandidates, vlmPickPair };
