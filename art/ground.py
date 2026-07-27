#!/usr/bin/env python3
"""生成した地面テクスチャを、継ぎ目のないタイルへ落とす。

継ぎ目消しの方式:
  「半分ずらして十字をぼかす」定番手法は使わない。ずらすと元の縁が中央の十字に来るが、
  その十字は枠の端まで届くので、枠際では「ずらした側の十字」と「元の側の縁」が
  同時に破綻し、どちらを使っても継ぎ目が残る。
  代わりに片軸ずつ「右端の帯を左端へ重ねてから右端を切り落とす」。
  切った後の左端は元画像の w-f 列、右端は w-f-1 列＝元画像で隣り合う列なので、
  数学的に継ぎ目が出ない。代償は各軸2割の面積。

色の作り方:
  テクスチャは明暗だけ使い、色相は data.js の戦場色から掛ける。
  生成物の色がぶれても戦場ごとのパレットが崩れないようにするため。
"""
import os, sys, json
import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ART, 'raw')

TILE = 256          # 世界座標でのタイル一辺。ZOOM 0.78 で画面上 200px

# data.js の ground と揃える。ここを真とせず data.js に合わせて直す
STAGE = {
    'guangzong':   (0x23, 0x20, 0x2e),
    'hulao':       (0x26, 0x1a, 0x24),
    'changban':    (0x1b, 0x26, 0x22),
    'chibi':       (0x14, 0x1f, 0x2e),
    'wuzhangyuan': (0x1e, 0x22, 0x2b),
}


def seam_axis(a, axis, frac=0.2):
    a = np.moveaxis(a, axis, 1)
    w = a.shape[1]
    f = max(2, int(w * frac))
    ramp = np.linspace(0.0, 1.0, f).reshape(1, -1, 1)
    out = a.copy()
    out[:, :f] = a[:, :f] * ramp + a[:, w - f:] * (1.0 - ramp)
    out = out[:, :w - f]
    return np.moveaxis(out, 1, axis)


def make_seamless(a):
    return seam_axis(seam_axis(a, 1), 0)


def luminance(a):
    return a[..., 0] * 0.30 + a[..., 1] * 0.59 + a[..., 2] * 0.11


def build(stage, src):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255.0
    a = make_seamless(a)
    L = luminance(a)

    # 明暗を 0..1 へ正規化してから振り幅を絞る。生成物のコントラストに左右されないため
    lo, hi = np.percentile(L, 3), np.percentile(L, 97)
    L = np.clip((L - lo) / max(1e-6, hi - lo), 0.0, 1.0)
    # 平均は 1.0 に置く。ここを下げると地面が元の戦場色より暗くなり、ただ黒く沈む
    L = 1.0 + 0.80 * (L - 0.5)           # 元の戦場色のまわりに ±40%

    base = np.array(STAGE[stage], dtype=np.float32) / 255.0
    out = np.clip(base.reshape(1, 1, 3) * L[..., None], 0.0, 1.0)

    im = Image.fromarray((out * 255).astype(np.uint8), 'RGB')
    im = im.resize((TILE, TILE), Image.LANCZOS)
    im.save(os.path.join(ART, 'g_' + stage + '.png'), optimize=True)

    # ローダーは manifest にある鍵しか読まないので地面も登録する
    mp = os.path.join(ART, 'manifest.json')
    man = json.load(open(mp)) if os.path.exists(mp) else {}
    man['g_' + stage] = {'w': TILE, 'h': TILE, 'kind': 'ground'}
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
    return im.size


def check_seam(stage):
    """出来上がったタイルの、上下端と左右端の段差を測る。0に近いほど継ぎ目が無い"""
    a = np.asarray(Image.open(os.path.join(ART, 'g_' + stage + '.png'))).astype(np.float32)
    dx = np.abs(a[:, 0] - a[:, -1]).mean()
    dy = np.abs(a[0, :] - a[-1, :]).mean()
    # 比較対象: 画像内部の隣り合う列の平均差（これと同程度なら継ぎ目は見えない）
    inner = np.abs(a[:, 1:] - a[:, :-1]).mean()
    return dx, dy, inner


if __name__ == '__main__':
    for stage in STAGE:
        src = os.path.join(RAW, 'g_' + stage + '.png')
        if not os.path.exists(src):
            print('skip (未生成):', stage)
            continue
        sz = build(stage, src)
        dx, dy, inner = check_seam(stage)
        print(f'{stage:12s} {sz}  継ぎ目 左右={dx:.2f} 上下={dy:.2f} / 内部の隣接差={inner:.2f}')
