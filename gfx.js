/* 万夫不当 — 描画基盤・音・スプライトのプリレンダ
   90年代末のプリレンダCG風を、画像アセット無しでコードから焼く
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
    // ノイズ源は一度だけ焼く
    const len = this.ctx.sampleRate * 0.6;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  /* 立ち上がり/減衰を必ずランプで作る＝プツ音を出さない */
  env(node, t, peak, dur, atk = 0.005) {
    const g = node.gain;
    g.setValueAtTime(0.0001, t);
    g.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + atk);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
  },
  /* 同一音の連打を間引く（毎フレーム鳴らすと飽和する） */
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

/* ============ スプライトのプリレンダ ============ */
/* 画像を持たない。人型を毎回コードで描き、オフスクリーンに焼いて使い回す。 */
const Sprites = { cache: {}, scale: 1 };

function mkCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w * Sprites.scale); c.height = Math.ceil(h * Sprites.scale);
  const g = c.getContext('2d');
  g.scale(Sprites.scale, Sprites.scale);
  return { c, g, w, h };
}

/* 人型の基本骨格を描く。step で足を開閉する */
function drawFigure(g, o) {
  const { w, h, col, dark, rim, step, bulk, helm, cape } = o;
  const cx = w / 2, groundY = h - 2;
  const scale = bulk;
  const legSpread = step ? 4.2 * scale : 1.6 * scale;
  const bodyH = 15 * scale, headR = 4.4 * scale, legH = 8 * scale;
  const hipY = groundY - legH;
  const shoulderY = hipY - bodyH;

  g.lineCap = 'round'; g.lineJoin = 'round';

  // 足
  g.strokeStyle = dark; g.lineWidth = 3.2 * scale;
  g.beginPath();
  g.moveTo(cx - legSpread * 0.4, hipY); g.lineTo(cx - legSpread, groundY);
  g.moveTo(cx + legSpread * 0.4, hipY); g.lineTo(cx + legSpread, groundY);
  g.stroke();

  // 外套
  if (cape) {
    g.fillStyle = dark; g.globalAlpha = 0.85;
    g.beginPath();
    g.moveTo(cx - 5 * scale, shoulderY + 1);
    g.quadraticCurveTo(cx - 9 * scale, hipY + 3 * scale, cx - 3 * scale, hipY + 4 * scale);
    g.lineTo(cx + 3 * scale, hipY + 4 * scale);
    g.quadraticCurveTo(cx + 9 * scale, hipY + 3 * scale, cx + 5 * scale, shoulderY + 1);
    g.closePath(); g.fill(); g.globalAlpha = 1;
  }

  // 胴（鎧）
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(cx - 5.2 * scale, shoulderY);
  g.lineTo(cx + 5.2 * scale, shoulderY);
  g.lineTo(cx + 4.0 * scale, hipY);
  g.lineTo(cx - 4.0 * scale, hipY);
  g.closePath(); g.fill();
  // 胴の陰
  g.fillStyle = dark; g.globalAlpha = 0.5;
  g.beginPath();
  g.moveTo(cx - 5.2 * scale, shoulderY); g.lineTo(cx - 1.2 * scale, shoulderY);
  g.lineTo(cx - 1.0 * scale, hipY); g.lineTo(cx - 4.0 * scale, hipY);
  g.closePath(); g.fill(); g.globalAlpha = 1;

  // 肩当て
  g.fillStyle = dark;
  g.beginPath(); g.ellipse(cx - 5.4 * scale, shoulderY + 1.2 * scale, 2.6 * scale, 2.0 * scale, 0, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + 5.4 * scale, shoulderY + 1.2 * scale, 2.6 * scale, 2.0 * scale, 0, 0, TAU); g.fill();

  // 首・頭
  const headY = shoulderY - headR * 0.9;
  g.fillStyle = '#1b1614';
  g.beginPath(); g.arc(cx, headY, headR, 0, TAU); g.fill();

  // 兜
  if (helm === 'kou') { // 黄巾
    g.fillStyle = '#c9a83f';
    g.beginPath(); g.arc(cx, headY - 0.6 * scale, headR * 0.95, Math.PI, TAU); g.fill();
    g.fillRect(cx - headR, headY - 1.4 * scale, headR * 2, 1.6 * scale);
    g.beginPath(); g.moveTo(cx + headR * 0.7, headY);
    g.lineTo(cx + headR * 2.2, headY + 2.4 * scale); g.lineTo(cx + headR * 0.8, headY + 1.8 * scale);
    g.closePath(); g.fill();
  } else if (helm === 'plume') { // 将の兜
    g.fillStyle = dark;
    g.beginPath(); g.arc(cx, headY, headR * 1.15, Math.PI, TAU); g.fill();
    g.fillStyle = rim;
    g.beginPath(); g.moveTo(cx, headY - headR * 1.1);
    g.lineTo(cx - 1.1 * scale, headY - headR * 2.6);
    g.lineTo(cx + 1.1 * scale, headY - headR * 2.6);
    g.closePath(); g.fill();
    g.fillStyle = dark; g.fillRect(cx - headR * 1.2, headY - 0.6 * scale, headR * 2.4, 1.4 * scale);
  } else if (helm === 'iron') {
    g.fillStyle = dark;
    g.beginPath(); g.arc(cx, headY, headR * 1.1, Math.PI, TAU); g.fill();
    g.fillRect(cx - headR * 1.1, headY - 0.4 * scale, headR * 2.2, 1.2 * scale);
  }

  // リムライト（右上から）
  g.strokeStyle = rim; g.globalAlpha = 0.5; g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(cx + 5.2 * scale, shoulderY); g.lineTo(cx + 4.0 * scale, hipY);
  g.stroke();
  g.beginPath(); g.arc(cx, headY, headR, -1.4, 0.3); g.stroke();
  g.globalAlpha = 1;
}

