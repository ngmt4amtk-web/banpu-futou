#!/usr/bin/env python3
"""攻撃エフェクトを焼く。

キャラと違って緑ベタで抜かない。斬撃は本質的に半透明で、クロマキーで抜くと
縁のグラデーションが死ぬ。純黒背景のまま出して加算合成（lighter）で描く——
加算では黒の寄与がゼロなので、背景が自動的に透明として振る舞う。

だから後処理でやるのは「黒をちゃんと黒に落とす」ことだけ。生成物の背景は
真っ黒でなく僅かに浮いていることがあり、そのまま加算すると画面全体に
四角い靄が乗る。
"""
import os, sys, json, glob
import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ART, 'raw')
SIZE = 256


def build(key, src):
    a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255.0
    L = a.max(axis=-1)
    # 下端を切って黒を沈め、残りを持ち上げる。四角い靄の原因を断つ
    floor = float(np.percentile(L, 55))
    k = np.clip((L - floor) / max(1e-6, 1.0 - floor), 0.0, 1.0)
    out = a * (k / np.maximum(L, 1e-6))[..., None]
    im = Image.fromarray((np.clip(out, 0, 1) * 255).astype(np.uint8), 'RGB')
    im = im.resize((SIZE, SIZE), Image.LANCZOS)
    im.save(os.path.join(ART, key + '.png'), optimize=True)

    mp = os.path.join(ART, 'manifest.json')
    man = json.load(open(mp)) if os.path.exists(mp) else {}
    man[key] = {'w': SIZE, 'h': SIZE, 'kind': 'fx'}
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
    # 残った背景の明るさ。0に近いほど靄が出ない
    return float(np.percentile(np.asarray(im).max(axis=-1), 40))


if __name__ == '__main__':
    for src in sorted(glob.glob(os.path.join(RAW, 'fx_*.png'))):
        key = os.path.basename(src)[:-4]
        print(f'{key:12s} 背景の残り明度={build(key, src):.1f}/255')
