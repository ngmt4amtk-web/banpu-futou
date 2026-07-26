/* 萬夫不當 — 描画基盤・音・皮影（影絵）スプライト
   夜の影絵小屋。布の後ろの一灯だけが光源で、雑兵は黒い切り絵、武将だけが彩色人形。
   皮影の人形は関節で分かれている——だから斬られると分解して飛ぶ。
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

/* ============ 皮影の色 ============ */
/* 灯りは布の後ろにある。だから布が明るく、人形が暗い。この明暗が逆になると影絵は成立しない。
   人形は染めた獣皮で、光が透けるぶん真っ黒にはならず、陣営の色味だけが濃く残る。 */
const SHADOW = {
  kou: '#181101', wei: '#031327', wu: '#280602', gun: '#1e062d', shu: '#01160b',
};
/* 縁は墨の輪郭。1倍表示では胴より先にこの線が形を伝える */
const SHADOW_EDGE = {
  kou: '#0d0900', wei: '#010a16', wu: '#160301', gun: '#100318', shu: '#000b05',
};
/* 武将は彩色された人形。ここだけ色が入る */
const HERO_PAINT = {
  guanyu:       { robe: '#3d8f52', trim: '#f0cf4a', skin: '#c04a34', hair: '#241a10' },
  zhangfei:     { robe: '#4a423a', trim: '#c09a3a', skin: '#a06848', hair: '#1a120c' },
  zhaoyun:      { robe: '#c2d0dc', trim: '#ffffff', skin: '#c08a66', hair: '#241c16' },
  lubu:         { robe: '#c8402e', trim: '#ffd75a', skin: '#c08a66', hair: '#241a10' },
  zhugeliang:   { robe: '#efe8d4', trim: '#9aae86', skin: '#c08a66', hair: '#342a1c' },
  huangzhong:   { robe: '#a8803c', trim: '#f0cf4a', skin: '#c08a66', hair: '#e8e0d0' },
  xiahoudun:    { robe: '#3f86ae', trim: '#bcd8e8', skin: '#b07850', hair: '#1e1610' },
  ganning:      { robe: '#c03a52', trim: '#f0d45a', skin: '#c08a66', hair: '#241a10' },
  sunshangxiang:{ robe: '#e04c66', trim: '#ffe07a', skin: '#d09a78', hair: '#241a10' },
  xuchu:        { robe: '#8a7050', trim: '#c8b070', skin: '#c08a66', hair: '#1e1610' },
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

/* ============ 皮影の部品 ============
   すべて横向きで描く。影絵の様式であり、同時に武器の形が輪郭に出る。
   基準は足元 (0,0)。呼ぶ側で translate してから使う。
*/

function pcTorso(g, s) {
  g.beginPath();
  g.moveTo(-3.2 * s, -9 * s);
  g.lineTo(-4.6 * s, -19 * s);
  g.lineTo(-2.0 * s, -22.5 * s);
  g.lineTo(3.4 * s, -22.5 * s);
  g.lineTo(5.2 * s, -18 * s);
  g.lineTo(4.0 * s, -9.5 * s);
  g.closePath(); g.fill();
  g.beginPath();                       /* 草摺（腰の垂れ） */
  g.moveTo(-3.6 * s, -10 * s);
  g.lineTo(4.4 * s, -10.5 * s);
  g.lineTo(3.6 * s, -4.2 * s);
  g.lineTo(-3.0 * s, -3.8 * s);
  g.closePath(); g.fill();
}

function pcHead(g, s, helm) {
  const cx = 1.0 * s, cy = -27 * s;
  g.beginPath();                       /* 横顔。鼻梁と顎の切れが顔立ちを決める */
  g.moveTo(cx - 3.4 * s, cy + 3.6 * s);
  g.lineTo(cx - 3.8 * s, cy - 1.6 * s);
  g.quadraticCurveTo(cx - 2.6 * s, cy - 5.0 * s, cx + 0.8 * s, cy - 4.9 * s);
  g.quadraticCurveTo(cx + 3.6 * s, cy - 4.6 * s, cx + 4.0 * s, cy - 1.4 * s);
  g.lineTo(cx + 4.6 * s, cy + 0.4 * s);
  g.lineTo(cx + 3.0 * s, cy + 1.0 * s);
  g.lineTo(cx + 3.2 * s, cy + 3.0 * s);
  g.lineTo(cx + 0.6 * s, cy + 4.2 * s);
  g.closePath(); g.fill();
  g.fillRect(cx - 1.8 * s, cy + 3.4 * s, 3.4 * s, 2.4 * s);

  if (helm === 'kou') {
    g.beginPath();
    g.moveTo(cx - 3.9 * s, cy - 1.4 * s);
    g.quadraticCurveTo(cx + 0.4 * s, cy - 6.0 * s, cx + 4.0 * s, cy - 1.8 * s);
    g.lineTo(cx + 3.6 * s, cy - 0.6 * s);
    g.quadraticCurveTo(cx + 0.4 * s, cy - 5.2 * s, cx - 3.6 * s, cy - 0.4 * s);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(cx - 3.6 * s, cy - 2.6 * s);
    g.lineTo(cx - 8.4 * s, cy + 1.6 * s);
    g.lineTo(cx - 7.0 * s, cy + 2.6 * s);
    g.lineTo(cx - 3.2 * s, cy - 0.6 * s);
    g.closePath(); g.fill();
  } else if (helm === 'iron') {
    g.beginPath();
    g.moveTo(cx - 4.4 * s, cy - 1.0 * s);
    g.quadraticCurveTo(cx + 0.2 * s, cy - 8.2 * s, cx + 4.6 * s, cy - 1.2 * s);
    g.closePath(); g.fill();
    g.fillRect(cx - 5.0 * s, cy - 1.6 * s, 10.0 * s, 1.5 * s);
  } else if (helm === 'plume') {
    g.beginPath();
    g.moveTo(cx - 4.8 * s, cy - 1.2 * s);
    g.quadraticCurveTo(cx + 0.2 * s, cy - 9.0 * s, cx + 5.0 * s, cy - 1.4 * s);
    g.closePath(); g.fill();
    g.fillRect(cx - 5.6 * s, cy - 2.0 * s, 11.2 * s, 1.7 * s);
    g.beginPath();
    g.moveTo(cx + 0.2 * s, cy - 8.2 * s);
    g.lineTo(cx - 1.4 * s, cy - 15.6 * s);
    g.lineTo(cx + 1.0 * s, cy - 14.2 * s);
    g.lineTo(cx + 2.4 * s, cy - 15.8 * s);
    g.lineTo(cx + 2.0 * s, cy - 8.0 * s);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(cx - 5.0 * s, cy - 1.6 * s);
    g.lineTo(cx - 8.6 * s, cy + 2.4 * s);
    g.lineTo(cx - 4.4 * s, cy + 2.0 * s);
    g.closePath(); g.fill();
  } else if (helm === 'kerchief') {
    g.beginPath();
    g.moveTo(cx - 4.8 * s, cy - 1.6 * s);
    g.lineTo(cx - 4.2 * s, cy - 7.6 * s);
    g.lineTo(cx + 4.8 * s, cy - 7.2 * s);
    g.lineTo(cx + 5.0 * s, cy - 1.4 * s);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(cx - 4.4 * s, cy - 4.0 * s);
    g.lineTo(cx - 9.0 * s, cy + 3.4 * s);
    g.lineTo(cx - 7.2 * s, cy + 4.0 * s);
    g.lineTo(cx - 3.8 * s, cy - 2.0 * s);
    g.closePath(); g.fill();
  }
}

function pcBeard(g, s, kind) {
  const cx = 1.0 * s, cy = -27 * s;
  g.beginPath();
  if (kind === 'long') {                 /* 関羽の美髯 */
    g.moveTo(cx + 3.2 * s, cy + 1.4 * s);
    g.quadraticCurveTo(cx + 5.0 * s, cy + 8.0 * s, cx + 2.2 * s, cy + 13.0 * s);
    g.quadraticCurveTo(cx + 0.6 * s, cy + 8.0 * s, cx - 0.4 * s, cy + 4.2 * s);
  } else if (kind === 'bristle') {       /* 虎髭 */
    g.moveTo(cx + 3.0 * s, cy + 0.8 * s);
    g.lineTo(cx + 7.0 * s, cy + 2.0 * s);
    g.lineTo(cx + 4.0 * s, cy + 3.0 * s);
    g.lineTo(cx + 6.4 * s, cy + 5.4 * s);
    g.lineTo(cx + 2.6 * s, cy + 4.4 * s);
    g.lineTo(cx + 0.2 * s, cy + 6.2 * s);
    g.lineTo(cx + 0.4 * s, cy + 3.4 * s);
  } else {                                /* 老将の白髯 */
    g.moveTo(cx + 3.0 * s, cy + 1.2 * s);
    g.quadraticCurveTo(cx + 4.4 * s, cy + 6.4 * s, cx + 1.6 * s, cy + 9.4 * s);
    g.quadraticCurveTo(cx + 0.2 * s, cy + 6.0 * s, cx - 0.6 * s, cy + 3.8 * s);
  }
  g.closePath(); g.fill();
}

function pcLegs(g, s, step) {
  const sp = step ? 4.6 : 1.4;
  g.beginPath();
  g.moveTo(-2.6 * s, -5 * s); g.lineTo(-1.0 * s, -5 * s);
  g.lineTo((-sp + 1.4) * s, -0.4 * s); g.lineTo((-sp - 1.4) * s, -0.4 * s);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(1.0 * s, -5 * s); g.lineTo(3.0 * s, -5 * s);
  g.lineTo((sp + 1.8) * s, -0.4 * s); g.lineTo((sp - 1.0) * s, -0.4 * s);
  g.closePath(); g.fill();
}

function pcCape(g, s, sway) {
  g.beginPath();
  g.moveTo(-4.0 * s, -21 * s);
  g.quadraticCurveTo((-11 - sway) * s, -12 * s, (-9 - sway * 1.6) * s, -1.5 * s);
  g.lineTo(-5.4 * s, -2.4 * s);
  g.quadraticCurveTo(-6.6 * s, -11 * s, -1.6 * s, -19 * s);
  g.closePath(); g.fill();
}

/* 武器を持つ腕。ここが武将の見分けになる */
function pcArm(g, s, kind) {
  const hx = 4.4 * s, hy = -17.5 * s;
  const shaft = (x1, y1, x2, y2, w) => {
    const a = Math.atan2(y2 - y1, x2 - x1), n = a + Math.PI / 2;
    const dx = Math.cos(n) * w / 2, dy = Math.sin(n) * w / 2;
    g.beginPath();
    g.moveTo(x1 + dx, y1 + dy); g.lineTo(x2 + dx, y2 + dy);
    g.lineTo(x2 - dx, y2 - dy); g.lineTo(x1 - dx, y1 - dy);
    g.closePath(); g.fill();
  };

  g.beginPath();                          /* 腕 */
  g.moveTo(2.4 * s, -21 * s);
  g.lineTo(hx + 1.4 * s, hy - 1.0 * s);
  g.lineTo(hx + 0.4 * s, hy + 2.2 * s);
  g.lineTo(1.2 * s, -18.6 * s);
  g.closePath(); g.fill();

  if (kind === 'guandao') {               /* 青龍偃月刀 — 反りが命 */
    shaft(hx - 5 * s, hy + 11 * s, hx + 7 * s, hy - 15 * s, 1.7 * s);
    g.beginPath();
    g.moveTo(hx + 7 * s, hy - 15 * s);
    g.quadraticCurveTo(hx + 17 * s, hy - 18 * s, hx + 15.5 * s, hy - 5.5 * s);
    g.quadraticCurveTo(hx + 13 * s, hy - 12 * s, hx + 5.5 * s, hy - 11.5 * s);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(hx - 5 * s, hy + 11 * s); g.lineTo(hx - 7.6 * s, hy + 15 * s);
    g.lineTo(hx - 4.2 * s, hy + 13.4 * s); g.closePath(); g.fill();
  } else if (kind === 'serpent') {        /* 丈八蛇矛 — 穂先がうねる */
    shaft(hx - 7 * s, hy + 12 * s, hx + 8 * s, hy - 13 * s, 1.5 * s);
    g.beginPath();
    g.moveTo(hx + 8 * s, hy - 13 * s);
    g.quadraticCurveTo(hx + 13 * s, hy - 17 * s, hx + 9.5 * s, hy - 21 * s);
    g.quadraticCurveTo(hx + 14 * s, hy - 23 * s, hx + 11 * s, hy - 28 * s);
    g.lineTo(hx + 13 * s, hy - 27 * s);
    g.quadraticCurveTo(hx + 16.5 * s, hy - 21 * s, hx + 12 * s, hy - 19 * s);
    g.quadraticCurveTo(hx + 15 * s, hy - 15.5 * s, hx + 10 * s, hy - 12 * s);
    g.closePath(); g.fill();
  } else if (kind === 'halberd') {        /* 方天画戟 — 左右の枝 */
    shaft(hx - 6 * s, hy + 12 * s, hx + 8 * s, hy - 17 * s, 1.7 * s);
    g.beginPath();
    g.moveTo(hx + 8 * s, hy - 17 * s);
    g.lineTo(hx + 9.6 * s, hy - 26 * s);
    g.lineTo(hx + 7.0 * s, hy - 24.5 * s);
    g.closePath(); g.fill();
    [[1, 0], [-1, 1]].forEach(function (p) {
      const d = p[0], o = p[1];
      g.beginPath();
      g.moveTo(hx + 7.4 * s, (hy - 19 - o * 2) * s / s);
      g.moveTo(hx + 7.4 * s, hy - (19 + o * 2) * s / s * 1);
      g.closePath();
      g.beginPath();
      g.moveTo(hx + 7.4 * s, hy - 19 * s + o * 2 * s);
      g.quadraticCurveTo(hx + (7.4 + d * 9) * s, hy - 22 * s + o * 2 * s, hx + (7.4 + d * 8) * s, hy - 15 * s + o * 2 * s);
      g.quadraticCurveTo(hx + (7.4 + d * 5) * s, hy - 18 * s + o * 2 * s, hx + 7.4 * s, hy - 16.5 * s + o * 2 * s);
      g.closePath(); g.fill();
    });
  } else if (kind === 'spear') {
    shaft(hx - 6 * s, hy + 12 * s, hx + 7 * s, hy - 15 * s, 1.3 * s);
    g.beginPath();
    g.moveTo(hx + 7 * s, hy - 15 * s);
    g.lineTo(hx + 9.6 * s, hy - 25 * s);
    g.lineTo(hx + 5.2 * s, hy - 22 * s);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(hx + 5.6 * s, hy - 15.4 * s); g.lineTo(hx + 9.4 * s, hy - 16.4 * s);
    g.lineTo(hx + 7.4 * s, hy - 11.4 * s); g.closePath(); g.fill();
  } else if (kind === 'sword') {          /* 環首刀 */
    shaft(hx - 1 * s, hy + 3 * s, hx + 8 * s, hy - 13 * s, 1.9 * s);
    g.beginPath(); g.arc(hx - 1.6 * s, hy + 4.4 * s, 2.0 * s, 0, TAU); g.fill();
  } else if (kind === 'bow') {
    g.lineWidth = 1.5 * s; g.strokeStyle = g.fillStyle;
    g.beginPath(); g.arc(hx + 5 * s, hy - 4 * s, 11 * s, -1.35, 1.35); g.stroke();
    g.lineWidth = 0.7 * s;
    g.beginPath();
    g.moveTo(hx + 7.4 * s, hy - 14.7 * s); g.lineTo(hx + 2.2 * s, hy - 4 * s);
    g.lineTo(hx + 7.4 * s, hy + 6.7 * s); g.stroke();
  } else if (kind === 'axe') {
    shaft(hx - 5 * s, hy + 11 * s, hx + 6 * s, hy - 14 * s, 1.8 * s);
    g.beginPath();
    g.moveTo(hx + 6 * s, hy - 14 * s);
    g.quadraticCurveTo(hx + 16 * s, hy - 18 * s, hx + 14 * s, hy - 5 * s);
    g.quadraticCurveTo(hx + 10 * s, hy - 9 * s, hx + 4.6 * s, hy - 9.6 * s);
    g.closePath(); g.fill();
  } else if (kind === 'fan') {            /* 白羽扇 */
    g.beginPath();
    g.moveTo(hx + 1 * s, hy + 2 * s);
    g.quadraticCurveTo(hx + 12 * s, hy - 2 * s, hx + 10 * s, hy - 13 * s);
    g.quadraticCurveTo(hx + 4 * s, hy - 7 * s, hx + 0.4 * s, hy - 0.6 * s);
    g.closePath(); g.fill();
  } else if (kind === 'twin') {
    shaft(hx - 1 * s, hy + 2 * s, hx + 9 * s, hy - 6 * s, 1.5 * s);
    shaft(hx - 2 * s, hy + 5 * s, hx + 6 * s, hy + 12 * s, 1.3 * s);
  } else if (kind === 'staff') {          /* 九節杖 */
    shaft(hx - 3 * s, hy + 14 * s, hx + 4 * s, hy - 24 * s, 1.6 * s);
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      g.arc(hx + (-2.4 + i * 1.3) * s, hy + (9 - i * 6.6) * s, 1.5 * s, 0, TAU); g.fill();
    }
    g.beginPath(); g.arc(hx + 4 * s, hy - 25 * s, 3.4 * s, 0, TAU); g.fill();
  }
}

