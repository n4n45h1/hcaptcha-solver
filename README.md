# hcaptcha-solver

ブラウザで問題を開いて、VLMに画像を見せて、クリックやドラッグまでやるsolver。
Playwright + stealth Chromiumで動かして、通ったら `P1_` トークンを拾います。

今はnormal版がメイン。まだ調整中なので、「どの問題でも一発で通る」感じではないです。

## 動いてるところ

開発中に撮った録画です。今のコードそのままのベンチではなく、動きの雰囲気を見る用。

| デモ | 内容 |
|---|---|
| [文字をドラッグ](demos/solve_demo.webm) | 文字を空き枠に合わせる、1ラウンド |
| [鏡像を選ぶ](demos/solve_demo3.webm) | クリック問題を2ラウンド |
| [仲間外れ・車両の問題](demos/solve_demo5.webm) | 問題が切り替わりながら4ラウンド |

録画は全部で5本。[demos/](demos/) にまとめてあります。GitHubで再生されない場合は動画ファイルをダウンロードして見てください。

## ざっくり構成

```text
ブラウザ起動 → 問題のiframeを待つ → 問題文からタイプを分類
  click系   : マーカーやグリッドを重ねる → VLMで選択 → 空セルを除外
  文字drag  : 文字と空き枠にS/Tラベル → VLMでペア選択 → 残りの候補も試す
  pattern系 : 空セルと上下の候補を検出 → VLMで二択
→ マウス操作 → Verify → トークン回収
```

ドラッグしただけでは終わらず、最後の **Verifyが必要**。ここを忘れるとずっと待つことになります。

## 動かす

Node.js 18以上、Python 3.10以上が必要です。画像付きリクエストに対応したOpenAI互換APIも別途用意してください。APIの接続先は同梱していません。

```bash
npm install
pip install pillow numpy
npx playwright install chromium

export PROXY='http://user:pass@host:port'
export TARGET='https://your-test-page.example/'
export VL_API='https://your-vlm.example/v1/chat/completions'
# 使うAPIで提供されているモデルIDを指定
export VL_MODELS='your-vision-model'

npm start
```

トークンの出力先は `TOKEN_OUT`。デフォルトは `/tmp/selftest_token.txt` です。
`.env.example` は設定項目の見本で、自動では読み込みません。シェルで環境変数を渡してください。

## 設定

| 環境変数 | デフォルト | 用途 |
|---|---|---|
| `PROXY` | `./proxy.txt` の先頭URL | プロキシ接続先 |
| `PROXY_FILE` | `./proxy.txt` | `PROXY` を省略したときに読むファイル |
| `TARGET` | 開発時のテスト用トンネル | widgetがあるページ。自分のURLを指定推奨 |
| `TOKEN_OUT` | `/tmp/selftest_token.txt` | トークンの保存先 |
| `CHROME_PATH` | Playwright標準 | Chromiumを手動指定するときのパス |
| `VL_API` | なし・必須 | OpenAI互換のchat completions URL |
| `VL_MODELS` | `MiniMaxAI/MiniMax-M3,zai-org/GLM-5.3-Flash` | モデルID。カンマ区切りで順に試す |

Chromiumのバージョンが環境と合わないときは、`CHROME_PATH` で実体を指定できます。
APIクライアントは現状、認証ヘッダーを付けない構成です。

## ファイル案内

| ファイル | やっていること |
|---|---|
| `solver/solver.js` | ブラウザ起動から問題処理、Verify、トークン回収までの本体 |
| `solver/solver_core.js` | 問題文の分類、JSONLログ、画像処理とVLMのつなぎ |
| `solver/smart_grid.py` | 画像に合わせてグリッドを重ね、セル中心を返す |
| `solver/grid_overlay.py` | 固定8×8のグリッド。旧経路で使用 |
| `solver/cell_guard.py` | セル内の色や変化量を見て、空っぽのセルを落とす |
| `solver/som_detect.py` | ドラッグする文字と空き枠にS/Tラベルを付ける |
| `solver/pattern_solver.py` | パターン問題の空セルと候補を拾う |
| `solver/prompt_classify.py` | 問題文の分類を単体で試す用 |
| `solver/vl_solve.py` | 画像付きAPIリクエストとモデルのフォールバック |

## 今のところ

- click系は動作確認済み。ただし、問題ごとの精度にはまだムラあり。
- 文字dragは候補検出と総当たりキューまで実装済み。実戦での成功率は検証中。
- pattern系は実装済み、突破は未確認。
- 「柔らかくて曲がるものを選ぶ」みたいな意味理解はVLM頼み。空セルガードで答えの意味までは判定しません。
- 誤答が続いて問題が出なくなったら、いったん新しいブラウザセッションでやり直す形です。

トークンは一回限りで、寿命も短め（検証時は約120秒）。保存できたからといって、後でずっと使えるわけではないです。