/* 武器のシルエット（武将の手に持たせる） */
function drawWeapon(g, o) {
  const { w, h, kind, col, rim, bulk } = o;
  const cx = w / 2, groundY = h - 2;
  const hipY = groundY - 8 * bulk, shoulderY = hipY - 15 * bulk;
  const hx = cx + 6.4 * bulk, hy = shoulderY + 5 * bulk;
  g.lineCap = 'round';
  g.strokeStyle = '#2a231d'; g.lineWidth = 2.0 * bulk;
  if (kind === 'polearm') {          // 長柄（戟・矛・偃月刀）
    g.beginPath(); g.moveTo(hx - 3 * bulk, hy + 9 * bulk); g.lineTo(hx + 5 * bulk, hy - 17 * bulk); g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(hx + 5 * bulk, hy - 17 * bulk);
    g.quadraticCurveTo(hx + 12 * bulk, hy - 15 * bulk, hx + 9 * bulk, hy - 7 * bulk);
    g.quadraticCurveTo(hx + 8 * bulk, hy - 13 * bulk, hx + 4 * bulk, hy - 14 * bulk);
    g.closePath(); g.fill();
    g.strokeStyle = rim; g.lineWidth = 0.9; g.globalAlpha = 0.7; g.stroke(); g.globalAlpha = 1;
  } else if (kind === 'spear') {
    g.beginPath(); g.moveTo(hx - 4 * bulk, hy + 10 * bulk); g.lineTo(hx + 6 * bulk, hy - 18 * bulk); g.stroke();
    g.fillStyle = col;
    g.beginPath();
    g.moveTo(hx + 6 * bulk, hy - 24 * bulk);
    g.lineTo(hx + 8.4 * bulk, hy - 16 * bulk);
    g.lineTo(hx + 3.6 * bulk, hy - 16 * bulk);
    g.closePath(); g.fill();
  } else if (kind === 'sword') {
    g.strokeStyle = col; g.lineWidth = 2.4 * bulk;
    g.beginPath(); g.moveTo(hx, hy + 6 * bulk); g.lineTo(hx + 7 * bulk, hy - 12 * bulk); g.stroke();
    g.strokeStyle = '#2a231d'; g.lineWidth = 3 * bulk;
    g.beginPath(); g.moveTo(hx - 2 * bulk, hy + 8 * bulk); g.lineTo(hx + 1 * bulk, hy + 3 * bulk); g.stroke();
  } else if (kind === 'bow') {
    g.strokeStyle = col; g.lineWidth = 1.8 * bulk;
    g.beginPath(); g.arc(hx + 3 * bulk, hy - 4 * bulk, 10 * bulk, -1.1, 1.1); g.stroke();
    g.strokeStyle = '#6d6455'; g.lineWidth = 0.8;
    g.beginPath(); g.moveTo(hx + 7.5 * bulk, hy - 12.6 * bulk); g.lineTo(hx + 7.5 * bulk, hy + 4.6 * bulk); g.stroke();
  } else if (kind === 'fan') {
    g.fillStyle = '#ded6c4';
    g.beginPath(); g.moveTo(hx, hy + 4 * bulk);
    g.arc(hx, hy + 4 * bulk, 10 * bulk, -1.9, -0.5); g.closePath(); g.fill();
    g.strokeStyle = '#9a8f78'; g.lineWidth = 0.7; g.stroke();
  } else if (kind === 'axe') {
    g.beginPath(); g.moveTo(hx - 3 * bulk, hy + 9 * bulk); g.lineTo(hx + 5 * bulk, hy - 15 * bulk); g.stroke();
    g.fillStyle = col;
    g.beginPath(); g.arc(hx + 5 * bulk, hy - 13 * bulk, 7 * bulk, -1.2, 1.2); g.closePath(); g.fill();
  }
}