/* 皮影の透かし彫り。塗った影から線を抜くと、そこだけ光が通る */
function pcCutouts(g, s, kind) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.lineCap = 'round';
  g.lineWidth = Math.max(0.55, 0.62 * s);
  g.strokeStyle = '#000';
  for (let i = 0; i < 3; i++) {           /* 鎧の札 */
    const y = (-19 + i * 3.1) * s;
    g.beginPath(); g.moveTo(-3.2 * s, y); g.lineTo(4.2 * s, y - 0.3 * s); g.stroke();
  }
  for (let i = 0; i < 3; i++) {           /* 草摺の縦割り */
    const x = (-2.0 + i * 2.4) * s;
    g.beginPath(); g.moveTo(x, -9.4 * s); g.lineTo(x - 0.2 * s, -4.6 * s); g.stroke();
  }
  if (kind === 'elite' || kind === 'hero') {
    g.beginPath(); g.arc(0.6 * s, -15.2 * s, 1.9 * s, 0, TAU); g.stroke();
  }
  g.restore();
}

function pcHorse(g, s, step) {
  const legs = step ? [[-9, -4], [-4, 3], [4, -3], [9, 4]] : [[-9, 3], [-4, -3], [4, 4], [9, -3]];
  legs.forEach(function (p) {
    const lx = p[0], off = p[1];
    g.beginPath();
    g.moveTo((lx - 1.3) * s, -11 * s); g.lineTo((lx + 1.3) * s, -11 * s);
    g.lineTo((lx + off + 1.1) * s, -0.4 * s); g.lineTo((lx + off - 1.1) * s, -0.4 * s);
    g.closePath(); g.fill();
  });
  g.beginPath();
  g.moveTo(-13 * s, -13 * s);
  g.quadraticCurveTo(-2 * s, -20 * s, 11 * s, -16 * s);
  g.lineTo(13 * s, -11 * s);
  g.quadraticCurveTo(0 * s, -8 * s, -12 * s, -10 * s);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(9 * s, -17 * s);
  g.quadraticCurveTo(17 * s, -22 * s, 18 * s, -28 * s);
  g.lineTo(23 * s, -29 * s);
  g.lineTo(22.5 * s, -25 * s);
  g.lineTo(17 * s, -23 * s);
  g.quadraticCurveTo(15 * s, -18 * s, 12 * s, -15.5 * s);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(10 * s, -18 * s);
  g.lineTo(13 * s, -25 * s); g.lineTo(15 * s, -22 * s);
  g.lineTo(16.5 * s, -26.5 * s); g.lineTo(18 * s, -24 * s);
  g.lineTo(18.5 * s, -27.5 * s);
  g.closePath(); g.fill();
  g.beginPath();
  g.moveTo(-12 * s, -16 * s);
  g.quadraticCurveTo(-21 * s, -14 * s, -20 * s, -4 * s);
  g.lineTo(-16.5 * s, -5 * s);
  g.quadraticCurveTo(-17 * s, -12 * s, -11 * s, -13 * s);
  g.closePath(); g.fill();
}

