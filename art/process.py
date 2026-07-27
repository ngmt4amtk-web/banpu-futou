#!/usr/bin/env python3
"""緑ベタの生成物(1024x1536)をゲーム用スプライトへ落とし、manifest を書く。

工程は「抜く→despill→余白を刈る→接地点を測る→一発で縮める」。
多段で縮めると輪郭が甘くなるので縮小は必ず一回。

抜き方の注意: 「緑が他chをどれだけ上回るか」だけで判定すると、
関羽の翡翠色の袍（差は0.12程度）まで半透明になって暗く沈む。
背景は #00B140 付近で差が0.44あるので、実際の背景色を四隅から採って距離で抜く。

接地点(ax)は bbox の中心ではなく「最下部の実際に描かれている画素の中心」。
関羽は青龍偃月刀が左へ張り出すので、bbox中心を使うと本人が右にずれる。
"""
import sys, os, json, glob
import numpy as np
from PIL import Image

ART = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(ART, 'raw')

# 実機での縦サイズ。ZOOM=0.78 を掛けた値が画面上の実寸になる。
# 武将52 -> 画面上41px。カメラを引いて群れを見せる距離に合わせた
SIZES = {'h': 52, 'e': 30, 'eb': 38, 'ee': 42, 'ek': 37, 'b': 99}

# 実寸の3倍で書き出す。ZOOMや高dpiで拡大されても輪郭が保つように
SUPER = 3


def bg_color(a):
    h, w, _ = a.shape
    k = 24
    c = np.concatenate([a[:k, :k].reshape(-1, 3), a[:k, -k:].reshape(-1, 3),
                        a[-k:, :k].reshape(-1, 3), a[-k:, -k:].reshape(-1, 3)])
    return np.median(c, axis=0)


def chroma_key(im, inner=0.10, outer=0.24):
    a = np.asarray(im.convert('RGB')).astype(np.float32) / 255.0
    dist = np.sqrt(((a - bg_color(a)) ** 2).sum(axis=-1))
    alpha = np.clip((dist - inner) / (outer - inner), 0.0, 1.0)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    edge = (alpha > 0.02) & (alpha < 0.98) & (g > np.maximum(r, b))
    g2 = np.where(edge, np.minimum(g, np.maximum(r, b) + 0.03), g)
    return Image.fromarray((np.stack([r, g2, b, alpha], -1) * 255).astype(np.uint8), 'RGBA')


def trim(im, thresh=26):
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > thresh)
    if not len(ys):
        return im, 0.5
    im2 = im.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))
    # 接地点＝最下部6%の帯で実際に描かれている画素のx中心
    a2 = np.asarray(im2)[..., 3]
    band = max(2, int(a2.shape[0] * 0.06))
    fy, fx = np.where(a2[-band:] > thresh)
    ax = (fx.mean() / a2.shape[1]) if len(fx) else 0.5
    return im2, float(ax)


def build(src, key, target_h):
    im, ax = trim(chroma_key(Image.open(src)))
    hi = target_h * SUPER
    k = hi / im.height
    sp = im.resize((max(1, round(im.width * k)), hi), Image.LANCZOS)
    sp.save(os.path.join(ART, key + '.png'), optimize=True)
    # manifest は「画面上の寸法」。PNG自体はその SUPER 倍で入っている
    return {'w': max(1, round(im.width * (target_h / im.height))), 'h': target_h,
            'ax': round(ax, 4), 'super': SUPER}


def kind_of(key):
    if key.startswith('b_'):
        return 'b'
    if key.startswith('h_'):
        return 'h'
    if key in ('e_ju',):
        return 'eb'
    if key in ('e_gou', 'e_sen'):
        return 'ee'
    if key in ('e_ki', 'e_ko'):
        return 'ek'
    return 'e'


if __name__ == '__main__':
    man = {}
    mp = os.path.join(ART, 'manifest.json')
    if os.path.exists(mp):
        man = json.load(open(mp))
    for src in sorted(glob.glob(os.path.join(RAW, '*.png'))):
        key = os.path.basename(src)[:-4]
        man[key] = build(src, key, SIZES[kind_of(key)])
        print(key, man[key])
    json.dump(man, open(mp, 'w'), ensure_ascii=False, indent=1, sort_keys=True)
    print('manifest:', len(man), 'entries')
