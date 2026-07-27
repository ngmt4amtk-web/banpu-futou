/* 萬夫不當 — 描画基盤・音・皮影（影絵）スプライト
   夜の影絵小屋。灯りは布の後ろにある。だから人形は暗く、縁だけが透ける。
   皮影の人形は一体ずつ彫られている——誰が誰かは色ではなく輪郭が語る。
   色を消しても見分けがつかない絵は、ここでは失敗とみなす。
*/
'use strict';

/* ============ 汎用 ============ */
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const rnd = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const rndi = (a, b) => Math.floor(rnd(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];

/* Y方向を潰して疑似アイソメにする係数 */
const ISO = 0.74;

/* ============ 皮影の色 ============
   光源は一つ。布の後ろの灯り。だから縁の色は全陣営で同じ暖色になる。
   陣営の違いは墨のわずかな色味に置く——識別の手段にはしない。
*/
const INK = {
  kou: '#150e05', wei: '#080f1b', wu: '#160609', gun: '#0f0a16', shu: '#05130b',
};
const RIM_SOFT = 'rgba(255,206,138,0.38)';   /* 皮を透けて滲む光 */
const RIM_HARD = 'rgba(255,238,205,0.92)';   /* 縁で切れる光 */
const FACE_HERO = '#8d6b45';                 /* 染めていない獣皮。墨より一段だけ明るい */
const FACE_MOB  = '#33291c';
/* 髭と髪は染めない別板。黒髯と白髯が輪郭で割れると、老将と猛将が一目で分かれる */
const BEARD_TONE = { five: '#191007', tiger: '#191007', stubble: '#191007', thin: '#cbc1ac', white: '#ded5c2', goat: '#cbc1ac' };

/* 武将だけは彩色された人形。1体につき1色だけ置く（平らなセル塗り） */
const HERO_PAINT = {
  guanyu:        { ink: '#06170d', coat: '#2f6b41' },
  zhangfei:      { ink: '#120d07', coat: '#4b3a2a' },
  zhaoyun:       { ink: '#0b1218', coat: '#8fa6bc' },
  lubu:          { ink: '#160a0c', coat: '#9c3226' },
  zhugeliang:    { ink: '#13120c', coat: '#aca786' },
  huangzhong:    { ink: '#141005', coat: '#8a6a2c' },
  xiahoudun:     { ink: '#0a1017', coat: '#356a88' },
  ganning:       { ink: '#150a0d', coat: '#9c3244' },
  sunshangxiang: { ink: '#170a0f', coat: '#b04256' },
  xuchu:         { ink: '#120c06', coat: '#7d4326' },
};

/* ============ 音 ============ */
const Snd = {
  ctx: null, master: null, noiseBuf: null, muted: false, last: {},
  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  env(node, t, peak, dur, atk = 0.005) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  throttle(key, ms) {
    const now = performance.now();
    if (this.last[key] && now - this.last[key] < ms) return false;
    this.last[key] = now; return true;
  },
  noise(dur, peak, f0, f1, q = 1, type = 'bandpass') {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const flt = this.ctx.createBiquadFilter(); flt.type = type; flt.Q.value = q;
    flt.frequency.setValueAtTime(f0, t);
    flt.frequency.exponentialRampToValueAtTime(Math.max(f1, 20), t + dur);
    const g = this.ctx.createGain(); this.env(g, t, peak, dur);
    src.connect(flt); flt.connect(g); g.connect(this.master);
    src.start(t); src.stop(t + dur + 0.02);
  },
  tone(freq, dur, peak, type = 'triangle', slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 20), t + dur);
    const g = this.ctx.createGain(); this.env(g, t, peak, dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.02);
  },
  swing()   { if (this.throttle('sw', 55)) this.noise(0.10, 0.16, 2600, 480, 1.1); },
  hit()     { if (this.throttle('hit', 32)) this.noise(0.06, 0.13, 1500, 300, 2.0); },
  kill()    { if (this.throttle('kill', 40)) { this.noise(0.13, 0.20, 700, 90, 0.9); this.tone(120, 0.10, 0.10, 'sine', 55); } },
  crit()    { if (this.throttle('crit', 70)) { this.tone(1750, 0.09, 0.13, 'triangle', 900); this.noise(0.07, 0.10, 5200, 2200, 3); } },
  hurt()    { if (this.throttle('hurt', 260)) { this.noise(0.22, 0.26, 380, 70, 0.7); this.tone(88, 0.20, 0.16, 'sawtooth', 44); } },
  pickup()  { if (this.throttle('pk', 45)) this.tone(880, 0.05, 0.05, 'sine', 1320); },
  levelup() { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.tone(f, 0.20, 0.11, 'triangle'), i * 55)); },
  loot(rar) {
    const seq = [[440, 660], [523, 784], [523, 784, 1046], [392, 523, 659, 784, 1175]][rar] || [440];
    seq.forEach((f, i) => setTimeout(() => this.tone(f, 0.30, 0.10 + rar * 0.02, 'triangle'), i * 70));
    if (rar >= 3) setTimeout(() => this.noise(0.7, 0.09, 7000, 2500, 2, 'highpass'), 120);
  },
  boss()    { this.tone(58, 1.5, 0.22, 'sawtooth', 44); this.noise(1.3, 0.13, 300, 60, 0.6); },
  win()     { [523, 659, 784, 1046, 1318].forEach((f, i) => setTimeout(() => this.tone(f, 0.42, 0.12, 'triangle'), i * 130)); },
  lose()    { [392, 330, 262, 196].forEach((f, i) => setTimeout(() => this.tone(f, 0.55, 0.13, 'sine'), i * 200)); },
  ui()      { this.tone(660, 0.05, 0.06, 'sine'); },
};

/* ============ スプライト焼き ============ */
const Sprites = { cache: {}, scale: 1 };

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * Sprites.scale); c.height = Math.ceil(h * Sprites.scale);
  const g = c.getContext('2d');
  g.scale(Sprites.scale, Sprites.scale);
  return { c, g, w, h };
}
function bake(key, w, h, fn) {
  if (Sprites.cache[key]) return Sprites.cache[key];
  const { c, g } = mkCanvas(w, h);
  fn(g);
  Sprites.cache[key] = { c, w, h, key };
  return Sprites.cache[key];
}

/* ============ 逆光で焼く ============
   影絵は「塗り」ではなく「抜き」で見える。だから工程は必ずこの順:
     1. 光の層   — 輪郭をひと回り大きく、灯りの色で敷く
     2. 墨の層   — 本体を塗り、透かし彫りを destination-out で抜く
     3. 重ねる   — 抜いた穴から下の光が出る＝彫り穴が光る
   縁は8方向に振って描く。拡大では側面の線が細り、逆光にならない。
*/
/* 灯りは布の後ろ、やや上手にある。だから縁は上と前にしか出ない */
const RING = [[0.9, -0.45], [0.45, -0.9], [-0.2, -1.0], [1.0, 0.15]];

function carve(key, W, H, ox, oy, o) {
  const sp = bake(key, W, H, g => {
    const lit = mkCanvas(W, H);
    lit.g.translate(ox, oy);
    lit.g.fillStyle = RIM_SOFT;
    RING.forEach(d => {
      lit.g.save(); lit.g.translate(d[0] * o.rim, d[1] * o.rim); o.shape(lit.g); lit.g.restore();
    });
    lit.g.fillStyle = RIM_HARD;                     /* 上からの逆光は強い */
    lit.g.save(); lit.g.translate(o.rim * 0.3, -o.rim * 1.0); o.shape(lit.g); lit.g.restore();

    const ink = mkCanvas(W, H);
    ink.g.translate(ox, oy);
    ink.g.fillStyle = o.ink;
    o.shape(ink.g);
    if (o.paint) {                                  /* 彩色は輪郭の内側だけに乗る */
      ink.g.save(); ink.g.globalCompositeOperation = 'source-atop'; o.paint(ink.g); ink.g.restore();
    }
    if (o.over) {                                   /* 冠・髭・腕・得物は彩色の上へ墨で戻す */
      ink.g.save(); ink.g.fillStyle = o.ink; o.over(ink.g); ink.g.restore();
    }
    if (o.cut) {
      ink.g.save(); ink.g.globalCompositeOperation = 'source-atop';
      ink.g.strokeStyle = 'rgba(255,220,166,0.26)'; ink.g.fillStyle = 'rgba(255,220,166,0.26)';
      ink.g.lineCap = 'round';
      o.cut(ink.g); ink.g.restore();
    }

    g.drawImage(lit.c, 0, 0, W, H);
    g.drawImage(ink.c, 0, 0, W, H);
  });
  sp.ox = ox; sp.oy = oy;
  if (o.top !== undefined) sp.top = o.top;
  return sp;
}