function pcCutoutsHorse(g, s) {
  g.save();
  g.globalCompositeOperation = 'destination-out';
  g.lineWidth = Math.max(0.55, 0.6 * s); g.strokeStyle = '#000'; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-8 * s, -14.5 * s); g.lineTo(8 * s, -16.5 * s); g.stroke();
  g.beginPath(); g.arc(-3 * s, -13 * s, 2.2 * s, 0, TAU); g.stroke();
  g.beginPath(); g.arc(4 * s, -14 * s, 2.2 * s, 0, TAU); g.stroke();
  g.restore();
}

/* ============ 一体を焼く ============ */
function bakePuppet(key, W, H, ox, oy, build) {
  const sp = bake(key, W, H, g => { g.translate(ox, oy); build(g); });
  sp.ox = ox; sp.oy = oy;
  return sp;
}

const HERO_SHAPE = {
  guanyu:       { arm: 'guandao',  helm: 'plume',    beard: 'long',    cape: 1 },
  zhangfei:     { arm: 'serpent',  helm: 'plume',    beard: 'bristle', cape: 1 },
  zhaoyun:      { arm: 'spear',    helm: 'plume',    beard: 0,         cape: 1 },
  lubu:         { arm: 'halberd',  helm: 'plume',    beard: 0,         cape: 1 },
  zhugeliang:   { arm: 'fan',      helm: 'kerchief', beard: 'white',   cape: 1 },
  huangzhong:   { arm: 'bow',      helm: 'iron',     beard: 'white',   cape: 0 },
  xiahoudun:    { arm: 'guandao',  helm: 'plume',    beard: 'bristle', cape: 1 },
  ganning:      { arm: 'twin',     helm: 'kerchief', beard: 0,         cape: 1 },
  sunshangxiang:{ arm: 'bow',      helm: 'plume',    beard: 0,         cape: 1 },
  xuchu:        { arm: 'axe',      helm: 'iron',     beard: 'bristle', cape: 0 },
};

