"""プロンプト分類: hCaptcha のプロンプトをチャレンジ種別とソルバーの振り分け先に正規化。
使い方: prompt_classify.py "prompt text" -> {"type": "drag_letter", "solver": "som_drag", ...}
"""
import sys
import json
import re

RULES = [
    # （種別、ソルバー、パターン）
    ("drag_letter", "som_drag", [
        r"drag.*letter", r"letter.*fits", r"place.*fits",
    ]),
    ("drag_shape", "pattern_drag", [
        r"drag.*shape", r"completes?.*pattern", r"pattern",
        r"empty cell", r"place the",
    ]),
    ("click_2choice", "som_click", [
        r"different", r"incorrectly", r"odd one",
    ]),
    ("click_grid", "grid_click", [
        r"click on things", r"click on each", r"click.*all",
        r"select.*all", r"tap on",
    ]),
    ("click_single", "som_click", [
        r"click on the", r"select the",
    ]),
]


def classify(prompt):
    p = prompt.lower()
    for ctype, solver, patterns in RULES:
        for pat in patterns:
            if re.search(pat, p):
                return {
                    "type": ctype,
                    "solver": solver,
                    "prompt": prompt,
                    "matched_pattern": pat,
                }
    return {"type": "unknown", "solver": "skip", "prompt": prompt, "matched_pattern": None}


def main():
    prompt = sys.argv[1] if len(sys.argv) > 1 else ""
    print(json.dumps(classify(prompt)))


if __name__ == "__main__":
    main()
