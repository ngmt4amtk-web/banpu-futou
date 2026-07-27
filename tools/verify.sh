#!/bin/zsh
# 萬夫不當 グラフィック検証ハーネス — 完了条件を機械判定する
set -e
SP=/private/tmp/claude-501/-Users-ngmt-mtk/0ac48f99-5d3e-4308-801c-98ac6cf80427/scratchpad
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
PORT=8899
TAG=${1:-v}

pkill -f "http.server $PORT" 2>/dev/null || true
sleep 0.4
cd ~/banpu-futou && (python3 -m http.server $PORT >/dev/null 2>&1 &)
sleep 1.2

echo "── 構文 ──"
for f in data.js gfx.js game.js ui.js; do
  node --check ~/banpu-futou/$f >/dev/null 2>&1 && echo "  OK $f" || { echo "  NG $f"; node --check ~/banpu-futou/$f; exit 1; }
done

echo "── 5戦場のスクリーンショット（430x932・75秒経過時点） ──"
for st in guangzong hulao changban chibi wuzhangyuan; do
  "$CHROME" --headless=new --disable-gpu --no-sandbox --window-size=430,932 \
    --virtual-time-budget=90000 --screenshot="$SP/${TAG}_$st.png" \
    "http://127.0.0.1:$PORT/?demo=75&stage=$st" >/dev/null 2>&1
  echo "  $st"
done

echo "── 一灯の落ち幅（開幕直後＝ほぼ布だけの画面で実測） ──"
"$CHROME" --headless=new --disable-gpu --no-sandbox --window-size=430,932 \
  --virtual-time-budget=12000 --screenshot="$SP/${TAG}_lamp.png" \
  "http://127.0.0.1:$PORT/?demo=0.2" >/dev/null 2>&1

echo "── 自動プレイ全数（10武将 × 5戦場 × 90秒） ──"
"$CHROME" --headless=new --disable-gpu --no-sandbox --virtual-time-budget=600000 \
  --dump-dom "http://127.0.0.1:$PORT/?selftest=90&all=1" 2>/dev/null > "$SP/${TAG}_st.html"

python3 - "$TAG" <<'EOF'
import sys, re, html, json
from PIL import Image, ImageStat
TAG = sys.argv[1]
SP = '/private/tmp/claude-501/-Users-ngmt-mtk/0ac48f99-5d3e-4308-801c-98ac6cf80427/scratchpad/'
s = open(SP + TAG + '_st.html').read()
m = re.search(r'<pre[^>]*>(.*?)</pre>', s, re.S)
ok_title = 'SELFTEST_OK' in s
if m:
    d = json.loads(html.unescape(m.group(1)))
    bad = [x for x in d if x['errors'] or not x['ok']]
    print(f"\n条件1 自動プレイ: {len(d)}通り / エラー {len(bad)}件 / title {'OK' if ok_title else 'FAIL'}"
          f"  → {'合格' if (not bad and ok_title and len(d)==15) else '不合格'}")
    if bad: print("   ", bad[:2])
    import statistics as st
    print(f"   lv中央値 {st.median(x['lv'] for x in d)} / 討伐中央値 {st.median(x['kills'] for x in d)}"
          f" / 90秒以内の死亡 {sum(1 for x in d if x['hp']==0)}/{len(d)}")
else:
    print("\n条件1 自動プレイ: 結果要素なし → 不合格")

print("\n条件3 一灯の落ち幅 — 画面端の布が中心の何割の明るさで残るか")
im = Image.open(f'{SP}{TAG}_lamp.png').convert('L'); W,H = im.size
def patch(cx, cy, r=26):
    return ImageStat.Stat(im.crop((max(0,cx-r), max(0,cy-r), min(W,cx+r), min(H,cy+r)))).mean[0]
c = patch(W//2, int(H*0.42))
pts = {'上端':(W//2,int(H*0.10)), '下端':(W//2,int(H*0.92)), '左端':(int(W*0.05),H//2), '右端':(int(W*0.95),H//2),
       '左上隅':(int(W*0.07),int(H*0.10)), '右下隅':(int(W*0.93),int(H*0.92))}
ks = {}
for n,(x,y) in pts.items():
    ks[n] = patch(x,y)/c if c else 0
    print(f"  {n}: {ks[n]*100:5.1f}%")
mn = min(ks.values())
open(SP+'_k.txt','w').write(str(round(mn,3)))
print(f"  最悪 {mn*100:.1f}% → {'合格' if mn >= 0.62 else '不合格'}（目標62%以上＝これを割ると布と人形の差が3.5:1を切る）")
print("  ※旧条件3(領域別SD)は敵の湧き位置のランダム性を測ってしまい指標として無効だったので差し替えた")
EOF

echo "\n── 条件2 コントラスト比（コードから直接） ──"
python3 - <<'EOF'
import re
def L(h):
    h=h.lstrip('#'); r,g,b=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=lambda c: c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4
    return 0.2126*f(r)+0.7152*f(g)+0.0722*f(b)
import os
gfx = open(os.path.expanduser('~/banpu-futou/gfx.js')).read()
dat = open(os.path.expanduser('~/banpu-futou/data.js')).read()
sh = dict(re.findall(r"(\w+): '(#[0-9a-f]{6})'", re.search(r'const SHADOW = \{(.*?)\}', gfx, re.S).group(1)))
grounds = re.findall(r"name: '(.+?)',.*?ground: '(#[0-9a-f]{6})'", dat, re.S)
K = float(open('/private/tmp/claude-501/-Users-ngmt-mtk/0ac48f99-5d3e-4308-801c-98ac6cf80427/scratchpad/_k.txt').read())  # 条件3で実測した画面端の残光率
worst = (99, '')
for name, g in grounds:
    for f, b in sh.items():
        r = (K*L(g)+0.05)/(K*L(b)+0.05)
        if r < worst[0]: worst = (r, f'{name} × {f}')
    rs = [(K*L(g)+0.05)/(K*L(b)+0.05) for b in sh.values()]
    print(f"  {name:5} 布{g}  雑兵との比 {min(rs):.2f}〜{max(rs):.2f} : 1")
print(f"  最悪 {worst[0]:.2f}:1 ({worst[1]}) → {'合格' if worst[0] >= 3.5 else '不合格'}（目標3.5:1）")
EOF
pkill -f "http.server $PORT" 2>/dev/null || true