/* 武将 = 彩色された皮影人形 */
function heroSprite(hero, step) {
  const sh = HERO_SHAPE[hero.id] || HERO_SHAPE.zhaoyun;
  const p = HERO_PAINT[hero.id] || HERO_PAINT.zhaoyun;
  const s = 1.5, W = 84, H = 66, ox = 28, oy = 60;
  return bakePuppet('h_' + hero.id + '_' + (step ? 1 : 0), W, H, ox, oy, g => {
    if (sh.cape) { g.fillStyle = p.trim; g.globalAlpha = 0.62; pcCape(g, s, step ? 2.2 : 0.6); g.globalAlpha = 1; }
    g.fillStyle = p.robe; pcLegs(g, s, step); pcTorso(g, s);
    g.fillStyle = p.skin; pcHead(g, s, null);
    g.fillStyle = p.trim; pcHead(g, s, sh.helm);
    if (sh.beard) { g.fillStyle = p.hair; pcBeard(g, s, sh.beard); }
    g.fillStyle = p.trim; pcArm(g, s, sh.arm);
    pcCutouts(g, s, 'hero');
    g.save();                              /* 獣皮を切った縁の墨。明るい布から彩色人形を切り離す */
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(26,14,4,0.92)';
    if (sh.cape) pcCape(g, s * 1.07, step ? 2.2 : 0.6);
    pcLegs(g, s * 1.09, step); pcTorso(g, s * 1.09);
    pcHead(g, s * 1.09, sh.helm); pcArm(g, s * 1.09, sh.arm);
    g.restore();
  });
}