/* ============ 骨格 ============
   単位は「足元が0・上が負」。型が違えば輪郭が違う——これが第一の見分け。
     shy/shw 肩の高さ・幅   wy/ww 腰   hy/hw 骨盤
     sk/skY  草摺の張り出しと裾の高さ（robeは裾が接地して脚が消える）
     hdy/hdS 頭の位置と大きさ   nk 首の長さ   gait 歩幅（0=脚なし）
*/
const BUILD = {
  slim:  { shy: -24.0, shw: 3.3, wy: -16.0, ww: 2.5, hy: -12.0, hw: 3.0, sk: 3.7, skY: -8.8, legW: 1.35, hdy: -29.6, hdS: 0.90, nk: 2.0, gait: 1.06 },
  std:   { shy: -23.4, shw: 4.0, wy: -15.6, ww: 3.0, hy: -11.6, hw: 3.5, sk: 4.2, skY: -8.5, legW: 1.60, hdy: -29.0, hdS: 0.96, nk: 1.5, gait: 1.00 },
  broad: { shy: -22.8, shw: 4.9, wy: -15.2, ww: 3.9, hy: -11.3, hw: 4.3, sk: 4.9, skY: -8.2, legW: 1.95, hdy: -28.4, hdS: 1.00, nk: 1.1, gait: 0.94 },
  giant: { shy: -21.6, shw: 6.0, wy: -14.6, ww: 5.2, hy: -10.8, hw: 5.3, sk: 5.8, skY: -7.6, legW: 2.50, hdy: -27.2, hdS: 1.10, nk: 0.6, gait: 0.84 },
  fem:   { shy: -23.4, shw: 2.9, wy: -16.2, ww: 2.0, hy: -12.0, hw: 3.2, sk: 4.4, skY: -9.2, legW: 1.20, hdy: -29.0, hdS: 0.88, nk: 2.2, gait: 1.10 },
  robe:  { shy: -24.0, shw: 3.7, wy: -16.6, ww: 3.6, hy: -12.2, hw: 5.0, sk: 8.0, skY: -0.4, legW: 0,    hdy: -29.8, hdS: 0.92, nk: 1.7, gait: 0 },
};

/* ---- 胴 ---- */
function pTorso(g, s, B) {
  g.beginPath();
  g.moveTo(-B.hw * s, B.hy * s);
  g.lineTo(-B.ww * s, B.wy * s);
  g.lineTo(-B.shw * s, (B.shy + 1.8) * s);
  g.quadraticCurveTo(-B.shw * 1.06 * s, (B.shy - 1.4) * s, (-B.shw + 1.5) * s, (B.shy - 2.4) * s);
  g.lineTo((B.shw - 1.7) * s, (B.shy - 2.6) * s);
  g.quadraticCurveTo(B.shw * 1.08 * s, (B.shy - 1.2) * s, B.shw * s, (B.shy + 2.0) * s);
  g.lineTo(B.ww * s, B.wy * s);
  g.lineTo(B.hw * s, B.hy * s);
  g.closePath(); g.fill();
}

/* ---- 草摺（腰の垂れ）。robeでは足元まで届く外套になる ---- */
function pSkirt(g, s, B, sway) {
  const w = sway || 0;
  g.beginPath();
  g.moveTo(-B.hw * 1.02 * s, (B.hy + 1.0) * s);
  g.lineTo(B.hw * 1.02 * s, (B.hy + 1.0) * s);
  g.quadraticCurveTo(B.sk * 1.02 * s, (B.hy + B.skY) * 0.5 * s, (B.sk + w) * s, B.skY * s);
  g.lineTo((-B.sk * 0.94 + w * 0.4) * s, B.skY * s);
  g.quadraticCurveTo(-B.sk * 0.98 * s, (B.hy + B.skY) * 0.5 * s, -B.hw * 1.02 * s, (B.hy + 1.0) * s);
  g.closePath(); g.fill();
}

/* ---- 肩甲。武人と道士を輪郭で分ける ---- */
function pPauldron(g, s, B, w) {
  const k = w || 1;
  g.beginPath();
  g.moveTo(-B.shw * 1.0 * s, (B.shy + 0.2) * s);
  g.quadraticCurveTo(-(B.shw + 1.8 * k) * s, (B.shy + 1.0) * s, -(B.shw + 1.3 * k) * s, (B.shy + 4.4 * k) * s);
  g.lineTo(-(B.shw - 0.9) * s, (B.shy + 3.4 * k) * s);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(B.shw * 0.98 * s, (B.shy + 0.2) * s);
  g.quadraticCurveTo((B.shw + 1.9 * k) * s, (B.shy + 1.2) * s, (B.shw + 1.4 * k) * s, (B.shy + 4.6 * k) * s);
  g.lineTo((B.shw - 0.9) * s, (B.shy + 3.6 * k) * s);
  g.closePath(); g.fill();
}

/* ---- 帯 ---- */
function pBelt(g, s, B) {
  g.fillRect(-B.ww * 1.15 * s, (B.wy + 1.4) * s, B.ww * 2.3 * s, 2.0 * s);
}

/* ---- 脚。膝と爪先を作ると「立っている」に見える ---- */
function pLegs(g, s, B, step) {
  if (!B.gait) return;
  const sp = (step ? 4.3 : 1.1) * B.gait, w = B.legW * s;
  const leg = (hipX, footX) => {
    g.beginPath();
    g.moveTo(hipX - w, (B.hy + 1.2) * s);
    g.lineTo(hipX + w, (B.hy + 1.2) * s);
    g.lineTo(footX + w * 0.8, -0.9 * s);
    g.lineTo(footX + w * 0.8 + 2.3 * s, -0.9 * s);
    g.lineTo(footX + w * 0.8 + 2.1 * s, 0);
    g.lineTo(footX - w * 0.95, 0);
    g.closePath(); g.fill();
  };
  leg(-1.5 * s, (-sp) * s);
  leg(1.5 * s, (sp) * s);
}

/* ---- 素の頭。横顔の鼻梁と顎の切れが顔立ちを決める ---- */
function pHead(g, s, B) {
  const S = s * B.hdS;
  g.save(); g.translate(0.6 * S, B.hdy * s); g.scale(S, S);
  g.fillRect(-1.6, 2.6, 3.2, B.nk + 1.8);
  g.beginPath();
  g.moveTo(-3.5, 3.3);
  g.lineTo(-3.9, -1.1);
  g.quadraticCurveTo(-3.5, -4.7, 0.2, -4.9);
  g.quadraticCurveTo(3.2, -4.8, 3.6, -1.7);
  g.lineTo(4.6, 0.3);
  g.lineTo(3.1, 1.0);
  g.lineTo(3.4, 2.3);
  g.lineTo(1.8, 3.7);
  g.closePath(); g.fill();
  g.restore();
}