/* 馬 */
function drawHorse(g, o) {
  const { w, h, col, dark, rim } = o;
  const cx = w / 2, gy = h - 2, s = o.bulk;
  g.strokeStyle = dark; g.lineWidth = 3 * s; g.lineCap = 'round';
  const legs = o.step ? [[-9, -3], [-3, 4], [4, -4], [10, 3]] : [[-9, 2], [-3, -3], [4, 3], [10, -3]];
  legs.forEach(([lx, off]) => {
    g.beginPath(); g.moveTo(cx + lx * s, gy - 9 * s); g.lineTo(cx + (lx + off) * s, gy); g.stroke();
  });
  g.fillStyle = col;
  g.beginPath(); g.ellipse(cx, gy - 13 * s, 12.5 * s, 6.2 * s, 0, 0, TAU); g.fill();
  g.beginPath(); g.moveTo(cx + 9 * s, gy - 16 * s);
  g.quadraticCurveTo(cx + 16 * s, gy - 22 * s, cx + 15 * s, gy - 26 * s);
  g.quadraticCurveTo(cx + 11 * s, gy - 24 * s, cx + 8 * s, gy - 17 * s);
  g.closePath(); g.fill();
  g.strokeStyle = dark; g.lineWidth = 2.4 * s;
  g.beginPath(); g.moveTo(cx - 12 * s, gy - 15 * s); g.lineTo(cx - 18 * s, gy - 9 * s); g.stroke();
  g.strokeStyle = rim; g.globalAlpha = 0.45; g.lineWidth = 1;
  g.beginPath(); g.ellipse(cx, gy - 13 * s, 12.5 * s, 6.2 * s, 0, -2.6, -0.4); g.stroke();
  g.globalAlpha = 1;
  // 騎乗兵
  drawFigure(g, { w, h: h - 17 * s, col: dark, dark: '#1b1614', rim, step: false, bulk: s * 0.82, helm: 'iron' });
}

/* ボス（大型・威圧感） */
function drawBoss(g, o) {
  const { w, h, col, dark, rim, step, weapon } = o;
  drawFigure(g, { w, h, col, dark, rim, step, bulk: o.bulk, helm: 'plume', cape: true });
  drawWeapon(g, { w, h, kind: weapon, col: rim, rim: '#f0e0a8', bulk: o.bulk });
}

function bake(key, w, h, fn) {
  if (Sprites.cache[key]) return Sprites.cache[key];
  const { c, g } = mkCanvas(w, h);
  fn(g);
  Sprites.cache[key] = { c, w, h, key };
  return Sprites.cache[key];
}

/* 被弾時の白いシルエット。形を保ったまま光らせる */
function flashSprite(sp) {
  return bake('f_' + sp.key, sp.w, sp.h, g => {
    g.drawImage(sp.c, 0, 0, sp.w, sp.h);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = '#fff2d8';
    g.fillRect(0, 0, sp.w, sp.h);
  });
}