const ENEMY_SHAPE = {
  zoku: { arm: 'sword',   helm: 'kou',   s: 1.18, tatter: 1 },
  hei:  { arm: 'sword',   helm: 'iron',  s: 1.2 },
  kyu:  { arm: 'bow',     helm: 'iron',  s: 1.16 },
  ju:   { arm: 'axe',     helm: 'iron',  s: 1.5, bulk: 1 },
  gou:  { arm: 'halberd', helm: 'plume', s: 1.62, cape: 1, beard: 'bristle' },
  sen:  { arm: 'staff',   helm: 'kou',   s: 1.42, cape: 1, beard: 'white' },
};

/* 雑兵 = 無彩色の影。陣営の色味だけが皮を透ける */
function enemySprite(key, def, step) {
  const f = def.fac || 'gun';
  const col = SHADOW[f] || SHADOW.gun;
  const edge = SHADOW_EDGE[f] || SHADOW_EDGE.gun;
  const ck = 'e_' + key + '_' + (step ? 1 : 0);

  if (def.body === 'horse') {
    const s = 1.22, W = 92, H = 66, ox = 36, oy = 61;
    return bakePuppet(ck, W, H, ox, oy, g => {
      g.fillStyle = col; pcHorse(g, s, step);
      g.save(); g.translate(1.5 * s, -20 * s);
      g.fillStyle = col;
      pcTorso(g, s * 0.86); pcHead(g, s * 0.86, 'iron');
      pcArm(g, s * 0.86, key === 'ko' ? 'spear' : 'sword');
      g.restore();
      pcCutoutsHorse(g, s);
      g.save();
      g.globalCompositeOperation = 'destination-over';
      g.fillStyle = edge; g.globalAlpha = 0.88;
      pcHorse(g, s * 1.045, step);
      g.translate(1.5 * s, -20 * s);
      pcTorso(g, s * 0.9); pcHead(g, s * 0.9, 'iron');
      g.restore();
    });
  }

  const sh = ENEMY_SHAPE[key] || ENEMY_SHAPE.hei;
  const s = sh.s, W = 72, H = 64, ox = 24, oy = 59;
  return bakePuppet(ck, W, H, ox, oy, g => {
    g.fillStyle = col;
    if (sh.cape) pcCape(g, s, step ? 2.0 : 0.5);
    pcLegs(g, s, step);
    pcTorso(g, s);
    if (sh.bulk) { g.beginPath(); g.ellipse(0.6 * s, -16 * s, 6.4 * s, 7.2 * s, 0, 0, TAU); g.fill(); }
    pcHead(g, s, sh.helm);
    if (sh.beard) pcBeard(g, s, sh.beard);
    pcArm(g, s, sh.arm);
    if (sh.tatter) {                       /* 黄巾賊の破れた裾 */
      g.beginPath();
      g.moveTo(-3.4 * s, -5.4 * s);
      g.lineTo(-4.6 * s, -1.0 * s); g.lineTo(-2.6 * s, -3.0 * s);
      g.lineTo(-1.4 * s, -0.6 * s); g.lineTo(0.4 * s, -3.4 * s);
      g.lineTo(1.8 * s, -0.8 * s); g.lineTo(3.6 * s, -5.0 * s);
      g.closePath(); g.fill();
    }
    pcCutouts(g, s, sh.cape ? 'elite' : 'grunt');
    g.save();
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = edge; g.globalAlpha = 0.88;
    if (sh.cape) pcCape(g, s * 1.045, step ? 2.0 : 0.5);
    pcLegs(g, s * 1.04, step); pcTorso(g, s * 1.04);
    pcHead(g, s * 1.04, sh.helm); pcArm(g, s * 1.04, sh.arm);
    g.restore();
  });
}