/* ============ かぶりもの ============
   輪郭の一番上を占める＝最も遠くから効く見分け。
   頭ローカル座標（顔は+x向き、頭は幅8・高さ8ほど）で描く。
*/
function pCrown(g, s, B, kind) {
  if (!kind) return;
  const S = s * B.hdS;
  g.save(); g.translate(0.6 * S, B.hdy * s); g.scale(S, S);
  const tri = (x, y0, y1, w) => { g.beginPath(); g.moveTo(x - w, y0); g.lineTo(x, y1); g.lineTo(x + w, y0); g.closePath(); g.fill(); };

  if (kind === 'wrap') {                        /* 頭巾 — 関羽。丸く低く、角がない */
    g.beginPath();
    g.moveTo(-4.3, -0.4);
    g.quadraticCurveTo(-4.9, -6.6, 0.5, -6.9);
    g.quadraticCurveTo(4.6, -6.5, 4.3, -1.2);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(-0.4, -7.0, 1.5, 0, TAU); g.fill();       /* 頂の結び */
    g.beginPath();                                                  /* 後ろの垂れ */
    g.moveTo(-4.2, -4.0); g.quadraticCurveTo(-7.8, -1.4, -7.0, 3.4);
    g.lineTo(-4.9, 3.0); g.quadraticCurveTo(-5.4, -0.6, -3.5, -2.6);
    g.closePath(); g.fill();

  } else if (kind === 'pheasant') {             /* 三叉束髮紫金冠＋雉尾二本 — 呂布 */
    g.beginPath();
    g.moveTo(-3.7, -3.2); g.lineTo(-3.1, -8.4); g.lineTo(3.3, -8.1); g.lineTo(4.2, -2.8);
    g.closePath(); g.fill();
    tri(-1.9, -8.2, -11.4, 1.0); tri(0.5, -8.2, -12.2, 1.1); tri(2.9, -8.1, -11.0, 1.0);
    for (let i = 0; i < 2; i++) {
      const o = i * 1.9;
      g.beginPath();
      g.moveTo(-1.6 + o, -8.8);
      g.quadraticCurveTo(-9 - o * 1.1, -17.5 - o, -18.5 - o * 1.4, -13.4 - o * 0.8);
      g.quadraticCurveTo(-10 - o * 0.8, -15.2 - o * 0.7, -0.4 + o, -7.2);
      g.closePath(); g.fill();
    }

  } else if (kind === 'scholar') {              /* 綸巾 — 諸葛亮。四角く広く、武人と別種 */
    g.beginPath();
    g.moveTo(-4.7, -0.8); g.lineTo(-4.3, -7.0); g.lineTo(4.7, -6.8); g.lineTo(4.9, -1.0);
    g.closePath(); g.fill();
    g.fillRect(-5.4, -8.4, 10.7, 1.5);
    g.beginPath();
    g.moveTo(-4.5, -4.8); g.quadraticCurveTo(-9.6, -1.0, -8.8, 5.6);
    g.lineTo(-6.6, 5.2); g.quadraticCurveTo(-7.4, 0.2, -3.7, -3.0);
    g.closePath(); g.fill();

  } else if (kind === 'spike') {                /* 尖った銀盔 — 趙雲。細く鋭く、余計な房がない */
    g.beginPath();
    g.moveTo(-4.4, -1.0);
    g.quadraticCurveTo(-3.6, -7.2, 0.3, -7.6);
    g.quadraticCurveTo(4.2, -7.1, 4.6, -1.2);
    g.closePath(); g.fill();
    tri(0.3, -7.4, -12.0, 0.85);
    g.beginPath(); g.moveTo(-4.4, -1.4); g.lineTo(-6.2, 2.8); g.lineTo(-3.4, 2.2); g.closePath(); g.fill();

  } else if (kind === 'plume') {                /* 兜＋房 — 一般兵。房は小さく留める */
    g.beginPath();
    g.moveTo(-4.5, -1.0); g.quadraticCurveTo(0.2, -7.6, 4.7, -1.2);
    g.closePath(); g.fill();
    g.fillRect(-5.2, -2.0, 10.2, 1.4);
    g.beginPath();
    g.moveTo(-0.6, -7.0); g.quadraticCurveTo(-1.8, -10.6, 0.4, -11.6);
    g.quadraticCurveTo(2.6, -10.4, 1.4, -6.9);
    g.closePath(); g.fill();

  } else if (kind === 'iron') {                 /* 素の鉄兜 — 雑兵 */
    g.beginPath();
    g.moveTo(-4.3, -0.9); g.quadraticCurveTo(0.1, -7.0, 4.5, -1.1);
    g.closePath(); g.fill();
    g.fillRect(-4.9, -1.8, 9.6, 1.3);

  } else if (kind === 'nape') {                 /* 頓項（長い錣）— 夏侯惇。後ろへ厚く垂れる */
    g.beginPath();
    g.moveTo(-4.6, -1.2); g.quadraticCurveTo(0.1, -7.8, 4.8, -1.4);
    g.closePath(); g.fill();
    g.fillRect(-5.4, -2.2, 10.6, 1.5);
    g.beginPath();
    g.moveTo(-4.8, -2.0); g.quadraticCurveTo(-8.6, -0.6, -8.0, 6.2);
    g.lineTo(-3.4, 6.0); g.quadraticCurveTo(-3.6, 0.8, -3.0, -1.6);
    g.closePath(); g.fill();
    tri(0.2, -7.4, -10.4, 0.7);

  } else if (kind === 'crest') {                /* 前立て — 曹純・虎豹騎。前へ張る */
    g.beginPath();
    g.moveTo(-4.4, -1.0); g.quadraticCurveTo(0.2, -7.4, 4.8, -1.2);
    g.closePath(); g.fill();
    g.fillRect(-5.0, -1.9, 10.0, 1.3);
    g.beginPath();
    g.moveTo(-1.4, -6.6); g.lineTo(-0.2, -11.2); g.lineTo(5.6, -8.0);
    g.lineTo(4.4, -5.2); g.lineTo(2.0, -6.9);
    g.closePath(); g.fill();

  } else if (kind === 'conical') {              /* 斗笠 — 蔡瑁。水軍の笠。横に極端に広い */
    g.beginPath();
    g.moveTo(-10.6, -2.2);
    g.quadraticCurveTo(-4.6, -3.6, 0.4, -9.4);
    g.quadraticCurveTo(5.4, -3.6, 11.0, -2.4);
    g.quadraticCurveTo(0.4, 0.4, -10.6, -2.2);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(0.4, -9.6, 1.2, 0, TAU); g.fill();

  } else if (kind === 'officer') {              /* 進賢冠 — 司馬懿。縦に高い文官の冠 */
    g.beginPath();
    g.moveTo(-3.8, -1.2); g.lineTo(-3.4, -6.4); g.lineTo(3.4, -6.2); g.lineTo(3.9, -1.4);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(-3.2, -6.2); g.lineTo(-2.4, -12.4); g.lineTo(2.6, -12.0); g.lineTo(3.2, -6.1);
    g.closePath(); g.fill();
    g.fillRect(-3.8, -13.2, 6.8, 1.3);

  } else if (kind === 'turban') {               /* 黄巾 — 黄巾賊・張角。額の結び目と長い尾 */
    g.beginPath();
    g.moveTo(-4.4, -1.0); g.quadraticCurveTo(0.2, -6.8, 4.6, -1.4);
    g.closePath(); g.fill();
    g.fillRect(-4.8, -2.4, 9.8, 1.8);
    g.beginPath();
    g.moveTo(3.6, -3.0); g.lineTo(6.6, -5.6); g.lineTo(6.0, -2.2); g.lineTo(4.6, -1.8);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(-4.6, -2.6); g.quadraticCurveTo(-9.4, 0.6, -11.2, 5.2);
    g.lineTo(-8.6, 5.6); g.quadraticCurveTo(-6.8, 1.2, -3.6, -0.8);
    g.closePath(); g.fill();

  } else if (kind === 'daoist') {               /* 道冠 — 仙術士。細い筒が縦に立つ */
    g.beginPath();
    g.moveTo(-2.6, -3.6); g.lineTo(-2.2, -9.8); g.lineTo(2.4, -9.6); g.lineTo(2.8, -3.4);
    g.closePath(); g.fill();
    g.fillRect(-3.4, -10.6, 6.4, 1.2);
    g.beginPath(); g.moveTo(-0.6, -10.4); g.lineTo(0.2, -13.6); g.lineTo(1.2, -10.3); g.closePath(); g.fill();

  } else if (kind === 'bun') {                  /* 白髪の髻 — 黄忠。後頭に丸く盛る */
    g.beginPath();
    g.moveTo(-4.2, -0.8); g.quadraticCurveTo(-0.2, -6.4, 4.2, -1.4);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(-3.4, -5.4, 2.9, 0, TAU); g.fill();
    g.fillRect(-4.6, -2.6, 9.0, 1.1);

  } else if (kind === 'loops') {                /* 双環髻 — 孫尚香。左右に輪が二つ */
    g.beginPath();
    g.moveTo(-4.0, -1.0); g.quadraticCurveTo(0.2, -6.6, 4.0, -1.6);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(-3.2, -5.8, 2.6, 0, TAU); g.fill();
    g.beginPath(); g.arc(1.8, -7.0, 2.2, 0, TAU); g.fill();
    g.beginPath(); g.moveTo(-1.0, -6.4); g.lineTo(0.4, -10.4); g.lineTo(1.6, -6.6); g.closePath(); g.fill();
    g.beginPath();                                                  /* 背へ流れる髪 */
    g.moveTo(-3.8, -2.4); g.quadraticCurveTo(-8.4, 1.4, -7.4, 8.6);
    g.lineTo(-5.0, 8.2); g.quadraticCurveTo(-5.6, 2.0, -2.8, -0.6);
    g.closePath(); g.fill();

  } else if (kind === 'sash') {                 /* 錦帆の鉢巻＋羽根 — 甘寧 */
    g.fillRect(-4.6, -3.4, 9.4, 2.0);
    g.beginPath(); g.arc(-1.0, -6.0, 2.3, 0, TAU); g.fill();
    g.beginPath();
    g.moveTo(-0.6, -7.2); g.quadraticCurveTo(2.6, -12.4, 6.6, -13.0);
    g.quadraticCurveTo(3.4, -10.0, 1.6, -6.6);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(-4.4, -2.8); g.quadraticCurveTo(-8.8, -0.4, -9.6, 4.4);
    g.lineTo(-7.4, 4.8); g.quadraticCurveTo(-6.6, 0.8, -3.6, -1.0);
    g.closePath(); g.fill();

  } else if (kind === 'mane') {                 /* 蓬髪 — 許褚。かぶらない。逆立つ髪だけ */
    g.beginPath();
    g.moveTo(-4.2, 0.6);
    g.lineTo(-6.4, -3.0); g.lineTo(-4.0, -2.6);
    g.lineTo(-4.8, -6.4); g.lineTo(-2.2, -4.4);
    g.lineTo(-1.6, -8.4); g.lineTo(0.6, -4.9);
    g.lineTo(2.4, -7.6); g.lineTo(2.8, -4.4);
    g.lineTo(5.0, -5.4); g.lineTo(4.2, -1.6);
    g.closePath(); g.fill();
  }
  g.restore();
}

