/* 万夫不当 — 本体 */
'use strict';

const SAVE_KEY = 'banpufutou.v1';
const MAX_ENEMIES = 260;
const CELL = 72;
const ZOOM = 1.62;       /* 寄り。人と群れが見える距離 */
const SPAWN_MUL = 1.75;   /* 湧きの総量。画面を埋めるための係数 */

/* ============ セーブ ============ */
const DEFAULT_SAVE = () => ({
  v: 1, gold: 0, kills: 0, runs: 0,
  forge: {}, heroes: ['guanyu', 'zhangfei', 'zhaoyun'], cleared: [],
  vault: [], equipped: {}, best: {}, legends: [],
});
let SAVE = DEFAULT_SAVE();

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      SAVE = Object.assign(DEFAULT_SAVE(), s);
      SAVE.forge = Object.assign({}, s.forge || {});
      SAVE.equipped = Object.assign({}, s.equipped || {});
    }
  } catch (e) { SAVE = DEFAULT_SAVE(); }
}
function persist() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(SAVE)); } catch (e) {}
}

/* ============ 装備 ============ */
let uidSeq = 1;
function rollEquip(rarBias, luck, slotHint, maxRar) {
  const w = [62, 26, 9, 3];
  const push = (rarBias || 0) + (luck || 0) * 0.45;
  w[0] = Math.max(6, w[0] - push * 40);
  w[1] = w[1] + push * 16;
  w[2] = w[2] + push * 16;
  w[3] = Math.min(13, w[3] + push * 8);
  if (maxRar !== undefined) for (let i = 3; i > maxRar; i--) { w[maxRar] += w[i]; w[i] = 0; }
  const tot = w[0] + w[1] + w[2] + w[3];
  let r = Math.random() * tot, rar = 0;
  for (let i = 0; i < 4; i++) { if (r < w[i]) { rar = i; break; } r -= w[i]; }

  let slot = slotHint || pick(SLOTS).id;

  if (rar === 3) {
    /* 神品は全13種を一度ずつ。集め終えたら名品に落とす＝価値が薄まらない */
    const unowned = LEGENDS.filter(L => SAVE.legends.indexOf(L.id) < 0);
    if (unowned.length) {
      const L = pick(unowned);
      return { uid: uidSeq++, slot: L.slot, name: L.name, rar: 3, legend: L.id,
               quote: L.quote, unique: L.unique, stats: Object.assign({}, L.stats) };
    }
    rar = 2;
  }

  const R = RARITY[rar];
  const base = pick(BASE_NAMES[slot]);
  const used = {}, stats = {};
  let prefix = '';
  for (let i = 0; i < R.rolls; i++) {
    const pool = AFFIXES.filter(a => !used[a.key]);
    if (!pool.length) break;
    const a = pick(pool); used[a.key] = 1;
    const v = rnd(a.v[0], a.v[1]) * R.mult;
    stats[a.key] = (stats[a.key] || 0) + v;
    if (i === 0) prefix = a.name;
  }
  return { uid: uidSeq++, slot, name: prefix + base, rar, legend: null, stats };
}
function equipScore(it) {
  if (!it) return -1;
  let s = it.rar * 100;
  for (const k in it.stats) s += Math.abs(it.stats[k]) * (k === 'regen' ? 8 : k === 'pierce' ? 30 : 60);
  return s;
}
function findItem(uid) {
  for (let i = 0; i < SAVE.vault.length; i++) if (SAVE.vault[i].uid === uid) return SAVE.vault[i];
  return null;
}

/* ============ ステータス合成 ============ */
const STAT_KEYS = ['atk','aspd','area','spd','hp','regen','crit','critDmg','pierce','luck','exp','armor','pickup','lifesteal','revive'];

function buildStats(hero, extraItems, skillLevels) {
  const add = {}; STAT_KEYS.forEach(k => add[k] = 0);
  // 永続強化
  FORGE.forEach(f => { const lv = SAVE.forge[f.id] || 0; if (lv) add[f.stat] += f.v * lv; });
  // 装備
  (extraItems || []).forEach(it => { if (!it) return; for (const k in it.stats) if (k in add) add[k] += it.stats[k]; });
  // 技
  if (skillLevels) SKILLS.forEach(s => {
    if (s.kind !== 'stat') return;
    const lv = skillLevels[s.id] || 0; if (lv) add[s.stat] += s.v * lv;
  });
  const b = hero.base;
  return {
    atkMul: 1 + add.atk,
    atk: b.atk * (1 + add.atk),
    aspd: b.aspd * (1 + add.aspd),
    area: b.area * (1 + add.area),
    spd: b.spd * (1 + add.spd),
    hpMax: Math.round(b.hp * (1 + add.hp)),
    regen: (b.regen || 0) + add.regen,
    crit: clamp((b.crit || 0) + add.crit, 0, 0.85),
    critDmg: (b.critDmg || 1.5) + add.critDmg,
    pierce: (b.pierce || 0) + add.pierce,
    luck: add.luck,
    exp: 1 + add.exp,
    armor: clamp((b.armor || 0) + add.armor, 0, 0.72),
    pickup: 1 + add.pickup,
    lifesteal: (b.lifesteal || 0) + add.lifesteal,
    revive: Math.floor(add.revive),
  };
}

/* ============ ゲーム状態 ============ */
const G = {
  mode: 'title', canvas: null, ctx: null, W: 0, H: 0, dpr: 1,
  cam: { x: 0, y: 0, shake: 0 },
  input: { dx: 0, dy: 0, keys: {}, touchId: null, ox: 0, oy: 0, active: false },
  hitStop: 0, time: 0, headless: false, lastErr: null,
};
let R = null; // 現在のラン

function startRun(heroId, stageId) {
  const hero = HEROES.find(h => h.id === heroId);
  const stage = STAGES.find(s => s.id === stageId);
  const items = SLOTS.map(s => findItem(SAVE.equipped[s.id])).filter(Boolean);
  const st = buildStats(hero, items, null);
  R = {
    hero, stage, items: items.slice(),
    skills: {}, subs: [],
    stats: st, hp: st.hpMax,
    x: 0, y: 0, face: 0, moveAng: 0,
    lv: 1, xp: 0, xpNeed: 14, gold: 0, kills: 0,
    t: 0, atkTimer: 0, invuln: 0, dead: false, won: false,
    combo: 0, comboT: 0, cryIdx: 0,
    enemies: [], projs: [], eprojs: [], pickups: [], fx: [], parts: [], nums: [], orbits: [],
    waveIdx: 0, spawnAcc: {}, eliteIdx: 0, boss: null, bossWarn: 0,
    lootFound: [], revives: st.revive,
    grid: new Map(),
    banner: null, bannerT: 0,
    stat: { dmgDealt: 0, dmgTaken: 0, maxCombo: 0, elites: 0 },
  };
  applySubDefaults();
  G.mode = 'run';
  G.cam.x = 0; G.cam.y = 0;
}

function applySubDefaults() { R.subs = []; }

/* ラン中のステータス再計算（装備取得・レベルアップ時） */
function recalc() {
  const prevMax = R.stats.hpMax;
  R.stats = buildStats(R.hero, R.items, R.skills);
  const d = R.stats.hpMax - prevMax;
  if (d > 0) R.hp += d;
  R.hp = Math.min(R.hp, R.stats.hpMax);
}

/* ============ 空間分割 ============ */
function rebuildGrid() {
  const g = R.grid; g.clear();
  for (let i = 0; i < R.enemies.length; i++) {
    const e = R.enemies[i];
    const k = ((Math.floor(e.x / CELL) & 0xffff) << 16) | (Math.floor(e.y / CELL) & 0xffff);
    let a = g.get(k); if (!a) { a = []; g.set(k, a); }
    a.push(e);
  }
}
function nearby(x, y, r, out) {
  out.length = 0;
  const c0 = Math.floor((x - r) / CELL), c1 = Math.floor((x + r) / CELL);
  const d0 = Math.floor((y - r) / CELL), d1 = Math.floor((y + r) / CELL);
  for (let cx = c0; cx <= c1; cx++) for (let cy = d0; cy <= d1; cy++) {
    const a = R.grid.get(((cx & 0xffff) << 16) | (cy & 0xffff));
    if (a) for (let i = 0; i < a.length; i++) out.push(a[i]);
  }
  return out;
}
const _tmp = [];

function nearestEnemy(x, y, maxR) {
  let best = null, bd = (maxR || 1400) ** 2;
  for (let i = 0; i < R.enemies.length; i++) {
    const e = R.enemies[i]; if (e.dead) continue;
    const d = dist2(x, y, e.x, e.y);
    if (d < bd) { bd = d; best = e; }
  }
  return best;
}