const BOSS_SHAPE = {
  zhangjiao: { arm: 'staff',   helm: 'kerchief', beard: 'long',    robe: '#8a6a1e', trim: '#e0c860', skin: '#6a4a30' },
  lubu:      { arm: 'halberd', helm: 'plume',    beard: 0,         robe: '#8e2b22', trim: '#e0b93f', skin: '#8a5a44' },
  caochun:   { arm: 'spear',   helm: 'plume',    beard: 'bristle', robe: '#1e3450', trim: '#7a94b4', skin: '#7a4a38' },
  caiMao:    { arm: 'sword',   helm: 'plume',    beard: 'white',   robe: '#1e4a52', trim: '#8ac0c8', skin: '#7a4a38' },
  simayi:    { arm: 'sword',   helm: 'plume',    beard: 'white',   robe: '#2a2a38', trim: '#b0a8c0', skin: '#7a4a38' },
};

function bossSprite(boss, step) {
  const b = BOSS_SHAPE[boss.key] || BOSS_SHAPE.lubu;
  const s = 3.0, W = 168, H = 132, ox = 56, oy = 124;
  return bakePuppet('b_' + boss.key + '_' + (step ? 1 : 0), W, H, ox, oy, g => {
    g.fillStyle = b.trim; g.globalAlpha = 0.6; pcCape(g, s, step ? 2.6 : 1.0); g.globalAlpha = 1;
    g.fillStyle = b.robe; pcLegs(g, s, step); pcTorso(g, s);
    g.fillStyle = b.skin; pcHead(g, s, null);
    g.fillStyle = b.trim; pcHead(g, s, b.helm);
    if (b.beard) { g.fillStyle = '#1a1208'; pcBeard(g, s, b.beard); }
    g.fillStyle = b.trim; pcArm(g, s, b.arm);
    pcCutouts(g, s, 'hero');
    g.save();
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = 'rgba(22,11,3,0.94)';
    pcCape(g, s * 1.06, step ? 2.6 : 1.0);
    pcLegs(g, s * 1.06, step); pcTorso(g, s * 1.06);
    pcHead(g, s * 1.06, b.helm); pcArm(g, s * 1.06, b.arm);
    g.restore();
  });
}