/* ============ 髭 ============ */
function pBeard(g, s, B, kind) {
  if (!kind) return;
  const S = s * B.hdS;
  g.save(); g.translate(0.6 * S, B.hdy * s); g.scale(S, S);

  if (kind === 'five') {                        /* 五綹長髯 — 関羽。胸まで届く五筋 */
    g.beginPath();
    g.moveTo(3.4, 0.6); g.lineTo(4.6, 2.2);
    g.quadraticCurveTo(6.0, 9.0, 3.0, 15.4);
    g.quadraticCurveTo(1.4, 9.6, -0.4, 4.2);
    g.closePath(); g.fill();
    g.lineWidth = 0.42; g.strokeStyle = g.fillStyle;
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(1.6 + i * 0.5, 4.0 + i * 0.4);
      g.quadraticCurveTo(3.4 + i * 0.4, 9.0, 2.0 + i * 0.3, 14.0 + i * 0.5);
      g.stroke();
    }
  } else if (kind === 'tiger') {                /* 虎鬚 — 張飛。放射に逆立つ */
    g.beginPath();
    g.moveTo(3.0, 0.4);
    g.lineTo(8.4, 0.2); g.lineTo(4.4, 2.2);
    g.lineTo(8.8, 4.4); g.lineTo(3.6, 4.0);
    g.lineTo(5.6, 8.0); g.lineTo(1.8, 5.0);
    g.lineTo(1.4, 8.6); g.lineTo(-0.4, 4.6);
    g.lineTo(-2.8, 6.4); g.lineTo(-1.2, 2.6);
    g.closePath(); g.fill();
  } else if (kind === 'white') {                /* 老将の白髯 — 黄忠。太く短く垂れる */
    g.beginPath();
    g.moveTo(3.1, 0.9);
    g.quadraticCurveTo(5.2, 5.4, 2.6, 9.8);
    g.quadraticCurveTo(0.4, 6.2, -0.8, 3.6);
    g.closePath(); g.fill();
  } else if (kind === 'thin') {                 /* 三牙 — 諸葛亮。細く三本 */
    g.lineWidth = 0.8; g.strokeStyle = g.fillStyle; g.lineCap = 'round';
    g.beginPath(); g.moveTo(2.6, 1.8); g.quadraticCurveTo(4.2, 5.6, 3.0, 9.2); g.stroke();
    g.beginPath(); g.moveTo(1.4, 2.4); g.quadraticCurveTo(1.8, 5.8, 1.0, 8.2); g.stroke();
    g.beginPath(); g.moveTo(3.4, 0.4); g.quadraticCurveTo(5.6, 1.6, 6.2, 3.4); g.stroke();
  } else if (kind === 'goat') {                 /* 道士の長髯 — 張角。細く長く一本 */
    g.beginPath();
    g.moveTo(2.8, 1.6); g.lineTo(3.8, 2.4);
    g.quadraticCurveTo(4.0, 9.0, 2.0, 15.4);
    g.quadraticCurveTo(1.0, 8.6, 1.4, 3.0);
    g.closePath(); g.fill();
  } else if (kind === 'stubble') {              /* 無精髭 — 許褚。輪郭を荒らすだけ */
    g.beginPath();
    g.moveTo(3.2, 0.8); g.lineTo(5.4, 1.8); g.lineTo(3.4, 2.8);
    g.lineTo(4.6, 4.6); g.lineTo(1.4, 3.6); g.lineTo(0.2, 4.8);
    g.lineTo(0.0, 2.4);
    g.closePath(); g.fill();
  }
  g.restore();
}

/* ============ 外套 ============ */
function pCape(g, s, B, sway, len) {
  const L = len || 1;
  g.beginPath();
  g.moveTo(-B.shw * 0.8 * s, (B.shy - 1.8) * s);
  g.quadraticCurveTo((-B.shw - 3.6 - sway) * s, (B.shy * 0.6) * s, (-B.shw - 2.4 - sway * 1.4) * s, (B.shy * 0.10 - 1.5 * L) * s);
  g.lineTo((-B.shw + 0.5) * s, (B.shy * 0.12 - 2.0 * L) * s);
  g.quadraticCurveTo((-B.shw - 1.0) * s, (B.shy * 0.5) * s, (-B.shw * 0.35) * s, (B.shy - 0.8) * s);
  g.closePath(); g.fill();
}

/* ============ 武器 ============
   輪郭の主役。細い棒はやめる。武器の形が遠くから人物を名指しする。
   基準は握り手 hx,hy（単位）。すべて +x 向きに構える。
*/
function shaft(g, x1, y1, x2, y2, w) {
  const a = Math.atan2(y2 - y1, x2 - x1), n = a + Math.PI / 2;
  const dx = Math.cos(n) * w / 2, dy = Math.sin(n) * w / 2;
  g.beginPath();
  g.moveTo(x1 + dx, y1 + dy); g.lineTo(x2 + dx, y2 + dy);
  g.lineTo(x2 - dx, y2 - dy); g.lineTo(x1 - dx, y1 - dy);
  g.closePath(); g.fill();
}

function pArm(g, s, B, thick) {
  const hx = (B.shw * 0.9 + 2.2) * s, hy = (B.shy + 4.6) * s;
  const w = (thick || 1) * s;
  g.beginPath();
  g.moveTo(B.shw * 0.3 * s, (B.shy - 1.2) * s);
  g.lineTo(hx + 1.5 * w, hy - 1.2 * w);
  g.lineTo(hx + 0.3 * w, hy + 2.4 * w);
  g.lineTo(B.shw * 0.1 * s, (B.shy + 2.4) * s);
  g.closePath(); g.fill();
}