/* ============ スポーン ============ */
let entSeq = 1;
function spawnEnemy(key, hpM, ox, oy) {
  if (R.enemies.length >= MAX_ENEMIES) return null;
  const def = ENEMIES[key]; if (!def) return null;
  let x, y;
  if (ox !== undefined) { x = ox; y = oy; }
  else {
    let a = rnd(TAU);
    if (Math.random() < 0.45 && (G.input.dx || G.input.dy))
      a = Math.atan2(G.input.dy, G.input.dx) + rnd(-1.15, 1.15);
    const rad = Math.max(G.W / ZOOM, G.H / (ZOOM * ISO)) * 0.56 + rnd(20, 90);
    x = R.x + Math.cos(a) * rad; y = R.y + Math.sin(a) * rad * 0.9;
  }
  const timeScale = 1 + R.t / 190;
  const e = {
    __id: entSeq++,
    key, def, x, y, r: def.r, hp: def.hp * hpM * timeScale, hpMax: def.hp * hpM * timeScale,
    spd: def.spd * rnd(0.9, 1.1), atk: def.atk * 0.75 * (1 + R.t / 800), dead: false,
    cd: 0, hitCd: 0, step: Math.random() < 0.5, stepT: rnd(0.4),
    kx: 0, ky: 0, flash: 0, elite: !!def.elite, chargeT: 0, charging: false,
  };
  R.enemies.push(e);
  return e;
}

function spawnBoss() {
  const b = R.stage.boss;
  const a = rnd(TAU), rad = Math.max(G.W / ZOOM, G.H / (ZOOM * ISO)) * 0.5 + 110;
  R.boss = {
    __id: entSeq++,
    key: b.key, def: b, boss: true, x: R.x + Math.cos(a) * rad, y: R.y + Math.sin(a) * rad * 0.9,
    r: b.r, hp: b.hp, hpMax: b.hp, spd: b.spd, atk: b.atk, dead: false,
    cd: 1.4, hitCd: 0, step: false, stepT: 0, kx: 0, ky: 0, flash: 0, elite: true,
    phase: 0, actT: 2.0, charging: false, chargeT: 0,
  };
  R.enemies.push(R.boss);
  Snd.boss();
  banner(b.name + ' — ' + b.title, 3.2);
}

function banner(text, dur) { R.banner = text; R.bannerT = dur; }

/* ============ 戦闘 ============ */
function critRoll() { return Math.random() < R.stats.crit; }

function hurtEnemy(e, dmg, crit, kx, ky) {
  if (e.dead) return;
  const arm = e.def.armor || 0;
  const d = dmg * (1 - arm);
  e.hp -= d; e.flash = 0.12;
  R.stat.dmgDealt += d;
  if (R.stats.lifesteal > 0) {
    R.hp = Math.min(R.stats.hpMax, R.hp + d * R.stats.lifesteal);
  }
  if (kx || ky) { const m = e.boss ? 0.12 : (e.def.body === 'big' ? 0.45 : 1); e.kx += kx * m; e.ky += ky * m; }
  pushNum(e.x, e.y - e.r, Math.round(d), crit);
  if (crit) Snd.crit(); else Snd.hit();
  splash(e.x, e.y, crit ? 6 : 3, crit ? '#f0d67a' : '#c0392b');
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  if (e.dead) return;
  e.dead = true;
  R.kills++; SAVE.kills++;
  R.combo++; R.comboT = 2.2;
  if (R.combo > R.stat.maxCombo) R.stat.maxCombo = R.combo;
  G.hitStop = Math.max(G.hitStop, e.boss ? 0.22 : e.elite ? 0.07 : 0.018);
  G.cam.shake = Math.min(16, G.cam.shake + (e.boss ? 14 : e.elite ? 5 : 1.1));
  Snd.kill();
  splash(e.x, e.y, e.boss ? 60 : e.elite ? 22 : 8, '#c0392b');
  if (e.boss) splash(e.x, e.y, 40, '#f0d67a');

  const def = e.def;
  const xp = (def.xp || 1);
  dropPickup(e.x, e.y, 'xp', xp);
  if (Math.random() < (e.elite ? 1 : 0.14) + R.stats.luck * 0.1)
    dropPickup(e.x + rnd(-8, 8), e.y + rnd(-8, 8), 'gold', def.gold || 1);
  if (!e.elite && Math.random() < 0.012) dropPickup(e.x, e.y, 'heal', 0);

  if (!e.elite && Math.random() < 0.006 + R.stats.luck * 0.004) dropLoot(e.x, e.y, 0, 2);

  if (e.elite) {
    R.stat.elites++;
    dropLoot(e.x, e.y, e.boss ? 0.55 : 0.12, 3);
    if (e.boss) { dropLoot(e.x + 34, e.y + 10, 0.75, 3); dropPickup(e.x - 30, e.y, 'gold', def.gold || 40); }
  }

  // 名言
  while (R.cryIdx < CRIES.length && R.kills >= CRIES[R.cryIdx].n) {
    banner(CRIES[R.cryIdx].text, 1.8); R.cryIdx++;
  }

  if (e.boss) { R.won = true; R.wonT = 1.1; }
}

function dropPickup(x, y, kind, v) {
  R.pickups.push({ x, y, kind, v, vx: rnd(-60, 60), vy: rnd(-60, 60), t: 0, mag: false });
}
function dropLoot(x, y, bias, maxRar) {
  const it = rollEquip(bias, R.stats.luck, null, maxRar);
  R.pickups.push({ x, y, kind: 'loot', item: it, vx: rnd(-40, 40), vy: rnd(-40, 40), t: 0, mag: false, v: 0 });
}

function pushNum(x, y, v, crit) {
  if (R.nums.length > 90) R.nums.shift();
  R.nums.push({ x: x + rnd(-6, 6), y, v, t: 0, crit });
}
function splash(x, y, n, color) {
  if (R.parts.length > 420) return;
  for (let i = 0; i < n; i++) {
    const a = rnd(TAU), s = rnd(40, 210);
    R.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, t: 0,
                   life: rnd(0.25, 0.6), color, size: rnd(1.4, 3.4) });
  }
}

/* --- プレイヤーの主攻撃 --- */
function doAttack() {
  const A = R.hero.attack, S = R.stats;
  const tgt = nearestEnemy(R.x, R.y, 900);
  if (tgt) R.face = Math.atan2(tgt.y - R.y, tgt.x - R.x);
  else if (G.input.dx || G.input.dy) R.face = Math.atan2(G.input.dy, G.input.dx);
  Snd.swing();

  if (A.type === 'sweep' || A.type === 'spin') {
    const rad = A.radius * S.area;
    const arc = A.arc;
    R.fx.push({ kind: 'arc', x: R.x, y: R.y, a: R.face, arc, r: rad, t: 0, dur: A.dur, spin: A.type === 'spin' });
    nearby(R.x, R.y, rad + 40, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const e = _tmp[i]; if (e.dead) continue;
      const dx = e.x - R.x, dy = e.y - R.y;
      if (dx * dx + dy * dy > (rad + e.r) * (rad + e.r)) continue;
      if (A.type === 'sweep') {
        let da = Math.atan2(dy, dx) - R.face;
        while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
        if (Math.abs(da) > arc / 2) continue;
      }
      const c = critRoll();
      const d = S.atk * (c ? S.critDmg : 1);
      const L = Math.hypot(dx, dy) || 1;
      hurtEnemy(e, d, c, dx / L * (A.knock || 0), dy / L * (A.knock || 0));
    }
  } else if (A.type === 'thrust') {
    const len = A.length * S.area, wid = A.width * S.area;
    R.fx.push({ kind: 'thrust', x: R.x, y: R.y, a: R.face, len, w: wid, t: 0, dur: A.dur });
    const ca = Math.cos(R.face), sa = Math.sin(R.face);
    nearby(R.x + ca * len / 2, R.y + sa * len / 2, len, _tmp);
    for (let i = 0; i < _tmp.length; i++) {
      const e = _tmp[i]; if (e.dead) continue;
      const dx = e.x - R.x, dy = e.y - R.y;
      const along = dx * ca + dy * sa, perp = -dx * sa + dy * ca;
      if (along < -e.r || along > len + e.r) continue;
      if (Math.abs(perp) > wid / 2 + e.r) continue;
      const c = critRoll();
      hurtEnemy(e, S.atk * (c ? S.critDmg : 1), c, ca * (A.knock || 0), sa * (A.knock || 0));
    }
  } else if (A.type === 'shot' || A.type === 'homing') {
    const n = A.count || 1;
    for (let i = 0; i < n; i++) {
      const sp = (A.spread || 0);
      const a = R.face + (n > 1 ? (i / (n - 1) - 0.5) * sp : 0) + rnd(-0.03, 0.03);
      R.projs.push({
        x: R.x, y: R.y, vx: Math.cos(a) * A.speed, vy: Math.sin(a) * A.speed * 0.92,
        life: A.life, t: 0, dmg: R.stats.atk, r: A.radius * (1 + (R.stats.area - 1) * 0.45),
        pierce: R.stats.pierce, hits: [], color: '#e8dcb0',
        homing: A.type === 'homing', kind: A.type === 'homing' ? 'wind' : 'arrow',
      });
    }
  }
}

