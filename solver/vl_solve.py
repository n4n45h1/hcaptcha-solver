import base64, json, urllib.request, time, sys, re, os
H={"Content-Type":"application/json","User-Agent":"Mozilla/5.0 Chrome/133"}
API=os.environ.get("VL_API", "").strip()
MODELS = os.environ.get("VL_MODELS","MiniMaxAI/MiniMax-M3,zai-org/GLM-5.3-Flash").split(",")
COORD = re.compile(r'"(?:(?:s|t)?[xy]|cells?|mark|from)"?\s*:\s*(\[?\s*"?[\w\d]+)')
def _ask_multi(imgpaths, prompt, model):
    if not API:
        raise ValueError("VL_API に画像対応APIのURLを設定してください")
    imgs = []
    for p in imgpaths:
        imgs.append({"type":"image_url","image_url":{"url":"data:image/png;base64,"+base64.b64encode(open(p,'rb').read()).decode()}})
    body = {"model":model,"messages":[{"role":"user","content":[{"type":"text","text":prompt}]+imgs}],
      "max_tokens":300}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers=H)
    r = urllib.request.urlopen(req, timeout=180)
    return json.loads(r.read().decode())["choices"][0]["message"]["content"]
def ask_multi(imgpaths, prompt, model=None):
    models = [model] if model else MODELS
    last = "no coords in any reply"
    for m in models:
        try: t = _ask_multi(imgpaths, prompt, m)
        except Exception as e: last = str(e)[:100]; continue
        if COORD.search(t): return t
        last = t[:100]
    raise RuntimeError(last)
def _ask(imgpath, prompt, model):
    if not API:
        raise ValueError("VL_API に画像対応APIのURLを設定してください")
    img = base64.b64encode(open(imgpath,'rb').read()).decode()
    body = {"model":model,"messages":[{"role":"user","content":[
      {"type":"text","text":prompt},
      {"type":"image_url","image_url":{"url":"data:image/png;base64,"+img}}]}],
      "max_tokens":300}
    req = urllib.request.Request(API, data=json.dumps(body).encode(), headers=H)
    r = urllib.request.urlopen(req, timeout=180)
    j = json.loads(r.read().decode())
    return j["choices"][0]["message"]["content"]
def ask(imgpath, prompt, model=None):
    """座標などを読み取れる返答が来るまで、モデルを順に試す。"""
    models = [model] if model else MODELS
    last = "no coords in any reply"
    for m in models:
        try:
            t = _ask(imgpath, prompt, m)
        except Exception as e:
            last = str(e)[:100]; continue
        if COORD.search(t):
            return t
        last = t[:100]
    raise RuntimeError(last)
if __name__ == "__main__":
    print(ask(sys.argv[1], sys.argv[2]))