function pWeapon(g, s, B, kind) {
  if (!kind) return;
  const hx = (B.shw * 0.9 + 2.2) * s, hy = (B.shy + 4.6) * s, u = s;

  if (kind === 'guandao') {                     /* 青龍偃月刀 — 深い反りの大刀。刃だけで頭一つ分 */
    shaft(g, hx - 6 * u, hy + 13 * u, hx + 8 * u, hy - 18 * u, 2.5 * u);
    g.beginPath();
    g.moveTo(hx + 8 * u, hy - 18 * u);
    g.quadraticCurveTo(hx + 22 * u, hy - 23 * u, hx + 20.5 * u, hy - 6 * u);
    g.quadraticCurveTo(hx + 20 * u, hy - 12 * u, hx + 12.5 * u, hy - 12 * u);
    g.quadraticCurveTo(hx + 15 * u, hy - 15 * u, hx + 6.2 * u, hy - 13.6 * u);
    g.closePath(); g.fill();
    g.beginPath();                                                    /* 石突 */
    g.moveTo(hx - 6 * u, hy + 13 * u); g.lineTo(hx - 9.4 * u, hy + 18 * u);
    g.lineTo(hx - 4.6 * u, hy + 15.6 * u); g.closePath(); g.fill();

  } else if (kind === 'serpent') {              /* 丈八蛇矛 — 穂先が三度うねる */
    shaft(g, hx - 8 * u, hy + 14 * u, hx + 8 * u, hy - 15 * u, 2.3 * u);
    g.beginPath();
    g.moveTo(hx + 6.6 * u, hy - 14.4 * u);
    g.quadraticCurveTo(hx + 15 * u, hy - 19 * u, hx + 9.6 * u, hy - 24 * u);
    g.quadraticCurveTo(hx + 16.5 * u, hy - 27 * u, hx + 10.5 * u, hy - 33 * u);
    g.lineTo(hx + 13.6 * u, hy - 31.6 * u);
    g.quadraticCurveTo(hx + 19.5 * u, hy - 25.4 * u, hx + 12.4 * u, hy - 22.4 * u);
    g.quadraticCurveTo(hx + 18 * u, hy - 17.6 * u, hx + 9.6 * u, hy - 13.2 * u);
    g.closePath(); g.fill();

  } else if (kind === 'halberd') {              /* 方天画戟 — 左右に月牙が張る。最も横に広い */
    shaft(g, hx - 7 * u, hy + 14 * u, hx + 8 * u, hy - 20 * u, 2.6 * u);
    g.beginPath();
    g.moveTo(hx + 8 * u, hy - 20 * u); g.lineTo(hx + 10.2 * u, hy - 30 * u);
    g.lineTo(hx + 6.4 * u, hy - 28.4 * u); g.closePath(); g.fill();
    [[1, 0], [-1, 3.2]].forEach(p => {
      const d = p[0], o = p[1] * u;
      g.beginPath();
      g.moveTo(hx + 7.2 * u, hy - 22 * u + o);
      g.quadraticCurveTo(hx + (7.2 + d * 13) * u, hy - 26.5 * u + o, hx + (7.2 + d * 11.5) * u, hy - 15.5 * u + o);
      g.quadraticCurveTo(hx + (7.2 + d * 8.5) * u, hy - 21 * u + o, hx + 6.8 * u, hy - 18.6 * u + o);
      g.closePath(); g.fill();
    });

  } else if (kind === 'spear') {                /* 龍胆亮銀槍 — 趙雲。水平に構える。縦棒の群れの中で唯一横 */
    shaft(g, hx - 8 * u, hy + 4.0 * u, hx + 24 * u, hy - 4.0 * u, 2.0 * u);
    g.beginPath();
    g.moveTo(hx + 24 * u, hy - 4.0 * u); g.lineTo(hx + 33 * u, hy - 6.6 * u);
    g.lineTo(hx + 23.6 * u, hy - 0.6 * u); g.closePath(); g.fill();
    g.beginPath();                                                    /* 紅纓 */
    g.moveTo(hx + 22 * u, hy - 3.4 * u); g.lineTo(hx + 17 * u, hy - 7.0 * u);
    g.lineTo(hx + 18.4 * u, hy - 2.0 * u); g.lineTo(hx + 15 * u, hy + 0.2 * u);
    g.lineTo(hx + 21.4 * u, hy - 1.8 * u); g.closePath(); g.fill();

  } else if (kind === 'fan') {                  /* 白羽扇 — 諸葛亮。刃が一つも無い唯一の輪郭 */
    shaft(g, hx - 1 * u, hy + 5 * u, hx + 4 * u, hy - 4 * u, 1.5 * u);
    g.beginPath();                                                    /* 羽を広げた面 */
    g.moveTo(hx + 3.0 * u, hy - 3.0 * u);
    g.quadraticCurveTo(hx + 19 * u, hy - 7 * u, hx + 15 * u, hy - 23 * u);
    g.quadraticCurveTo(hx + 8 * u, hy - 15 * u, hx + 1.4 * u, hy - 4.4 * u);
    g.closePath(); g.fill();

  } else if (kind === 'bowDraw') {              /* 引き絞った大弓 — 黄忠。弦と矢が輪郭に出る */
    g.lineWidth = 2.3 * u; g.strokeStyle = g.fillStyle;
    g.beginPath(); g.arc(hx + 8 * u, hy - 4 * u, 15 * u, -1.28, 1.28); g.stroke();
    g.lineWidth = 1.1 * u;
    g.beginPath();
    g.moveTo(hx + 12.3 * u, hy - 18.4 * u); g.lineTo(hx - 3 * u, hy - 4 * u);
    g.lineTo(hx + 12.3 * u, hy + 10.4 * u); g.stroke();
    shaft(g, hx - 2.6 * u, hy - 4 * u, hx + 20 * u, hy - 4 * u, 1.15 * u);
    g.beginPath();
    g.moveTo(hx + 20 * u, hy - 4 * u); g.lineTo(hx + 26 * u, hy - 4.4 * u);
    g.lineTo(hx + 20 * u, hy - 1.2 * u); g.closePath(); g.fill();
    g.beginPath();                                                    /* 矢羽 */
    g.moveTo(hx - 2.4 * u, hy - 4 * u); g.lineTo(hx - 7 * u, hy - 7.6 * u);
    g.lineTo(hx - 5.6 * u, hy - 4 * u); g.lineTo(hx - 7 * u, hy - 0.4 * u);
    g.closePath(); g.fill();

  } else if (kind === 'twin') {                 /* 双刀 — 甘寧。上下に開いて構える */
    shaft(g, hx + 1 * u, hy + 2 * u, hx + 14 * u, hy - 10 * u, 2.2 * u);
    g.beginPath();
    g.moveTo(hx + 13.4 * u, hy - 11.8 * u); g.lineTo(hx + 19 * u, hy - 16.8 * u);
    g.lineTo(hx + 12.4 * u, hy - 8.0 * u); g.closePath(); g.fill();
    shaft(g, hx + 0.5 * u, hy + 5 * u, hx + 12 * u, hy + 14 * u, 2.0 * u);
    g.beginPath();
    g.moveTo(hx + 11.4 * u, hy + 14.4 * u); g.lineTo(hx + 17.4 * u, hy + 17.6 * u);
    g.lineTo(hx + 10.2 * u, hy + 17.4 * u); g.closePath(); g.fill();

  } else if (kind === 'repeater') {             /* 連弩 — 孫尚香。箱形の匣が前に出る */
    shaft(g, hx - 2 * u, hy + 2 * u, hx + 12 * u, hy - 0.5 * u, 2.0 * u);
    g.fillRect(hx + 3 * u, hy - 7.4 * u, 7.6 * u, 6.2 * u);
    g.lineWidth = 1.8 * u; g.strokeStyle = g.fillStyle;
    g.beginPath(); g.arc(hx + 12 * u, hy - 0.5 * u, 7.5 * u, -1.1, 1.1); g.stroke();
    g.lineWidth = 1.0 * u;
    g.beginPath();
    g.moveTo(hx + 15.4 * u, hy - 7.2 * u); g.lineTo(hx + 7 * u, hy - 0.5 * u);
    g.lineTo(hx + 15.4 * u, hy + 6.2 * u); g.stroke();

  } else if (kind === 'greatblade') {           /* 大刀を肩に担ぐ — 許褚。刃の面が広い */
    shaft(g, hx - 4 * u, hy + 8 * u, hx + 2 * u, hy - 14 * u, 2.6 * u);
    g.beginPath();                                                    /* 切っ先が前へ伸びる幅広の刃 */
    g.moveTo(hx + 1.2 * u, hy - 14.4 * u);
    g.lineTo(hx + 2.6 * u, hy - 21.6 * u);
    g.lineTo(hx + 17.5 * u, hy - 25.4 * u);
    g.lineTo(hx + 15.4 * u, hy - 21.4 * u);
    g.quadraticCurveTo(hx + 8 * u, hy - 17.6 * u, hx + 1.2 * u, hy - 14.4 * u);
    g.closePath(); g.fill();

  } else if (kind === 'dao') {                  /* 直刀を低く引く — 夏侯惇。刃が下がっている */
    shaft(g, hx - 12 * u, hy + 15 * u, hx + 11 * u, hy + 1 * u, 2.4 * u);
    g.beginPath();
    g.moveTo(hx + 10 * u, hy + 2.4 * u);
    g.lineTo(hx + 23 * u, hy - 3.0 * u);
    g.lineTo(hx + 28 * u, hy - 1.4 * u);
    g.lineTo(hx + 24 * u, hy + 1.6 * u);
    g.lineTo(hx + 10.6 * u, hy + 5.4 * u);
    g.closePath(); g.fill();
    g.beginPath(); g.arc(hx - 12.4 * u, hy + 15.4 * u, 2.2 * u, 0, TAU); g.fill();

  } else if (kind === 'staff9') {               /* 九節杖 — 張角。節の瘤が数珠に見える */
    shaft(g, hx - 3 * u, hy + 16 * u, hx + 5 * u, hy - 27 * u, 2.2 * u);
    for (let i = 0; i < 7; i++) {
      g.beginPath();
      g.arc(hx + (-2.2 + i * 1.15) * u, hy + (12.6 - i * 6.2) * u, 1.7 * u, 0, TAU); g.fill();
    }
    g.beginPath(); g.arc(hx + 5.4 * u, hy - 29.5 * u, 3.6 * u, 0, TAU); g.fill();
    g.lineWidth = 0.7 * u; g.strokeStyle = g.fillStyle;
    g.beginPath(); g.arc(hx + 5.4 * u, hy - 29.5 * u, 6.4 * u, 0.4, 4.2); g.stroke();

  } else if (kind === 'sabre') {                /* 環首刀 — 雑兵。短い */
    shaft(g, hx - 1 * u, hy + 3 * u, hx + 9 * u, hy - 10 * u, 2.4 * u);
    g.beginPath(); g.arc(hx - 1.7 * u, hy + 4.6 * u, 2.1 * u, 0, TAU); g.fill();

  } else if (kind === 'pike') {                 /* 長矛 — 歩兵。真っ直ぐ立てる */
    shaft(g, hx - 5 * u, hy + 13 * u, hx + 6 * u, hy - 20 * u, 2.0 * u);
    g.beginPath();
    g.moveTo(hx + 6 * u, hy - 20 * u); g.lineTo(hx + 8.4 * u, hy - 28 * u);
    g.lineTo(hx + 4 * u, hy - 25.6 * u); g.closePath(); g.fill();

  } else if (kind === 'bowSimple') {
    g.lineWidth = 2.1 * u; g.strokeStyle = g.fillStyle;
    g.beginPath(); g.arc(hx + 4 * u, hy - 3 * u, 11 * u, -1.3, 1.3); g.stroke();
    g.lineWidth = 1.0 * u;
    g.beginPath();
    g.moveTo(hx + 6.9 * u, hy - 13.6 * u); g.lineTo(hx + 2.4 * u, hy - 3 * u);
    g.lineTo(hx + 6.9 * u, hy + 7.6 * u); g.stroke();

  } else if (kind === 'shield') {               /* 大盾＋鎚 — 重装兵。輪郭が壁になる */
    g.beginPath();
    g.moveTo(hx + 2 * u, hy - 14 * u);
    g.lineTo(hx + 11.5 * u, hy - 12.4 * u);
    g.lineTo(hx + 12.5 * u, hy + 9 * u);
    g.lineTo(hx + 3 * u, hy + 12 * u);
    g.closePath(); g.fill();
    shaft(g, hx - 9 * u, hy + 9 * u, hx - 5 * u, hy - 12 * u, 1.7 * u);
    g.fillRect(hx - 8.4 * u, hy - 18 * u, 6.6 * u, 6 * u);

  } else if (kind === 'ji') {                   /* 戟 — 豪傑。片側だけ枝 */
    shaft(g, hx - 6 * u, hy + 13 * u, hx + 7 * u, hy - 20 * u, 2.4 * u);
    g.beginPath();
    g.moveTo(hx + 7 * u, hy - 20 * u); g.lineTo(hx + 9.4 * u, hy - 29 * u);
    g.lineTo(hx + 5.2 * u, hy - 26.6 * u); g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(hx + 6.4 * u, hy - 21 * u);
    g.quadraticCurveTo(hx + 18 * u, hy - 25 * u, hx + 16 * u, hy - 14 * u);
    g.quadraticCurveTo(hx + 13 * u, hy - 19.4 * u, hx + 6 * u, hy - 17.6 * u);
    g.closePath(); g.fill();

  } else if (kind === 'banner') {               /* 招魂幡 — 仙術士。布が縦に垂れる */
    shaft(g, hx - 2 * u, hy + 14 * u, hx + 3 * u, hy - 26 * u, 2.0 * u);
    g.beginPath();
    g.moveTo(hx + 3 * u, hy - 25 * u);
    g.lineTo(hx + 13 * u, hy - 23.4 * u);
    g.quadraticCurveTo(hx + 10 * u, hy - 12 * u, hx + 12.4 * u, hy - 3 * u);
    g.lineTo(hx + 8.6 * u, hy - 5.6 * u);
    g.lineTo(hx + 9.4 * u, hy - 1.4 * u);
    g.lineTo(hx + 4.4 * u, hy - 5.2 * u);
    g.closePath(); g.fill();

  } else if (kind === 'trident') {              /* 三叉戟 — 蔡瑁。水軍の得物 */
    shaft(g, hx - 6 * u, hy + 13 * u, hx + 7 * u, hy - 19 * u, 2.4 * u);
    [-1, 0, 1].forEach(d => {
      g.beginPath();
      g.moveTo(hx + (6.4 + d * 3.4) * u, hy - 19 * u);
      g.lineTo(hx + (7.4 + d * 4.6) * u, hy - 28.5 * u);
      g.lineTo(hx + (8.6 + d * 3.4) * u, hy - 19 * u);
      g.closePath(); g.fill();
    });
    g.fillRect(hx + 2.4 * u, hy - 20.4 * u, 9.6 * u, 1.8 * u);

  } else if (kind === 'straightsword') {        /* 直剣を垂らす — 司馬懿。刃を向けない */
    shaft(g, hx - 1 * u, hy - 1 * u, hx + 5 * u, hy + 17 * u, 2.1 * u);
    g.fillRect(hx - 3.2 * u, hy - 2.6 * u, 7.4 * u, 1.7 * u);
    g.beginPath(); g.arc(hx - 1.6 * u, hy - 4.2 * u, 1.7 * u, 0, TAU); g.fill();
  }
}

