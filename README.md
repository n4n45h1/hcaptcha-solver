# hcaptcha-solver

Browser-driven hCaptcha solver. Stealth Chromium opens the target page, classifies the
challenge, uses a VLM for cell / candidate selection, then returns the `P1_` token.

Normal (non-Enterprise) flow only.

## How it works

```
open page (stealth Chromium + proxy)
  -> wait for challenge iframe
  -> prompt classifier        solver_core.js : classifyPrompt()
  -> per-type path
       click_grid / click_single : smart_grid.py (image-aligned grid) + VLM cells
                                   -> cell_guard.py drops empty cells
       drag_letter               : som_detect.py candidate badges (S/T)
                                   -> VLM pick -> brute-force queue
       drag_shape (pattern)      : pattern_solver.py empty-cell + TOP/BOT candidates
  -> mouse actions (bezier drag, click centers)
  -> Verify button click      <-- required, most failures come from skipping this
  -> read P1_ token from h-captcha-response / challenge-passed message
```

## Requirements

- Node 18+, Python 3.10+ (`pillow`, `numpy`)
- Playwright Chromium (`npx playwright install chromium`); set `CHROME_PATH` if the
  bundled revision does not match
- An HTTPS proxy (residential recommended)
- A vision endpoint exposing an OpenAI-compatible `/v1/chat/completions`

## Usage

```bash
npm install
pip install pillow numpy

export PROXY='http://user:pass@host:port'
export TARGET='https://your-test-page.example/'
export CHROME_PATH="$HOME/.cache/ms-playwright/chromium-1234/chrome-linux/chrome"
node solver/solver.js
```

Token is written to `TOKEN_OUT` (default `/tmp/selftest_token.txt`) and starts with `P1_`.

### Environment

| var | default | purpose |
|---|---|---|
| `PROXY` | read `./proxy.txt` | proxy URL, one per line |
| `TARGET` | bundled test tunnel | page that hosts the widget |
| `TOKEN_OUT` | `/tmp/selftest_token.txt` | token output path |
| `CHROME_PATH` | Playwright default | Chromium binary |
| `VL_API` | freeapi endpoint | OpenAI-compatible chat completions URL |
| `VL_MODELS` | `MiniMaxAI/MiniMax-M3,zai-org/GLM-5.3-Flash` | comma-separated model fallback list |

`vl_solve.py` reads `VL_API` / `VL_MODELS` when set.

## Files

| file | role |
|---|---|
| `solver/solver.js` | orchestrator: browser, challenge loop, verify, token capture |
| `solver/solver_core.js` | prompt classifier, JSONL logging, candidate/VLM bridges |
| `solver/smart_grid.py` | detects real grid lines, snaps labels to cells |
| `solver/grid_overlay.py` | fixed 8x8 overlay (legacy path) |
| `solver/cell_guard.py` | content score per cell, filters empty cells |
| `solver/som_detect.py` | Set-of-Marks badges for drag letter / slot candidates |
| `solver/pattern_solver.py` | pattern-completion candidate generator |
| `solver/prompt_classify.py` | standalone prompt -> type classifier |
| `solver/vl_solve.py` | VLM client, multi-image prompts, model fallback |

## Notes

- A `P1_` token is single-use and short-lived (~120 s).
- The Verify button must be clicked after the drag/click actions; without it the
  challenge never resolves.
- Wrong answers consume rounds. Once the challenge stops rendering, start a fresh
  browser context (new session, new proxy exit if possible).
- Semantic prompts ("pick the thing that is soft and flexible") rely entirely on the
  VLM's world knowledge; the empty-cell guard only removes structurally empty cells.

## Status

- click challenges: working
- drag_letter: candidate detection + brute-force queue implemented, live success rate
  still being measured
- pattern (drag_shape): implemented, unverified