/* --- 副武装 --- */
function subTick(dt) {
  for (let i = 0; i < R.subs.length; i++) {
    const s = R.subs[i], d = s.def.sub, lv = s.lv, S = R.stats;
    if (d.type === 'passive_pickup') continue;
    /* 副武装は攻撃速度の影響を半分だけ受ける */
    s.timer -= dt * (0.5 + 0.5 * S.aspd / R.hero.base.aspd);
    if (s.timer > 0) continue;
    s.timer = d.cd / (1 + (d.type === 'shot' ? lv * 0.22 : lv * 0.08));
    const dmg = S.atk * d.dmg * (1 + lv * 0.28);

    if (d.type === 'shot') {
      const cnt = (d.count || 1) + (lv - 1);
      const tgt = d.aim ? nearestEnemy(R.x, R.y, 700) : null;
      const baseA = tgt ? Math.atan2(tgt.y - R.y, tgt.x - R.x) : rnd(TAU);
      for (let k = 0; k < cnt; k++) {
        const a = baseA + (cnt > 1 ? (k / (cnt - 1) - 0.5) * (d.spread || 0.4) : 0);
        R.projs.push({ x: R.x, y: R.y, vx: Math.cos(a) * d.speed, vy: Math.sin(a) * d.speed * 0.92,
          life: d.life, t: 0, dmg, r: d.r * (1 + (S.area - 1) * 0.45), pierce: (d.pierce || 0) + S.pierce,
          hits: [], color: d.color, kind: 'sub' });
      }
    } else if (d.type === 'drop') {
      const cnt = (d.count || 1) + lv - 1;
      for (let k = 0; k < cnt; k++)
        R.projs.push({ x: R.x + rnd(-78, 78), y: R.y + rnd(-62, 62), vx: 0, vy: 0,
          life: d.life, t: 0, dmg, r: d.r * S.area, pierce: 999, hits: [], color: d.color,
          kind: 'trap', reHit: 0.6, hitT: {} });
    } else if (d.type === 'bolt') {
      const cnt = (d.count || 1) + lv - 1;
      for (let k = 0; k < cnt; k++) {
        const e = R.enemies[Math.floor(Math.random() * R.enemies.length)];
        if (!e || e.dead) continue;
        R.fx.push({ kind: 'bolt', x: e.x, y: e.y, t: 0, dur: 0.28, r: d.r * S.area });
        nearby(e.x, e.y, d.r * S.area, _tmp);
        for (let j = 0; j < _tmp.length; j++) {
          const t2 = _tmp[j]; if (t2.dead) continue;
          if (dist2(t2.x, t2.y, e.x, e.y) > (d.r * S.area) ** 2) continue;
          const c = critRoll(); hurtEnemy(t2, dmg * (c ? S.critDmg : 1), c, 0, 0);
        }
      }
    } else if (d.type === 'aura') {
      const rr = (d.r * 0.8 + lv * 12) * (1 + (S.area - 1) * 0.5);
      nearby(R.x, R.y, rr, _tmp);
      for (let j = 0; j < _tmp.length; j++) {
        const e = _tmp[j]; if (e.dead) continue;
        if (dist2(e.x, e.y, R.x, R.y) > rr * rr) continue;
        hurtEnemy(e, dmg, false, 0, 0);
      }
    } else if (d.type === 'mortar') {
      const cnt = (d.count || 1) + Math.floor(lv / 2);
      for (let k = 0; k < cnt; k++) {
        const tgt = nearestEnemy(R.x, R.y, 800);
        const tx = tgt ? tgt.x + rnd(-50, 50) : R.x + rnd(-200, 200);
        const ty = tgt ? tgt.y + rnd(-50, 50) : R.y + rnd(-200, 200);
        R.fx.push({ kind: 'mortar', x: tx, y: ty, t: 0, dur: 0.7, r: (d.r + lv * 14) * S.area, dmg, done: false });
      }
    } else if (d.type === 'wander') {
      // 実体は orbits 配列で管理（生成は一度きり）
    }
  }

  // 周回体（藤甲兵）と彷徨い（旋風）
  R.orbits.forEach(o => {
    if (o.kind === 'orbit') {
      o.a += o.speed * dt;
      o.x = R.x + Math.cos(o.a) * o.r * R.stats.area;
      o.y = R.y + Math.sin(o.a) * o.r * R.stats.area * 0.88;
    } else {
      o.wt -= dt;
      if (o.wt <= 0) { o.wt = rnd(1.0, 2.4); o.wa = rnd(TAU); }
      o.x += Math.cos(o.wa) * o.speed * dt;
      o.y += Math.sin(o.wa) * o.speed * 0.85 * dt;
      const dx = R.x - o.x, dy = R.y - o.y;
      const L = Math.hypot(dx, dy);
      if (L > 420) { o.x += dx / L * 90 * dt * 3; o.y += dy / L * 90 * dt * 3; }
    }
    o.cd -= dt;
    if (o.cd <= 0) {
      o.cd = 0.24;
      const rr = o.hitR * R.stats.area;
      nearby(o.x, o.y, rr, _tmp);
      for (let j = 0; j < _tmp.length; j++) {
        const e = _tmp[j]; if (e.dead) continue;
        if (dist2(e.x, e.y, o.x, o.y) > rr * rr) continue;
        const c = critRoll();
        hurtEnemy(e, o.dmg * R.stats.atk * (c ? R.stats.critDmg : 1), c, (e.x - o.x) * 1.4, (e.y - o.y) * 1.4);
      }
    }
  });
}

function syncOrbits() {
  R.orbits = [];
  R.subs.forEach(s => {
    const d = s.def.sub;
    if (d.type === 'orbit') {
      const n = (d.count || 1) + s.lv - 1;
      for (let i = 0; i < n; i++)
        R.orbits.push({ kind: 'orbit', a: (i / n) * TAU, r: d.r, speed: d.speed, x: R.x, y: R.y,
                        cd: 0, hitR: 26, dmg: d.dmg * (1 + s.lv * 0.25), color: d.color });
    } else if (d.type === 'wander') {
      const n = (d.count || 1) + s.lv - 1;
      for (let i = 0; i < n; i++)
        R.orbits.push({ kind: 'wander', x: R.x + rnd(-100, 100), y: R.y + rnd(-100, 100),
                        wa: rnd(TAU), wt: rnd(1, 2), speed: d.speed, cd: 0,
                        hitR: d.r, dmg: d.dmg * (1 + s.lv * 0.25), color: d.color });
    }
  });
}