/* ============ 透かし彫り ============
   塗った影から線を抜くと、そこだけ光が通る。模様も個体差にする。
*/
function pCut(g, s, B, kind) {
  g.lineWidth = Math.max(0.5, 0.6 * s);
  const armor = n => {
    for (let i = 0; i < n; i++) {
      const y = (B.shy + 3.2 + i * 3.0) * s;
      g.beginPath(); g.moveTo(-B.shw * 0.72 * s, y); g.lineTo(B.shw * 0.76 * s, y - 0.3 * s); g.stroke();
    }
  };
  const pleats = n => {
    for (let i = 0; i < n; i++) {
      const x = (-B.sk * 0.55 + i * (B.sk * 1.15 / (n - 1))) * s;
      g.beginPath(); g.moveTo(x, (B.hy + 1.4) * s); g.lineTo(x - 0.3 * s, (B.skY + 0.6) * s); g.stroke();
    }
  };
  if (kind === 'ring')  { armor(3); pleats(4); g.beginPath(); g.arc(0.4 * s, (B.shy + 6) * s, 2.1 * s, 0, TAU); g.stroke(); }
  else if (kind === 'lattice') {
    armor(2); pleats(4);
    for (let i = -1; i <= 1; i++) {
      g.beginPath(); g.moveTo((-2.4 + i * 2.2) * s, (B.shy + 4) * s); g.lineTo((0.6 + i * 2.2) * s, (B.shy + 9) * s); g.stroke();
      g.beginPath(); g.moveTo((0.6 + i * 2.2) * s, (B.shy + 4) * s); g.lineTo((-2.4 + i * 2.2) * s, (B.shy + 9) * s); g.stroke();
    }
  }
  else if (kind === 'scale') {
    pleats(4);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) {
      g.beginPath();
      g.arc((-2.6 + c * 2.4 + (r % 2) * 1.2) * s, (B.shy + 4.4 + r * 2.6) * s, 1.05 * s, 0.15, Math.PI - 0.15);
      g.stroke();
    }
  }
  else if (kind === 'cloud') {
    armor(2); pleats(3);
    g.beginPath();
    g.arc(-0.8 * s, (B.shy + 6.4) * s, 1.7 * s, 0.6, 4.4);
    g.arc(1.8 * s, (B.shy + 6.0) * s, 1.4 * s, 5.0, 2.6); g.stroke();
  }
  else if (kind === 'trigram') {                /* 八卦 — 道士 */
    for (let i = 0; i < 3; i++) {
      const y = (B.shy + 4.6 + i * 2.3) * s;
      if (i === 1) { g.beginPath(); g.moveTo(-2.6 * s, y); g.lineTo(-0.7 * s, y); g.stroke();
                     g.beginPath(); g.moveTo(0.7 * s, y); g.lineTo(2.6 * s, y); g.stroke(); }
      else { g.beginPath(); g.moveTo(-2.6 * s, y); g.lineTo(2.6 * s, y); g.stroke(); }
    }
    pleats(3);
  }
  else if (kind === 'plain') { armor(2); pleats(3); }
  else if (kind === 'rag')   {                  /* 破れ — 黄巾賊。整った札がない */
    g.beginPath(); g.moveTo(-2.6 * s, (B.shy + 5) * s); g.lineTo(1.4 * s, (B.shy + 6.4) * s); g.stroke();
    g.beginPath(); g.moveTo(-1.2 * s, (B.hy - 1.4) * s); g.lineTo(2.2 * s, (B.hy - 2.6) * s); g.stroke();
  }
}

/* 裾の破れ。黄巾賊だけ輪郭の下端がギザつく */
function pTatter(g, s, B) {
  g.beginPath();
  g.moveTo(-B.sk * 0.9 * s, (B.skY + 0.4) * s);
  g.lineTo(-B.sk * 0.7 * s, (B.skY - 3.4) * s);
  g.lineTo(-B.sk * 0.34 * s, (B.skY - 0.6) * s);
  g.lineTo(0.2 * s, (B.skY - 4.0) * s);
  g.lineTo(B.sk * 0.34 * s, (B.skY - 0.8) * s);
  g.lineTo(B.sk * 0.7 * s, (B.skY - 3.0) * s);
  g.lineTo(B.sk * 0.9 * s, (B.skY + 0.4) * s);
  g.closePath(); g.fill();
}