/* 敵スプライトを2フレーム焼く */
function enemySprite(key, def, step) {
  const f = FACTION[def.fac] || FACTION.gun;
  const ck = `e_${key}_${step ? 1 : 0}`;
  const body = def.body;
  if (body === 'horse') {
    return bake(ck, 52, 44, g => drawHorse(g, { w: 52, h: 44, col: f.dark, dark: '#191412', rim: f.color, step, bulk: 1.0 }));
  }
  const bulk = body === 'big' ? 1.35 : body === 'elite' ? 1.5 : 1.0;
  const helm = def.fac === 'kou' ? 'kou' : (body === 'elite' ? 'plume' : 'iron');
  const W = Math.round(30 * bulk), H = Math.round(38 * bulk);
  return bake(ck, W, H, g => {
    drawFigure(g, { w: W, h: H, col: f.dark, dark: '#191412', rim: f.color, step, bulk, helm, cape: body === 'elite' });
    if (body === 'elite') drawWeapon(g, { w: W, h: H, kind: 'polearm', col: f.color, rim: '#e8dcb0', bulk });
    else if (def.ranged) drawWeapon(g, { w: W, h: H, kind: 'bow', col: '#7a6a4a', rim: f.color, bulk });
    else drawWeapon(g, { w: W, h: H, kind: body === 'big' ? 'axe' : 'sword', col: '#6a6258', rim: f.color, bulk });
  });
}

const HERO_WEAPON_KIND = {
  guanyu: 'polearm', zhangfei: 'spear', zhaoyun: 'spear', lubu: 'polearm',
  zhugeliang: 'fan', huangzhong: 'bow', xiahoudun: 'polearm', ganning: 'sword',
  sunshangxiang: 'bow', xuchu: 'axe',
};

function heroSprite(hero, step) {
  const f = FACTION[hero.faction];
  const ck = `h_${hero.id}_${step ? 1 : 0}`;
  const W = 42, H = 52;
  return bake(ck, W, H, g => {
    drawFigure(g, { w: W, h: H, col: f.color, dark: f.dark, rim: '#f2e6c0', step, bulk: 1.4, helm: 'plume', cape: true });
    drawWeapon(g, { w: W, h: H, kind: HERO_WEAPON_KIND[hero.id] || 'sword', col: '#cfc4a4', rim: '#fff3d0', bulk: 1.4 });
  });
}

function bossSprite(boss, step) {
  const f = FACTION[boss.fac] || FACTION.gun;
  const ck = `b_${boss.key}_${step ? 1 : 0}`;
  const W = 78, H = 104;
  const wpn = boss.key === 'lubu' ? 'polearm' : boss.key === 'zhangjiao' ? 'fan'
            : boss.key === 'simayi' ? 'sword' : boss.key === 'caiMao' ? 'sword' : 'spear';
  return bake(ck, W, H, g => drawBoss(g, {
    w: W, h: H, col: f.color, dark: f.dark, rim: '#f0d67a', step, bulk: 2.3, weapon: wpn,
  }));
}

/* 地面タイル（プリレンダして敷き詰める） */
function groundTile(base, accent) {
  const ck = `g_${base}_${accent}`;
  const S = 128;
  return bake(ck, S, S, g => {
    g.fillStyle = base; g.fillRect(0, 0, S, S);
    // 土のむら
    for (let i = 0; i < 220; i++) {
      const x = Math.random() * S, y = Math.random() * S, r = Math.random() * 9 + 1;
      g.globalAlpha = Math.random() * 0.07;
      g.fillStyle = Math.random() < 0.5 ? '#000' : accent;
      g.beginPath(); g.ellipse(x, y, r, r * 0.6, Math.random() * TAU, 0, TAU); g.fill();
    }
    // 轍
    g.globalAlpha = 0.09; g.strokeStyle = accent; g.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      g.beginPath();
      const y0 = Math.random() * S;
      g.moveTo(0, y0);
      g.bezierCurveTo(S * 0.3, y0 + rnd(-18, 18), S * 0.6, y0 + rnd(-18, 18), S, y0 + rnd(-12, 12));
      g.stroke();
    }
    g.globalAlpha = 1;
  });
}