/* ============ 断片 ============
   皮影人形は首・腕・胴・脚が別板で、糸と鋲で繋がっている。だから壊れ方が正しい。
*/
const SHARD_KINDS = ['head', 'torso', 'arm', 'legs'];
function shardSprite(kind, fac, s) {
  const col = SHADOW[fac] || SHADOW.gun;
  const edge = SHADOW_EDGE[fac] || SHADOW_EDGE.gun;
  const ck = 'sh_' + kind + '_' + fac + '_' + Math.round(s * 10);
  const W = 46, H = 46, ox = 20, oy = 23;
  const put = (gg, sc) => {
    gg.save();
    if (kind === 'head') { gg.translate(-1 * sc, 27 * sc); pcHead(gg, sc, 'iron'); }
    else if (kind === 'torso') { gg.translate(0, 16 * sc); pcTorso(gg, sc); }
    else if (kind === 'arm') { gg.translate(-4 * sc, 18 * sc); pcArm(gg, sc, 'sword'); }
    else { gg.translate(0, 3 * sc); pcLegs(gg, sc, true); }
    gg.restore();
  };
  return bakePuppet(ck, W, H, ox, oy, g => {
    g.fillStyle = col; put(g, s);
    g.save();
    g.globalCompositeOperation = 'destination-over';
    g.fillStyle = edge; g.globalAlpha = 0.6;
    put(g, s * 1.08);
    g.restore();
  });
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
  f.ox = sp.ox; f.oy = sp.oy;
  return f;
}