/* ============ 馬 ============ */
function pHorse(g, s, step) {
  const legs = step ? [[-9, -4.4], [-4, 3.2], [4.5, -3.2], [9.5, 4.4]] : [[-9, 3.2], [-4, -3.2], [4.5, 4.4], [9.5, -3.2]];
  legs.forEach(p => {
    const lx = p[0] * s, off = p[1] * s;
    g.beginPath();
    g.moveTo(lx - 1.5 * s, -11.5 * s); g.lineTo(lx + 1.5 * s, -11.5 * s);
    g.lineTo(lx + off + 1.2 * s, -0.5 * s); g.lineTo(lx + off + 2.9 * s, -0.5 * s);
    g.lineTo(lx + off + 2.7 * s, 0); g.lineTo(lx + off - 1.2 * s, 0);
    g.closePath(); g.fill();
  });
  g.beginPath();                                                       /* 胴 */
  g.moveTo(-13.5 * s, -13.5 * s);
  g.quadraticCurveTo(-2 * s, -21 * s, 11 * s, -17 * s);
  g.lineTo(13.5 * s, -11 * s);
  g.quadraticCurveTo(0, -8.4 * s, -12.5 * s, -10 * s);
  g.closePath(); g.fill();
  g.beginPath();                                                       /* 首と頭 */
  g.moveTo(9 * s, -17.5 * s);
  g.quadraticCurveTo(18 * s, -23 * s, 19 * s, -29.5 * s);
  g.lineTo(25 * s, -30.5 * s);
  g.lineTo(24.4 * s, -26 * s);
  g.lineTo(17.6 * s, -23.6 * s);
  g.quadraticCurveTo(15.4 * s, -18.6 * s, 12 * s, -15.8 * s);
  g.closePath(); g.fill();
  g.beginPath();                                                       /* 鬣 */
  g.moveTo(10 * s, -18.5 * s);
  g.lineTo(13.4 * s, -26 * s); g.lineTo(15.6 * s, -22.6 * s);
  g.lineTo(17.2 * s, -27.6 * s); g.lineTo(18.8 * s, -24.6 * s);
  g.lineTo(19.4 * s, -28.6 * s);
  g.closePath(); g.fill();
  g.beginPath();                                                       /* 尾 */
  g.moveTo(-12.5 * s, -16.6 * s);
  g.quadraticCurveTo(-22 * s, -14.4 * s, -21 * s, -3.4 * s);
  g.lineTo(-17.2 * s, -4.6 * s);
  g.quadraticCurveTo(-17.8 * s, -12.4 * s, -11.4 * s, -13.4 * s);
  g.closePath(); g.fill();
}

/* ============ 一体を彫る ============ */
/* 彩色の上へ墨で描き戻す層。冠・髭・腕・得物は染めた皮ではないので暗いまま残る */
function puppetDark(g, s, B, C) {
  if (C.pauldron) { pPauldron(g, s, B, C.pauldron); pBelt(g, s, B); }
  pCrown(g, s, B, C.crown);
  pArm(g, s, B, C.armW);
  pWeapon(g, s, B, C.weapon);
  if (C.beard) {                                 /* 髭は最後。得物の陰に潜らせない */
    const keep = g.fillStyle;
    g.fillStyle = BEARD_TONE[C.beard] || '#191007';
    pBeard(g, s, B, C.beard);
    g.fillStyle = keep;
  }
}

function puppet(g, s, B, C, step) {
  if (C.cape) { pCape(g, s, B, step ? 2.4 : 0.7, C.capeLong || 1); }
  pLegs(g, s, B, step);
  pSkirt(g, s, B, step ? 0.9 : 0);
  if (C.tatter) pTatter(g, s, B);
  pTorso(g, s, B);
  if (C.pauldron) pPauldron(g, s, B, C.pauldron);
  if (C.bulk) { g.beginPath(); g.ellipse(0.6 * s, (B.shy + 6) * s, B.shw * 1.02 * s, 6.6 * s, 0, 0, TAU); g.fill(); }
  pHead(g, s, B);
  pCrown(g, s, B, C.crown);
  pBeard(g, s, B, C.beard);
  pArm(g, s, B, C.armW);
  pWeapon(g, s, B, C.weapon);
}

/* ============ 武将 ============
   一人ずつ彫る。骨格・かぶりもの・髭・武器の四つが全員違う。
   色を全部消しても呂布の雉尾・関羽の髯・諸葛亮の綸巾・許褚の巨躯で名前が出るのが合格線。
*/
const HERO_CARVE = {
  guanyu:        { build: 'broad', pauldron: 1.15, crown: 'wrap',     beard: 'five',    weapon: 'guandao',      cape: 1, capeLong: 1.3, cut: 'ring',    armW: 1.15 },
  zhangfei:      { build: 'giant', pauldron: 1.3, crown: 'plume',    beard: 'tiger',   weapon: 'serpent',      cape: 0,                cut: 'lattice', armW: 1.35 },
  zhaoyun:       { build: 'slim',  pauldron: 0.85, crown: 'spike',    beard: 0,         weapon: 'spear',        cape: 1, capeLong: 1.5, cut: 'scale',   armW: 0.9 },
  lubu:          { build: 'broad', pauldron: 1.35, crown: 'pheasant', beard: 0,         weapon: 'halberd',      cape: 1, capeLong: 1.2, cut: 'cloud',   armW: 1.2 },
  zhugeliang:    { build: 'robe',  crown: 'scholar',  beard: 'thin',    weapon: 'fan',          cape: 1, capeLong: 1.9, cut: 'trigram', armW: 0.85 },
  huangzhong:    { build: 'std',   pauldron: 0.95, crown: 'bun',      beard: 'white',   weapon: 'bowDraw',      cape: 0,                cut: 'plain',   armW: 1.0 },
  xiahoudun:     { build: 'broad', pauldron: 1.25, crown: 'nape',     beard: 'tiger',   weapon: 'dao',          cape: 0,                cut: 'scale',   armW: 1.2 },
  ganning:       { build: 'std',   pauldron: 0.8, crown: 'sash',     beard: 0,         weapon: 'twin',         cape: 0,                cut: 'lattice', armW: 1.0 },
  sunshangxiang: { build: 'fem',   pauldron: 0.75, crown: 'loops',    beard: 0,         weapon: 'repeater',     cape: 1, capeLong: 1.1, cut: 'cloud',   armW: 0.8 },
  xuchu:         { build: 'giant', crown: 'mane',     beard: 'stubble', weapon: 'greatblade',   cape: 0,                cut: 'plain',   armW: 1.5, bulk: 1 },
};

const H_S = 1.62, H_W = 118, H_H = 108, H_OX = 50, H_OY = 101;

function heroSprite(hero, step) {
  const C = HERO_CARVE[hero.id] || HERO_CARVE.zhaoyun;
  const P = HERO_PAINT[hero.id] || HERO_PAINT.zhaoyun;
  const B = BUILD[C.build];
  return carve('hc_' + hero.id + '_' + (step ? 1 : 0), H_W, H_H, H_OX, H_OY, {
    ink: P.ink, rim: 0.95,
    shape: g => puppet(g, H_S, B, C, step),
    paint: g => {                                  /* 彩色は一色だけ。袍の面にだけ乗せ、頭と得物は墨のまま */
      g.fillStyle = P.coat;
      pSkirt(g, H_S, B, step ? 0.9 : 0);
      pTorso(g, H_S, B);
      g.fillStyle = FACE_HERO; pHead(g, H_S, B);
    },
    over: g => puppetDark(g, H_S, B, C),
    cut: g => pCut(g, H_S, B, C.cut),
    top: (B.hdy - 13) * H_S,
  });
}

/* ============ 雑兵 ============
   彩色されない影。だからこそ型・かぶりもの・得物の三つで割る。
*/
const ENEMY_CARVE = {
  zoku: { build: 'slim',  crown: 'turban', weapon: 'sabre',     s: 1.20, cut: 'rag',     tatter: 1 },
  hei:  { build: 'std',   pauldron: 0.8, crown: 'iron',   weapon: 'pike',      s: 1.24, cut: 'plain' },
  kyu:  { build: 'slim',  crown: 'iron',   weapon: 'bowSimple', s: 1.20, cut: 'plain',   quiver: 1 },
  ju:   { build: 'giant', pauldron: 1.4, crown: 'nape',   weapon: 'shield',    s: 1.50, cut: 'scale',   bulk: 1, armW: 1.4 },
  gou:  { build: 'broad', pauldron: 1.3, crown: 'plume',  weapon: 'ji',        s: 1.66, cut: 'lattice', beard: 'tiger', cape: 1, capeLong: 1.2, armW: 1.2 },
  sen:  { build: 'robe',  crown: 'daoist', weapon: 'banner',    s: 1.48, cut: 'trigram', beard: 'goat',  cape: 1, capeLong: 1.7, armW: 0.85 },
};