/* ============ 更新 ============ */
function update(dt) {
  if (G.hitStop > 0) { G.hitStop -= dt; if (G.hitStop > 0) return; }
  R.t += dt;
  if (R.bannerT > 0) R.bannerT -= dt;
  if (R.comboT > 0) { R.comboT -= dt; if (R.comboT <= 0) R.combo = 0; }

  /* 大将を討ち取った — 余韻を置いてから締める */
  if (R.won) { R.wonT -= dt; if (R.wonT <= 0) { endRun(true); return; } }

  const S = R.stats;

  /* 移動 */
  let dx = G.input.dx, dy = G.input.dy;
  const L = Math.hypot(dx, dy);
  if (L > 1) { dx /= L; dy /= L; }
  R.x += dx * S.spd * dt;
  R.y += dy * S.spd * dt * 0.92;
  if (L > 0.05) R.moveAng = Math.atan2(dy, dx);

  /* 当たり判定の格子は攻撃より先に張り直す（1フレーム遅れを作らない） */
  rebuildGrid();

  /* 回復・無敵 */
  if (S.regen > 0 && R.hp < S.hpMax) R.hp = Math.min(S.hpMax, R.hp + S.regen * dt);
  if (R.invuln > 0) R.invuln -= dt;

  /* 攻撃 */
  R.atkTimer -= dt;
  if (R.atkTimer <= 0) { doAttack(); R.atkTimer = 1 / Math.max(0.15, S.aspd); }
  subTick(dt);

  /* スポーン */
  const st = R.stage;
  if (!R.boss) {
    for (let i = 0; i < st.waves.length; i++) {
      const w = st.waves[i];
      if (R.t < w.t) continue;
      const key = 'w' + i;
      R.spawnAcc[key] = (R.spawnAcc[key] || 0) + w.rate * SPAWN_MUL * dt;
      while (R.spawnAcc[key] >= 1) { R.spawnAcc[key] -= 1; spawnEnemy(w.e, w.hpM); }
    }
    while (R.eliteIdx < st.elites.length && R.t >= st.elites[R.eliteIdx]) {
      const key = Math.random() < 0.5 ? 'gou' : (R.t > 240 ? 'ko' : 'sen');
      const e = spawnEnemy(key, 1 + R.t / 260);
      if (e) { banner('豪傑 出現', 1.4); Snd.boss(); }
      R.eliteIdx++;
    }
    if (R.t >= st.dur) spawnBoss();
    else if (st.dur - R.t < 6 && R.bossWarn === 0) { R.bossWarn = 1; banner('大将 接近', 2.4); }
  }

  /* 敵 */
  const px = R.x, py = R.y;
  for (let i = R.enemies.length - 1; i >= 0; i--) {
    const e = R.enemies[i];
    if (e.dead) { R.enemies.splice(i, 1); continue; }
    if (e.flash > 0) e.flash -= dt;
    e.stepT += dt; if (e.stepT > 0.22) { e.stepT = 0; e.step = !e.step; }

    const ddx = px - e.x, ddy = (py - e.y) / 0.9;
    const dl = Math.hypot(ddx, ddy) || 1;

    if (e.boss) updateBoss(e, dt, ddx / dl, ddy / dl, dl);
    else if (e.def.charge) {
      e.chargeT -= dt;
      if (e.charging) {
        e.x += e.cvx * dt; e.y += e.cvy * dt * 0.9;
        if (e.chargeT <= 0) { e.charging = false; e.chargeT = rnd(1.6, 3.0); }
      } else if (e.chargeT <= 0 && dl < 460) {
        e.charging = true; e.chargeT = 0.75;
        e.cvx = ddx / dl * e.spd * 3.4; e.cvy = ddy / dl * e.spd * 3.4;
      } else {
        e.x += ddx / dl * e.spd * dt; e.y += ddy / dl * e.spd * dt * 0.9;
      }
    } else if (e.def.ranged) {
      const rg = e.def.ranged;
      if (dl > rg.range * 0.85) { e.x += ddx / dl * e.spd * dt; e.y += ddy / dl * e.spd * dt * 0.9; }
      else if (dl < rg.range * 0.5) { e.x -= ddx / dl * e.spd * 0.5 * dt; e.y -= ddy / dl * e.spd * 0.5 * dt * 0.9; }
      e.cd -= dt;
      if (e.cd <= 0 && dl < rg.range) {
        e.cd = rg.cd * rnd(0.85, 1.2);
        const a = Math.atan2(py - e.y, px - e.x);
        R.eprojs.push({ x: e.x, y: e.y - 8, vx: Math.cos(a) * rg.speed, vy: Math.sin(a) * rg.speed * 0.9,
          life: 3, t: 0, dmg: rg.dmg * (1 + R.t / 700), r: 7, homing: !!rg.homing, color: rg.homing ? '#d8a8f0' : '#d8c89a' });
      }
    } else {
      e.x += ddx / dl * e.spd * dt; e.y += ddy / dl * e.spd * dt * 0.9;
    }

    /* ノックバック減衰 */
    if (e.kx || e.ky) {
      e.x += e.kx * dt; e.y += e.ky * dt * 0.9;
      e.kx *= 0.86; e.ky *= 0.86;
      if (Math.abs(e.kx) < 3) e.kx = 0;
      if (Math.abs(e.ky) < 3) e.ky = 0;
    }

    /* 接触 */
    e.hitCd -= dt;
    const rr = e.r + 13;
    if (dist2(e.x, e.y, px, py) < rr * rr && e.hitCd <= 0 && R.invuln <= 0) {
      e.hitCd = 0.88; hurtPlayer(e.atk);
    }
  }

  /* 敵が動いたので格子を張り直す（押し合いと弾の判定用） */
  rebuildGrid();

  /* 敵同士の押し合い（軽量・間引き） */
  if ((G.frame & 1) === 0) {
    for (let i = 0; i < R.enemies.length; i += 1) {
      const a = R.enemies[i]; if (a.boss) continue;
      nearby(a.x, a.y, a.r * 2, _tmp);
      for (let j = 0; j < _tmp.length; j++) {
        const b = _tmp[j]; if (b === a || b.boss) continue;
        const dx2 = b.x - a.x, dy2 = b.y - a.y;
        const dd = dx2 * dx2 + dy2 * dy2, mr = a.r + b.r;
        if (dd > 0.01 && dd < mr * mr) {
          const d = Math.sqrt(dd), push = (mr - d) * 0.28;
          a.x -= dx2 / d * push; a.y -= dy2 / d * push * 0.9;
          b.x += dx2 / d * push; b.y += dy2 / d * push * 0.9;
        }
      }
    }
  }

  /* 自弾 */
  for (let i = R.projs.length - 1; i >= 0; i--) {
    const p = R.projs[i];
    p.t += dt;
    if (p.t > p.life) { R.projs.splice(i, 1); continue; }
    if (p.homing) {
      const tg = nearestEnemy(p.x, p.y, 500);
      if (tg) {
        const a = Math.atan2(tg.y - p.y, tg.x - p.x);
        const sp = Math.hypot(p.vx, p.vy);
        p.vx = lerp(p.vx, Math.cos(a) * sp, 0.12);
        p.vy = lerp(p.vy, Math.sin(a) * sp, 0.12);
      }
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    nearby(p.x, p.y, p.r + 26, _tmp);
    for (let j = 0; j < _tmp.length; j++) {
      const e = _tmp[j]; if (e.dead) continue;
      const rr2 = p.r + e.r;
      if (dist2(p.x, p.y, e.x, e.y) > rr2 * rr2) continue;
      if (p.kind === 'trap') {
        if (!p.hitT[e.__id]) p.hitT[e.__id] = 0;
        if (R.t < p.hitT[e.__id]) continue;
        p.hitT[e.__id] = R.t + p.reHit;
      } else {
        if (p.hits.indexOf(e) >= 0) continue;
        p.hits.push(e);
      }
      const c = critRoll();
      hurtEnemy(e, p.dmg * (c ? R.stats.critDmg : 1), c, p.vx * 0.25, p.vy * 0.25);
      if (p.kind !== 'trap') {
        if (p.pierce <= p.hits.length - 1) { R.projs.splice(i, 1); break; }
      }
    }
  }

  /* 敵弾 */
  for (let i = R.eprojs.length - 1; i >= 0; i--) {
    const p = R.eprojs[i]; p.t += dt;
    if (p.t > p.life) { R.eprojs.splice(i, 1); continue; }
    if (p.homing && p.t < 1.2) {
      const a = Math.atan2(R.y - p.y, R.x - p.x), sp = Math.hypot(p.vx, p.vy);
      p.vx = lerp(p.vx, Math.cos(a) * sp, 0.05); p.vy = lerp(p.vy, Math.sin(a) * sp, 0.05);
    }
    p.x += p.vx * dt; p.y += p.vy * dt;
    if (R.invuln <= 0 && dist2(p.x, p.y, R.x, R.y) < (p.r + 12) ** 2) {
      hurtPlayer(p.dmg); R.eprojs.splice(i, 1);
    }
  }

  /* 拾得 — 攻撃範囲の外で死んだ分を取りこぼすと手が止まるので、少し経ったら必ず吸い寄せる */
  const pickR = 78 * S.pickup * (1 + subLevel('mokugyu') * 0.6);
  for (let i = R.pickups.length - 1; i >= 0; i--) {
    const p = R.pickups[i]; p.t += dt;
    p.x += p.vx * dt; p.y += p.vy * dt * 0.9;
    p.vx *= 0.9; p.vy *= 0.9;
    const d2 = dist2(p.x, p.y, R.x, R.y);
    if (p.mag || d2 < pickR * pickR || p.t > (p.kind === 'loot' ? 2.2 : 1.1)) {
      p.mag = true;
      const a = Math.atan2(R.y - p.y, R.x - p.x);
      const sp = 260 + (1 - Math.min(1, Math.sqrt(d2) / 200)) * 500;
      p.x += Math.cos(a) * sp * dt; p.y += Math.sin(a) * sp * dt;
    }
    if (d2 < 20 * 20) {
      collect(p); R.pickups.splice(i, 1);
    }
  }

  /* エフェクト */
  for (let i = R.fx.length - 1; i >= 0; i--) {
    const f = R.fx[i]; f.t += dt;
    if (f.kind === 'mortar' && !f.done && f.t >= f.dur * 0.72) {
      f.done = true;
      Snd.kill();
      G.cam.shake = Math.min(18, G.cam.shake + 5);
      nearby(f.x, f.y, f.r, _tmp);
      for (let j = 0; j < _tmp.length; j++) {
        const e = _tmp[j]; if (e.dead) continue;
        if (dist2(e.x, e.y, f.x, f.y) > f.r * f.r) continue;
        const c = critRoll();
        hurtEnemy(e, f.dmg * (c ? R.stats.critDmg : 1), c, (e.x - f.x) * 2, (e.y - f.y) * 2);
      }
      splash(f.x, f.y, 18, '#b0a48a');
    }
    if (f.t > f.dur) R.fx.splice(i, 1);
  }
  for (let i = R.parts.length - 1; i >= 0; i--) {
    const p = R.parts[i]; p.t += dt;
    if (p.t > p.life) { R.parts.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt * 0.8;
    p.vx *= 0.9; p.vy = p.vy * 0.9 + 220 * dt;
  }
  for (let i = R.nums.length - 1; i >= 0; i--) {
    const n = R.nums[i]; n.t += dt; n.y -= 38 * dt;
    if (n.t > 0.62) R.nums.splice(i, 1);
  }

  /* カメラ */
  G.cam.x = lerp(G.cam.x, R.x, 0.16);
  G.cam.y = lerp(G.cam.y, R.y, 0.16);
  if (G.cam.shake > 0) G.cam.shake = Math.max(0, G.cam.shake - 44 * dt);
}

function subLevel(id) { const s = R.subs.find(s => s.id === id); return s ? s.lv : 0; }

function hurtPlayer(v) {
  const d = v * (1 - R.stats.armor);
  R.hp -= d; R.stat.dmgTaken += d;
  R.invuln = 0.7;
  G.cam.shake = Math.min(22, G.cam.shake + 9);
  Snd.hurt();
  splash(R.x, R.y, 8, '#e05a4a');
  if (R.hp <= 0) {
    if (R.revives > 0) {
      R.revives--; R.hp = R.stats.hpMax * 0.6; R.invuln = 2.4;
      banner('再起', 2.0); Snd.win();
      nearby(R.x, R.y, 400, _tmp);
      for (let j = 0; j < _tmp.length; j++) if (!_tmp[j].boss) killEnemy(_tmp[j]);
    } else {
      R.hp = 0; endRun(false);
    }
  }
}

function collect(p) {
  if (p.kind === 'xp') {
    R.xp += p.v * R.stats.exp;
    Snd.pickup();
    while (R.xp >= R.xpNeed) {
      R.xp -= R.xpNeed; R.lv++;
      R.xpNeed = Math.round(8 + R.lv * 5 + Math.pow(R.lv, 1.72) * 1.6);
      openLevelUp();
    }
  } else if (p.kind === 'gold') {
    R.gold += p.v; Snd.pickup();
  } else if (p.kind === 'heal') {
    R.hp = Math.min(R.stats.hpMax, R.hp + R.stats.hpMax * 0.28);
    Snd.levelup(); banner('回復', 1.0);
  } else if (p.kind === 'loot') {
    takeLoot(p.item);
  }
}

function takeLoot(it) {
  R.lootFound.push(it);
  if (it.legend && SAVE.legends.indexOf(it.legend) < 0) SAVE.legends.push(it.legend);
  const cur = R.items.find(x => x.slot === it.slot);
  const better = equipScore(it) > equipScore(cur);
  if (better) {
    R.items = R.items.filter(x => x.slot !== it.slot);
    R.items.push(it);
    recalc();
  }
  Snd.loot(it.rar);
  if (it.rar >= 2) G.cam.shake = Math.min(20, G.cam.shake + 8);
  R.fx.push({ kind: 'lootflash', x: R.x, y: R.y, t: 0, dur: it.rar >= 3 ? 1.1 : 0.55, rar: it.rar });
  banner((better ? '装備 — ' : '入手 — ') + it.name + '（' + RARITY[it.rar].name + '）', it.rar >= 3 ? 3.0 : 1.8);
}

/* --- ボス挙動 --- */
function updateBoss(b, dt, nx, ny, dl) {
  b.actT -= dt;
  const p = b.def.pattern;
  if (b.charging) {
    b.x += b.cvx * dt; b.y += b.cvy * dt * 0.9;
    b.chargeT -= dt;
    if (b.chargeT <= 0) { b.charging = false; b.actT = rnd(1.6, 2.6); }
    return;
  }
  b.x += nx * b.spd * dt; b.y += ny * b.spd * dt * 0.9;
  if (b.actT > 0) return;

  const hpFrac = b.hp / b.hpMax;
  const rage = hpFrac < 0.45 ? 1.6 : 1.0;

  if (p === 'summon' || (p === 'all' && Math.random() < 0.34)) {
    for (let i = 0; i < 10 * rage; i++) {
      const a = rnd(TAU), rr = rnd(60, 170);
      spawnEnemy(Math.random() < 0.7 ? 'zoku' : 'hei', 1.4 + R.t / 260, b.x + Math.cos(a) * rr, b.y + Math.sin(a) * rr * 0.9);
    }
    ringShot(b, 10, 190); b.actT = 2.6 / rage;
  } else if (p === 'rush' || (p === 'all' && Math.random() < 0.5)) {
    b.charging = true; b.chargeT = 0.9;
    b.cvx = nx * b.spd * 4.2; b.cvy = ny * b.spd * 4.2;
    ringShot(b, 6, 210);
  } else if (p === 'charge') {
    b.charging = true; b.chargeT = 1.1;
    b.cvx = nx * b.spd * 4.8; b.cvy = ny * b.spd * 4.8;
  } else {
    ringShot(b, Math.round(14 * rage), 200); b.actT = 2.2 / rage;
  }
}
function ringShot(b, n, sp) {
  const off = rnd(TAU);
  for (let i = 0; i < n; i++) {
    const a = off + i / n * TAU;
    R.eprojs.push({ x: b.x, y: b.y - 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.9,
      life: 4, t: 0, dmg: b.atk * 0.6, r: 9, homing: false, color: '#e8884a' });
  }
}

/* ============ レベルアップ ============ */
let pendingLevelUps = 0;
function openLevelUp() {
  pendingLevelUps++;
  if (G.mode === 'run' && !G.headless) showLevelUp();
}
function levelUpChoices() {
  const out = [];
  const owned = {};
  R.subs.forEach(s => owned[s.id] = s.lv);
  SKILLS.forEach(s => {
    const lv = s.kind === 'sub' ? (owned[s.id] || 0) : (R.skills[s.id] || 0);
    if (lv >= s.max) return;
    // 副武装は最大6種まで
    if (s.kind === 'sub' && lv === 0 && R.subs.length >= 6) return;
    let weight = s.kind === 'sub' ? (lv === 0 ? 10 : 12) : 9;
    out.push({ s, lv, weight });
  });
  if (!out.length) return [{ s: FALLBACK_CHOICE, lv: 0, weight: 1 }];
  const picks = [];
  for (let i = 0; i < 3 && out.length; i++) {
    let tot = 0; out.forEach(o => tot += o.weight);
    let r = Math.random() * tot, idx = 0;
    for (let j = 0; j < out.length; j++) { if (r < out[j].weight) { idx = j; break; } r -= out[j].weight; }
    picks.push(out[idx]); out.splice(idx, 1);
  }
  return picks;
}
const FALLBACK_CHOICE = { id: '__heiro', kind: 'fallback', name: '兵糧', icon: '糧', max: 99,
  desc: () => '体力を全快し、戦功を得る' };

function applyChoice(c) {
  const s = c.s;
  if (s.kind === 'fallback') {
    R.hp = R.stats.hpMax; R.gold += 40; Snd.levelup(); return;
  }
  if (s.kind === 'sub') {
    const cur = R.subs.find(x => x.id === s.id);
    if (cur) cur.lv++;
    else R.subs.push({ id: s.id, def: s, lv: 1, timer: 0.3 });
    syncOrbits();
  } else {
    R.skills[s.id] = (R.skills[s.id] || 0) + 1;
    recalc();
  }
  Snd.levelup();
}

/* ============ 終了 ============ */
function endRun(won) {
  if (G.mode === 'result') return;
  G.mode = 'result';
  SAVE.runs++;
  SAVE.gold += R.gold;
  R.lootFound.forEach(it => { if (SAVE.vault.length < 400) SAVE.vault.push(it); });
  // 拾った装備で、空きスロット/より強いものを自動装備
  SLOTS.forEach(sl => {
    const cur = findItem(SAVE.equipped[sl.id]);
    let best = cur;
    SAVE.vault.forEach(it => { if (it.slot === sl.id && equipScore(it) > equipScore(best)) best = it; });
    if (best) SAVE.equipped[sl.id] = best.uid;
  });
  if (won) {
    if (SAVE.cleared.indexOf(R.stage.id) < 0) SAVE.cleared.push(R.stage.id);
    Snd.win();
  } else Snd.lose();
  const b = SAVE.best[R.stage.id] || { t: 0, kills: 0 };
  SAVE.best[R.stage.id] = { t: Math.max(b.t, Math.floor(R.t)), kills: Math.max(b.kills, R.kills) };
  R.newHeroes = checkUnlocks();
  persist();
  if (!G.headless) showResult(won);
}

function checkUnlocks() {
  const newly = [];
  HEROES.forEach(h => {
    if (!h.unlock || SAVE.heroes.indexOf(h.id) >= 0) return;
    const u = h.unlock;
    let ok = false;
    if (u.type === 'clear') ok = SAVE.cleared.indexOf(u.stage) >= 0;
    else if (u.type === 'kills') ok = SAVE.kills >= u.n;
    if (ok) { SAVE.heroes.push(h.id); newly.push(h); }
  });
  return newly;
}

/* ============ 描画 ============ */
function render() {
  const ctx = G.ctx, W = G.W, H = G.H;
  const VW = W / ZOOM, VH = H / ZOOM;
  ctx.save();
  ctx.scale(ZOOM, ZOOM);
  const sh = G.cam.shake;
  const camx = G.cam.x + (sh ? rnd(-sh, sh) : 0);
  const camy = G.cam.y + (sh ? rnd(-sh, sh) : 0);
  const ox = VW / 2 - camx, oy = VH / 2 - camy * ISO;

  /* 地面 */
  const tile = groundTile(R.stage.ground, R.stage.accent);
  const tw = tile.w, th = tile.h * ISO;
  const startX = Math.floor((camx - VW / 2) / tw) * tw;
  const startY = Math.floor((camy * ISO - VH / 2) / th) * th;
  ctx.save();
  for (let x = startX; x < camx + VW / 2 + tw; x += tw)
    for (let y = startY; y < camy * ISO + VH / 2 + th; y += th)
      ctx.drawImage(tile.c, 0, 0, tile.c.width, tile.c.height, x - camx + VW / 2, y - camy * ISO + VH / 2, tw, th);
  ctx.restore();

  /* 罠・設置物 */
  R.projs.forEach(p => {
    if (p.kind !== 'trap') return;
    const sx = p.x + ox, sy = p.y * ISO + oy;
    ctx.globalAlpha = 0.45 + 0.25 * Math.sin(p.t * 9);
    ctx.strokeStyle = p.color; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
    const q = p.r * 0.30;
    ctx.beginPath();
    ctx.moveTo(sx - q, sy - q * 0.6); ctx.lineTo(sx + q, sy + q * 0.6);
    ctx.moveTo(sx + q, sy - q * 0.6); ctx.lineTo(sx - q, sy + q * 0.6);
    ctx.moveTo(sx, sy - q * 0.9); ctx.lineTo(sx, sy + q * 0.9);
    ctx.stroke();
    ctx.globalAlpha = 1;
  });

  /* 投石の着弾予告 */
  R.fx.forEach(f => {
    if (f.kind !== 'mortar') return;
    const sx = f.x + ox, sy = f.y * ISO + oy;
    const k = Math.min(1, f.t / (f.dur * 0.72));
    ctx.strokeStyle = 'rgba(224,86,42,' + (0.35 + k * 0.5) + ')';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.ellipse(sx, sy, f.r * (1 - k * 0.15), f.r * 0.55 * (1 - k * 0.15), 0, 0, TAU); ctx.stroke();
    if (f.done) {
      ctx.fillStyle = 'rgba(240,180,90,' + Math.max(0, 1 - (f.t - f.dur * 0.72) / (f.dur * 0.28)) * 0.5 + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy, f.r, f.r * 0.55, 0, 0, TAU); ctx.fill();
    }
  });

  /* 描画順（奥→手前） */
  const list = [];
  for (let i = 0; i < R.enemies.length; i++) list.push(R.enemies[i]);
  list.push({ __player: true, x: R.x, y: R.y });
  R.orbits.forEach(o => list.push({ __orbit: o, x: o.x, y: o.y }));
  list.sort((a, b) => a.y - b.y);

  /* 拾得物（地面レイヤ） */
  R.pickups.forEach(p => {
    const sx = p.x + ox, sy = p.y * ISO + oy;
    const bob = Math.sin(p.t * 5) * 2;
    if (p.kind === 'xp') {
      ctx.fillStyle = '#7fd8e8';
      ctx.shadowColor = '#7fd8e8'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.moveTo(sx, sy - 6 + bob); ctx.lineTo(sx + 4, sy + bob);
      ctx.lineTo(sx, sy + 6 + bob); ctx.lineTo(sx - 4, sy + bob); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (p.kind === 'gold') {
      ctx.fillStyle = '#e0b93f'; ctx.shadowColor = '#e0b93f'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.ellipse(sx, sy + bob, 5, 3.4, 0, 0, TAU); ctx.fill();
      ctx.shadowBlur = 0;
    } else if (p.kind === 'heal') {
      ctx.fillStyle = '#5ad88a'; ctx.shadowColor = '#5ad88a'; ctx.shadowBlur = 10;
      ctx.fillRect(sx - 2, sy - 7 + bob, 4, 14); ctx.fillRect(sx - 7, sy - 2 + bob, 14, 4);
      ctx.shadowBlur = 0;
    } else if (p.kind === 'loot') {
      const rc = RARITY[p.item.rar];
      ctx.shadowColor = rc.color; ctx.shadowBlur = 12 + rc.glow * 14;
      ctx.fillStyle = rc.color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 10 + bob); ctx.lineTo(sx + 7, sy + bob);
      ctx.lineTo(sx, sy + 10 + bob); ctx.lineTo(sx - 7, sy + bob); ctx.closePath(); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.strokeStyle = '#1a1512'; ctx.lineWidth = 1; ctx.stroke();
    }
  });

  /* 斬撃エフェクト（キャラの下） */
  R.fx.forEach(f => {
    const k = f.t / f.dur;
    if (f.kind === 'arc') {
      const sx = f.x + ox, sy = f.y * ISO + oy;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, ISO);
      const a0 = f.spin ? f.a + k * TAU - 0.7 : f.a - f.arc / 2;
      const a1 = f.spin ? f.a + k * TAU + 0.7 : f.a - f.arc / 2 + f.arc * Math.min(1, k * 1.6);
      const grd = ctx.createRadialGradient(0, 0, f.r * 0.35, 0, 0, f.r);
      grd.addColorStop(0, 'rgba(255,246,214,0)');
      grd.addColorStop(0.7, 'rgba(255,240,200,' + (0.42 * (1 - k)) + ')');
      grd.addColorStop(1, 'rgba(224,120,60,0)');
      ctx.fillStyle = grd;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.arc(0, 0, f.r, a0, a1); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(255,250,230,' + (0.85 * (1 - k)) + ')'; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(0, 0, f.r * 0.94, a0, a1); ctx.stroke();
      ctx.restore();
    } else if (f.kind === 'thrust') {
      const sx = f.x + ox, sy = f.y * ISO + oy;
      ctx.save(); ctx.translate(sx, sy); ctx.scale(1, ISO); ctx.rotate(f.a);
      const g2 = ctx.createLinearGradient(0, 0, f.len, 0);
      g2.addColorStop(0, 'rgba(255,250,230,' + (0.7 * (1 - k)) + ')');
      g2.addColorStop(1, 'rgba(224,120,60,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(0, -f.w / 2 * (1 - k * 0.4)); ctx.lineTo(f.len, -f.w / 6);
      ctx.lineTo(f.len, f.w / 6); ctx.lineTo(0, f.w / 2 * (1 - k * 0.4));
      ctx.closePath(); ctx.fill();
      ctx.restore();
    } else if (f.kind === 'bolt') {
      const sx = f.x + ox, sy = f.y * ISO + oy;
      ctx.strokeStyle = 'rgba(190,232,248,' + (1 - k) + ')'; ctx.lineWidth = 3;
      ctx.beginPath();
      let yy = sy - 260, xx = sx + rnd(-10, 10);
      ctx.moveTo(xx, yy);
      for (let i = 0; i < 6; i++) { yy += 44; xx += rnd(-16, 16); ctx.lineTo(xx, yy); }
      ctx.lineTo(sx, sy); ctx.stroke();
      ctx.fillStyle = 'rgba(190,232,248,' + (0.35 * (1 - k)) + ')';
      ctx.beginPath(); ctx.ellipse(sx, sy, f.r, f.r * 0.5, 0, 0, TAU); ctx.fill();
    }
  });

  /* 火計オーラ */
  const aura = R.subs.find(s => s.def.sub.type === 'aura');
  if (aura) {
    const rr = (aura.def.sub.r * 0.8 + aura.lv * 12) * (1 + (R.stats.area - 1) * 0.5);
    const sx = R.x + ox, sy = R.y * ISO + oy;
    const g3 = ctx.createRadialGradient(sx, sy, rr * 0.3, sx, sy, rr);
    g3.addColorStop(0, 'rgba(232,60,26,0)');
    g3.addColorStop(0.72, 'rgba(232,74,26,' + (0.10 + 0.045 * Math.sin(R.t * 6)) + ')');
    g3.addColorStop(0.94, 'rgba(255,170,60,' + (0.16 + 0.06 * Math.sin(R.t * 6)) + ')');
    g3.addColorStop(1, 'rgba(255,170,60,0)');
    ctx.fillStyle = g3;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(1, ISO); ctx.translate(-sx, -sy);
    ctx.beginPath(); ctx.arc(sx, sy, rr, 0, TAU); ctx.fill();
    ctx.restore();
  }

  /* 実体 */
  list.forEach(o => {
    const sx = o.x + ox, sy = o.y * ISO + oy;
    if (sx < -90 || sx > VW + 90 || sy < -110 || sy > VH + 110) return;
    if (o.__player) { drawPlayer(ctx, sx, sy); return; }
    if (o.__orbit) { drawOrbit(ctx, sx, sy, o.__orbit); return; }
    drawEnemy(ctx, sx, sy, o);
  });

  /* 自弾 */
  R.projs.forEach(p => {
    if (p.kind === 'trap') return;
    const sx = p.x + ox, sy = p.y * ISO + oy;
    ctx.save();
    ctx.translate(sx, sy);
    ctx.rotate(Math.atan2(p.vy, p.vx));
    const len = p.r * 1.05 + 7, wid = Math.max(1.7, p.r * 0.4);
    const tg = ctx.createLinearGradient(-len * 2.4, 0, len, 0);
    tg.addColorStop(0, 'rgba(255,255,255,0)'); tg.addColorStop(1, p.color);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.moveTo(len, 0); ctx.lineTo(-len * 0.35, -wid);
    ctx.lineTo(-len * 2.4, 0); ctx.lineTo(-len * 0.35, wid);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff6e0'; ctx.shadowColor = p.color; ctx.shadowBlur = 9;
    ctx.beginPath(); ctx.ellipse(len * 0.4, 0, len * 0.3, wid * 0.62, 0, 0, TAU); ctx.fill();
    ctx.restore(); ctx.shadowBlur = 0;
  });
  /* 敵弾 */
  R.eprojs.forEach(p => {
    const sx = p.x + ox, sy = p.y * ISO + oy;
    ctx.fillStyle = p.color; ctx.shadowColor = p.color; ctx.shadowBlur = 8;
    ctx.beginPath(); ctx.arc(sx, sy, p.r, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
  });

  /* 粒子 */
  R.parts.forEach(p => {
    const k = 1 - p.t / p.life;
    ctx.globalAlpha = k;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x + ox - p.size / 2, p.y * ISO + oy - p.size / 2, p.size, p.size * 0.8);
  });
  ctx.globalAlpha = 1;

  /* 数字 */
  ctx.textAlign = 'center';
  R.nums.forEach(n => {
    const k = 1 - n.t / 0.62;
    ctx.globalAlpha = k;
    ctx.font = (n.crit ? 'bold 22px ' : '15px ') + FONT;
    ctx.fillStyle = n.crit ? '#f0d67a' : '#f2ece0';
    ctx.strokeStyle = 'rgba(10,9,8,0.9)'; ctx.lineWidth = 3;
    const s = String(n.v);
    ctx.strokeText(s, n.x + ox, n.y * ISO + oy);
    ctx.fillText(s, n.x + ox, n.y * ISO + oy);
  });
  ctx.globalAlpha = 1;

  /* 戦利の閃光 */
  R.fx.forEach(f => {
    if (f.kind !== 'lootflash') return;
    const k = 1 - f.t / f.dur;
    const rc = RARITY[f.rar];
    ctx.fillStyle = rc.color;
    ctx.globalAlpha = k * 0.12 * (1 + rc.glow);
    ctx.fillRect(0, 0, VW, VH);
    ctx.globalAlpha = 1;
  });

  ctx.restore();
  drawHUD(ctx, W, H);
}

const FONT = '"Hiragino Mincho ProN","Yu Mincho",YuMincho,"MS PMincho",serif';

function shadow(ctx, sx, sy, w) {
  ctx.fillStyle = 'rgba(0,0,0,0.42)';
  ctx.beginPath(); ctx.ellipse(sx, sy, w, w * 0.34, 0, 0, TAU); ctx.fill();
}

function drawPlayer(ctx, sx, sy) {
  const step = ((R.t * 7) | 0) % 2 === 0 && (G.input.dx || G.input.dy);
  const sp = heroSprite(R.hero, !!step);
  shadow(ctx, sx, sy, 12);
  ctx.strokeStyle = 'rgba(240,214,122,0.3)'; ctx.lineWidth = 1.1;
  ctx.beginPath(); ctx.ellipse(sx, sy, 16, 6, 0, 0, TAU); ctx.stroke();
  const flip = Math.cos(R.face) < 0;
  ctx.save();
  if (R.invuln > 0) ctx.globalAlpha = 0.45 + 0.4 * Math.sin(R.t * 40);
  ctx.translate(sx, sy);
  if (flip) ctx.scale(-1, 1);
  const bob = Math.sin(R.t * 9) * (step ? 1.2 : 0.4);
  ctx.drawImage(sp.c, -sp.w / 2, -sp.h + 3 + bob, sp.w, sp.h);
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawOrbit(ctx, sx, sy, o) {
  ctx.save();
  ctx.translate(sx, sy);
  if (o.kind === 'orbit') {
    ctx.fillStyle = o.color;
    ctx.beginPath(); ctx.ellipse(0, -8, 7, 11, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath(); ctx.ellipse(0, -12, 4, 4, 0, 0, TAU); ctx.fill();
  } else {
    const t = R.t * 7;
    ctx.strokeStyle = o.color; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      ctx.globalAlpha = 0.42 - i * 0.07;
      ctx.beginPath();
      for (let a = 0; a <= TAU * 1.6; a += 0.3) {
        const k = a / (TAU * 1.6);
        const rr = o.hitR * (0.22 + k * 0.78);
        const xx = Math.cos(a + t + i * 1.6) * rr;
        const yy = Math.sin(a + t + i * 1.6) * rr * 0.38 - (1 - k) * 26 - i * 3;
        a === 0 ? ctx.moveTo(xx, yy) : ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawEnemy(ctx, sx, sy, e) {
  const sp = e.boss ? bossSprite(e.def, e.step) : enemySprite(e.key, e.def, e.step);
  shadow(ctx, sx, sy, e.r * 0.72);
  ctx.save();
  ctx.translate(sx, sy);
  if (e.x > R.x) ctx.scale(-1, 1);
  ctx.drawImage(sp.c, -sp.w / 2, -sp.h + 3, sp.w, sp.h);
  if (e.flash > 0) {
    ctx.globalAlpha = Math.min(0.9, e.flash * 7);
    ctx.drawImage(flashSprite(sp).c, -sp.w / 2, -sp.h + 3, sp.w, sp.h);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  if (e.elite && !e.boss) {
    const w = 34, hf = e.hp / e.hpMax;
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(sx - w / 2, sy - sp.h - 4, w, 3);
    ctx.fillStyle = '#c0392b'; ctx.fillRect(sx - w / 2, sy - sp.h - 4, w * hf, 3);
  }
}

/* ============ HUD ============ */
function drawHUD(ctx, W, H) {
  const S = R.stats;
  ctx.textAlign = 'left';
  const pad = 14;

  /* 体力 */
  const narrow = W < 600;
  const bw = narrow ? W - pad * 2 : Math.min(300, W * 0.44), bh = 13;
  ctx.fillStyle = 'rgba(12,10,9,0.78)'; ctx.fillRect(pad, pad, bw, bh);
  const hf = clamp(R.hp / S.hpMax, 0, 1);
  const hg = ctx.createLinearGradient(pad, 0, pad + bw, 0);
  hg.addColorStop(0, '#8e2b22'); hg.addColorStop(1, '#d4483a');
  ctx.fillStyle = hg; ctx.fillRect(pad, pad, bw * hf, bh);
  ctx.strokeStyle = 'rgba(201,162,39,0.75)'; ctx.lineWidth = 1; ctx.strokeRect(pad + 0.5, pad + 0.5, bw, bh);
  ctx.font = '11px ' + FONT; ctx.fillStyle = '#f2ece0';
  ctx.fillText(Math.ceil(R.hp) + ' / ' + S.hpMax, pad + 6, pad + bh - 2.5);

  /* 経験 */
  const yb = pad + bh + 4;
  ctx.fillStyle = 'rgba(12,10,9,0.78)'; ctx.fillRect(pad, yb, bw, 7);
  ctx.fillStyle = '#c9a227'; ctx.fillRect(pad, yb, bw * clamp(R.xp / R.xpNeed, 0, 1), 7);
  ctx.font = '13px ' + FONT; ctx.fillStyle = '#e8dcb0';
  ctx.fillText('第 ' + R.lv + ' 級', pad, yb + (narrow ? 26 : 22));

  /* 時計・撃破・戦功 */
  ctx.textAlign = 'center';
  const remain = Math.max(0, Math.ceil(R.stage.dur - R.t));
  const mm = String(Math.floor(remain / 60)), ss = String(remain % 60).padStart(2, '0');
  const clockY = pad + (narrow ? 50 : 24);
  ctx.font = (narrow ? '23px ' : '26px ') + FONT;
  ctx.fillStyle = R.boss ? '#d4483a' : '#f2ece0';
  ctx.fillText(R.boss ? '決' : mm + ':' + ss, W / 2, clockY);
  ctx.font = '11px ' + FONT; ctx.fillStyle = '#a89e8c';
  ctx.fillText(R.stage.name, W / 2, clockY + 15);

  ctx.textAlign = 'right';
  ctx.font = '15px ' + FONT; ctx.fillStyle = '#e8dcb0';
  ctx.fillText('討 ' + R.kills, W - pad, pad + (narrow ? 42 : 13));
  ctx.fillStyle = '#c9a227';
  ctx.fillText('功 ' + R.gold, W - pad, pad + (narrow ? 60 : 32));

  /* 連撃 */
  if (R.combo >= 5) {
    ctx.textAlign = 'right';
    const k = clamp(R.comboT / 2.2, 0, 1);
    ctx.globalAlpha = 0.35 + k * 0.65;
    ctx.font = 'bold ' + Math.min(W * 0.105, 26 + Math.min(28, R.combo * 0.32)) + 'px ' + FONT;
    ctx.fillStyle = R.combo > 60 ? '#f0d67a' : '#e8886a';
    ctx.fillText(R.combo + ' 連', W - pad, H * 0.42);
    ctx.font = '12px ' + FONT; ctx.fillStyle = '#a89e8c';
    ctx.fillText('連撃', W - pad, H * 0.42 + 16);
    ctx.globalAlpha = 1;
  }

  /* ボス体力 */
  if (R.boss && !R.boss.dead) {
    const w2 = Math.min(460, W * 0.76), x2 = (W - w2) / 2, y2 = H - 56;
    ctx.fillStyle = 'rgba(12,10,9,0.82)'; ctx.fillRect(x2, y2, w2, 15);
    const f2 = clamp(R.boss.hp / R.boss.hpMax, 0, 1);
    const bg = ctx.createLinearGradient(x2, 0, x2 + w2, 0);
    bg.addColorStop(0, '#6e1f18'); bg.addColorStop(0.5, '#c0392b'); bg.addColorStop(1, '#e0b93f');
    ctx.fillStyle = bg; ctx.fillRect(x2, y2, w2 * f2, 15);
    ctx.strokeStyle = '#c9a227'; ctx.strokeRect(x2 + 0.5, y2 + 0.5, w2, 15);
    ctx.textAlign = 'center'; ctx.font = '14px ' + FONT; ctx.fillStyle = '#f2ece0';
    ctx.fillText(R.boss.def.name + ' — ' + R.boss.def.title, W / 2, y2 - 5);
  }

  /* 標語 */
  if (R.bannerT > 0 && R.banner) {
    const k = Math.min(1, R.bannerT * 2.2);
    ctx.textAlign = 'center'; ctx.globalAlpha = k;
    ctx.font = '30px ' + FONT;
    ctx.strokeStyle = 'rgba(10,9,8,0.92)'; ctx.lineWidth = 5;
    ctx.strokeText(R.banner, W / 2, H * 0.28);
    const lg = ctx.createLinearGradient(0, H * 0.26, 0, H * 0.3);
    lg.addColorStop(0, '#f6e9bf'); lg.addColorStop(1, '#c9a227');
    ctx.fillStyle = lg;
    ctx.fillText(R.banner, W / 2, H * 0.28);
    ctx.globalAlpha = 1;
  }

  /* 装備の粒（左下） */
  const iy = H - 20;
  ctx.textAlign = 'left';
  SLOTS.forEach((sl, i) => {
    const it = R.items.find(x => x.slot === sl.id);
    const x = pad + i * 26;
    ctx.fillStyle = it ? RARITY[it.rar].color : 'rgba(60,55,48,0.6)';
    ctx.beginPath(); ctx.moveTo(x + 8, iy - 8); ctx.lineTo(x + 16, iy); ctx.lineTo(x + 8, iy + 8); ctx.lineTo(x, iy);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(10,9,8,0.8)'; ctx.lineWidth = 1; ctx.stroke();
  });

  /* 仮想スティック */
  if (G.input.active) {
    ctx.strokeStyle = 'rgba(201,162,39,0.4)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(G.input.ox, G.input.oy, 46, 0, TAU); ctx.stroke();
    ctx.fillStyle = 'rgba(201,162,39,0.28)';
    ctx.beginPath(); ctx.arc(G.input.ox + G.input.dx * 40, G.input.oy + G.input.dy * 40, 18, 0, TAU); ctx.fill();
  }
}

/* ============ ループ ============ */
let acc = 0, lastT = 0;
G.frame = 0;
function frame(ts) {
  requestAnimationFrame(frame);
  if (!lastT) lastT = ts;
  let dt = (ts - lastT) / 1000; lastT = ts;
  if (dt > 0.1) dt = 0.1;
  G.frame++;
  if (G.mode === 'run') {
    acc += dt;
    let guard = 0;
    if (!G.demoFreeze) while (acc >= 1 / 60 && guard++ < 5) { update(1 / 60); acc -= 1 / 60; }
    render();
  }
}

/* ============ 入力 ============ */
function setupInput(cv) {
  const kmap = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0],
                 w: [0, -1], s: [0, 1], a: [-1, 0], d: [1, 0], W: [0, -1], S: [0, 1], A: [-1, 0], D: [1, 0] };
  function applyKeys() {
    let x = 0, y = 0;
    for (const k in G.input.keys) if (G.input.keys[k] && kmap[k]) { x += kmap[k][0]; y += kmap[k][1]; }
    if (!G.input.active) { G.input.dx = x; G.input.dy = y; }
  }
  addEventListener('keydown', e => {
    if (kmap[e.key]) { G.input.keys[e.key] = 1; applyKeys(); e.preventDefault(); }
    if (e.key === 'Escape' && G.mode === 'run') togglePause();
  });
  addEventListener('keyup', e => { if (kmap[e.key]) { G.input.keys[e.key] = 0; applyKeys(); } });

  const start = (id, x, y) => {
    G.input.touchId = id; G.input.active = true;
    G.input.ox = x; G.input.oy = y; G.input.dx = 0; G.input.dy = 0;
  };
  const move = (x, y) => {
    const dx = x - G.input.ox, dy = y - G.input.oy;
    const L = Math.hypot(dx, dy);
    const m = Math.min(1, L / 44);
    if (L > 1) { G.input.dx = dx / L * m; G.input.dy = dy / L * m; }
    else { G.input.dx = 0; G.input.dy = 0; }
  };
  const end = () => { G.input.active = false; G.input.touchId = null; G.input.dx = 0; G.input.dy = 0; applyKeys(); };

  cv.addEventListener('touchstart', e => {
    if (G.mode !== 'run') return;
    e.preventDefault();
    const t = e.changedTouches[0];
    start(t.identifier, t.clientX, t.clientY);
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    if (!G.input.active) return;
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === G.input.touchId) move(t.clientX, t.clientY);
    }
  }, { passive: false });
  cv.addEventListener('touchend', e => {
    for (let i = 0; i < e.changedTouches.length; i++)
      if (e.changedTouches[i].identifier === G.input.touchId) end();
  });
  cv.addEventListener('touchcancel', end);
  cv.addEventListener('mousedown', e => { if (G.mode === 'run') start(-1, e.clientX, e.clientY); });
  addEventListener('mousemove', e => { if (G.input.active) move(e.clientX, e.clientY); });
  addEventListener('mouseup', end);
}

/* ============ 自己検証（ヘッドレス） ============ */
function selfTest(seconds, heroId, stageId) {
  G.headless = true;
  if (!G.W) { G.W = 900; G.H = 600; }
  const log = { errors: [], frames: 0 };
  try {
    startRun(heroId || 'zhaoyun', stageId || 'guangzong');
    const dt = 1 / 60, N = Math.floor(seconds * 60);
    let ai = 0;
    for (let i = 0; i < N; i++) {
      if (G.mode !== 'run') break;
      // 自動操縦：最寄りの敵の逆方向へ逃げつつ円を描く
      ai += dt;
      const e = nearestEnemy(R.x, R.y, 900);
      if (e) {
        const d = Math.hypot(e.x - R.x, e.y - R.y);
        /* 近すぎたら離れ、遠ければ寄る。人が遊ぶときの距離の取り方に近づける */
        const toward = d > 150 ? 1 : -1;
        const a = Math.atan2((e.y - R.y) * toward, (e.x - R.x) * toward) + Math.sin(ai * 0.9) * 0.7;
        G.input.dx = Math.cos(a); G.input.dy = Math.sin(a);
      } else {
        G.input.dx = Math.cos(ai * 0.8); G.input.dy = Math.sin(ai * 0.8);
      }
      // レベルアップは自動で1枚目を取る
      while (pendingLevelUps > 0) {
        pendingLevelUps--;
        const c = levelUpChoices();
        if (c.length) applyChoice(c[0]);
      }
      G.hitStop = 0;
      G.frame++;
      update(dt);
      log.frames++;
    }
  } catch (err) {
    log.errors.push(String(err && err.stack ? err.stack : err));
  }
  const res = {
    ok: log.errors.length === 0,
    errors: log.errors,
    frames: log.frames,
    mode: G.mode,
    t: R ? Math.round(R.t) : 0,
    lv: R ? R.lv : 0,
    kills: R ? R.kills : 0,
    gold: R ? R.gold : 0,
    hp: R ? Math.round(R.hp) : 0,
    hpMax: R ? R.stats.hpMax : 0,
    enemies: R ? R.enemies.length : 0,
    subs: R ? R.subs.map(s => s.def.name + s.lv).join(',') : '',
    loot: R ? R.lootFound.length : 0,
    legends: R ? R.lootFound.filter(l => l.legend).map(l => l.name).join(',') : '',
    maxCombo: R ? R.stat.maxCombo : 0,
    dmgDealt: R ? Math.round(R.stat.dmgDealt) : 0,
    projs: R ? R.projs.length : 0,
    parts: R ? R.parts.length : 0,
  };
  return res;
}
window.selfTest = selfTest;