const E_W = 112, E_H = 104, E_OX = 44, E_OY = 97;
const K_W = 138, K_H = 108, K_OX = 62, K_OY = 101;

/* 矢筒。弓兵の背に一つだけ差す */
function pQuiver(g, s, B) {
  g.save(); g.translate(-B.shw * 0.9 * s, (B.shy + 1) * s); g.rotate(-0.32);
  g.fillRect(-1.9 * s, -2 * s, 3.8 * s, 11 * s);
  for (let i = 0; i < 3; i++) {
    g.beginPath();
    g.moveTo((-1.4 + i * 1.3) * s, -2 * s); g.lineTo((-2.2 + i * 1.3) * s, -6.4 * s);
    g.lineTo((-0.6 + i * 1.3) * s, -6.0 * s); g.closePath(); g.fill();
  }
  g.restore();
}

function enemySprite(key, def, step) {
  const fac = def.fac || 'gun';
  const ink = INK[fac] || INK.gun;
  const ck = 'ec_' + key + '_' + (step ? 1 : 0);

  if (def.body === 'horse') {
    const heavy = key === 'ko';
    const s = heavy ? 1.34 : 1.20;
    const B = BUILD[heavy ? 'broad' : 'std'];
    const C = { crown: heavy ? 'crest' : 'iron', weapon: heavy ? 'dao' : 'pike', armW: heavy ? 1.2 : 1.0, cape: heavy ? 1 : 0, capeLong: 1.1 };
    return carve(ck, K_W, K_H, K_OX, K_OY, {
      ink, rim: 0.9,
      shape: g => {
        pHorse(g, s, step);
        g.save(); g.translate(1.5 * s, -21.5 * s);
        const rs = s * 0.84;
        pSkirt(g, rs, B, 0); pTorso(g, rs, B); pHead(g, rs, B);
        pCrown(g, rs, B, C.crown); pArm(g, rs, B, C.armW); pWeapon(g, rs, B, C.weapon);
        if (C.cape) pCape(g, rs, B, 1.8, C.capeLong);
        g.restore();
      },
      cut: g => {
        g.beginPath(); g.moveTo(-8 * s, -15 * s); g.lineTo(8 * s, -17 * s); g.stroke();
        g.beginPath(); g.arc(-3 * s, -13.4 * s, 2.3 * s, 0, TAU); g.stroke();
        g.beginPath(); g.arc(4 * s, -14.4 * s, 2.3 * s, 0, TAU); g.stroke();
        g.save(); g.translate(1.5 * s, -21.5 * s); pCut(g, s * 0.84, B, 'plain'); g.restore();
      },
      top: -42 * s,
    });
  }

  const C = ENEMY_CARVE[key] || ENEMY_CARVE.hei;
  const B = BUILD[C.build], s = C.s;
  return carve(ck, E_W, E_H, E_OX, E_OY, {
    ink, rim: 0.85,
    shape: g => { if (C.quiver) pQuiver(g, s, B); puppet(g, s, B, C, step); },
    paint: g => { g.fillStyle = FACE_MOB; pHead(g, s, B); },
    over: g => puppetDark(g, s, B, C),
    cut: g => pCut(g, s, B, C.cut),
    top: (B.hdy - 12) * s,
  });
}

/* ============ 大将 ============ */
const BOSS_CARVE = {
  zhangjiao: { build: 'robe',  crown: 'daoist',   beard: 'goat',    weapon: 'staff9',       cape: 1, capeLong: 1.9, cut: 'trigram', armW: 0.9,  ink: '#141002', coat: '#8a6a1e' },
  lubu:      { build: 'broad', pauldron: 1.35, crown: 'pheasant', beard: 0,         weapon: 'halberd',      cape: 1, capeLong: 1.3, cut: 'cloud',   armW: 1.25, ink: '#170807', coat: '#8e2b22' },
  caochun:   { build: 'broad', pauldron: 1.3, crown: 'crest',    beard: 'tiger',   weapon: 'ji',           cape: 1, capeLong: 1.2, cut: 'scale',   armW: 1.2,  ink: '#07101c', coat: '#28425f' },
  caiMao:    { build: 'std',   pauldron: 0.9, crown: 'conical',  beard: 'white',   weapon: 'trident',      cape: 1, capeLong: 1.6, cut: 'lattice', armW: 1.05, ink: '#04161a', coat: '#1e5a63' },
  simayi:    { build: 'slim',  crown: 'officer',  beard: 'white',   weapon: 'straightsword', cape: 1, capeLong: 1.8, cut: 'cloud',  armW: 0.9,  ink: '#0d0c14', coat: '#3a3550' },
};

const B_S = 2.75, B_W = 200, B_H = 186, B_OX = 84, B_OY = 174;

function bossSprite(boss, step) {
  const C = BOSS_CARVE[boss.key] || BOSS_CARVE.lubu;
  const B = BUILD[C.build];
  return carve('bc_' + boss.key + '_' + (step ? 1 : 0), B_W, B_H, B_OX, B_OY, {
    ink: C.ink, rim: 1.5,
    shape: g => puppet(g, B_S, B, C, step),
    paint: g => {
      g.fillStyle = C.coat;
      pSkirt(g, B_S, B, step ? 1.1 : 0);
      pTorso(g, B_S, B);
      g.fillStyle = FACE_HERO; pHead(g, B_S, B);
    },
    over: g => puppetDark(g, B_S, B, C),
    cut: g => pCut(g, B_S, B, C.cut),
    top: (B.hdy - 14) * B_S,
  });
}

/* ============ 断片 ============
   皮影人形は首・腕・胴・脚が別板で、糸と鋲で繋がっている。だから壊れ方が正しい。
*/
const SHARD_KINDS = ['head', 'torso', 'arm', 'legs'];
function shardSprite(kind, fac, s) {
  const ink = INK[fac] || INK.gun;
  const B = BUILD.std;
  const ck = 'sc_' + kind + '_' + fac + '_' + Math.round(s * 10);
  const W = 52, H = 52, ox = 24, oy = 26;
  const put = gg => {
    gg.save();
    if (kind === 'head') { gg.translate(0, -B.hdy * s + 4 * s); pHead(gg, s, B); pCrown(gg, s, B, 'iron'); }
    else if (kind === 'torso') { gg.translate(0, -B.shy * s - 6 * s); pTorso(gg, s, B); }
    else if (kind === 'arm') { gg.translate(-3 * s, -B.shy * s - 6 * s); pArm(gg, s, B, 1); pWeapon(gg, s, B, 'sabre'); }
    else { gg.translate(0, 4 * s); pLegs(gg, s, B, true); }
    gg.restore();
  };
  return carve(ck, W, H, ox, oy, { ink, rim: 0.65, shape: put });
}

/* ============ 背景 ============ */
/* 影絵の布。麻目が透け、灯りが後ろから当たる */
function clothTile(base, accent) {
  const ck = 'cloth_' + base + '_' + accent;
  const S = 160;
  return bake(ck, S, S, g => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    g.globalAlpha = 0.05;                 /* 麻の織り目 */
    for (let y = 0; y < S; y += 3) {
      g.fillStyle = y % 6 === 0 ? '#000' : accent;
      g.fillRect(0, y, S, 1);
    }
    for (let x = 0; x < S; x += 3) {
      g.fillStyle = x % 6 === 0 ? accent : '#000';
      g.fillRect(x, 0, 1, S);
    }
    g.globalAlpha = 0.055;                /* 布の皺と染み */
    for (let i = 0; i < 18; i++) {
      g.fillStyle = Math.random() < 0.5 ? '#000' : accent;
      g.beginPath();
      g.ellipse(Math.random() * S, Math.random() * S, rnd(10, 46), rnd(3, 12), rnd(TAU), 0, TAU);
      g.fill();
    }
    g.globalAlpha = 1;
  });
}

/* 被弾の白光。source-atop はオフスクリーンの中でだけ使う */
function flashSprite(sp) {
  const f = bake('f_' + sp.key, sp.w, sp.h, g => {
    g.drawImage(sp.c, 0, 0, sp.w, sp.h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#fff0cc';
    g.fillRect(0, 0, sp.w, sp.h);
  });
  f.ox = sp.ox; f.oy = sp.oy; f.top = sp.top;
  return f;
}
