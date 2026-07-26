/* 万夫不当 — 画面とUI */
'use strict';

const $ = id => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
};

let selHero = 'guanyu', selStage = 'guangzong';

function go(mode) {
  G.mode = mode;
  ['scr-title', 'scr-hero', 'scr-stage', 'scr-forge', 'scr-vault', 'scr-result', 'scr-pause', 'scr-levelup']
    .forEach(id => $(id).classList.remove('on'));
  const map = { title: 'scr-title', hero: 'scr-hero', stage: 'scr-stage', forge: 'scr-forge',
                vault: 'scr-vault', result: 'scr-result', paused: 'scr-pause', levelup: 'scr-levelup' };
  if (map[mode]) $(map[mode]).classList.add('on');
  $('hud-top').style.display = (mode === 'run') ? 'flex' : 'none';
  if (mode === 'title') drawTitle();
  if (mode === 'hero') drawHeroSel();
  if (mode === 'stage') drawStageSel();
  if (mode === 'forge') drawForge();
  if (mode === 'vault') drawVault();
  Snd.ui();
}

/* ============ タイトル ============ */
function drawTitle() {
  $('t-gold').textContent = SAVE.gold;
  $('t-kills').textContent = SAVE.kills;
  $('t-runs').textContent = SAVE.runs;
  const legs = SAVE.legends.length;
  $('t-legends').textContent = legs + ' / ' + LEGENDS.length;
}

/* ============ 武将選択 ============ */
function drawHeroSel() {
  const box = $('hero-list'); box.innerHTML = '';
  HEROES.forEach(h => {
    const owned = SAVE.heroes.indexOf(h.id) >= 0;
    const c = el('div', 'card hero-card' + (owned ? '' : ' locked') + (selHero === h.id ? ' sel' : ''));
    const f = FACTION[h.faction];
    c.innerHTML =
      '<div class="hc-top"><span class="hc-name">' + (owned ? h.name : '？？？') + '</span>' +
      '<span class="hc-style" style="color:' + f.color + '">' + (owned ? h.style + ' · ' + f.name : '未見') + '</span></div>' +
      '<div class="hc-weapon">' + (owned ? h.weapon : '—') + '</div>' +
      '<div class="hc-desc">' + (owned ? h.desc : (h.unlock ? h.unlock.label : '')) + '</div>' +
      (owned ? '<div class="hc-trait">' + h.trait + '</div>' : '') +
      (owned ? '<div class="hc-stats">' +
        bar('攻', h.base.atk / 34) + bar('速', h.base.aspd / 2.4) +
        bar('範', h.base.area / 1.5) + bar('体', h.base.hp / 200) +
        bar('走', (h.base.spd - 105) / 55) + '</div>' : '');
    if (owned) c.onclick = () => { selHero = h.id; drawHeroSel(); Snd.ui(); };
    box.appendChild(c);
  });
  const h = HEROES.find(x => x.id === selHero);
  $('hero-go').textContent = (SAVE.heroes.indexOf(selHero) >= 0 ? h.name : '武将') + ' で出陣';

  // 持ち込み装備の要約
  const items = SLOTS.map(s => findItem(SAVE.equipped[s.id])).filter(Boolean);
  const st = buildStats(h, items, null);
  $('hero-loadout').innerHTML =
    '<span class="lo-t">携行</span> ' +
    (items.length
      ? items.map(i => '<span style="color:' + RARITY[i.rar].color + '">' + i.name + '</span>').join(' · ')
      : '<span class="dim">なし</span>') +
    '<div class="lo-stats">攻 ' + Math.round(st.atk) + ' ／ 体 ' + st.hpMax +
    ' ／ 速 ' + st.aspd.toFixed(2) + ' ／ 会心 ' + Math.round(st.crit * 100) + '%' +
    ' ／ 戦利 +' + Math.round(st.luck * 100) + '%</div>';
}
function bar(label, v) {
  v = clamp(v, 0.05, 1);
  return '<div class="sbar"><span>' + label + '</span><i style="width:' + (v * 100) + '%"></i></div>';
}

/* ============ 戦場選択 ============ */
function drawStageSel() {
  const box = $('stage-list'); box.innerHTML = '';
  STAGES.forEach((s, i) => {
    const prevOk = i === 0 || SAVE.cleared.indexOf(STAGES[i - 1].id) >= 0;
    const cleared = SAVE.cleared.indexOf(s.id) >= 0;
    const best = SAVE.best[s.id];
    const c = el('div', 'card stage-card' + (prevOk ? '' : ' locked') + (selStage === s.id ? ' sel' : ''));
    c.innerHTML =
      '<div class="sc-head"><span class="sc-name">' + s.name + '</span>' +
      (cleared ? '<span class="sc-clear">制圧</span>' : '') + '</div>' +
      '<div class="sc-sub">' + s.sub + '</div>' +
      '<div class="sc-note">' + s.note + '</div>' +
      '<div class="sc-meta">耐える ' + Math.floor(s.dur / 60) + '分 　大将 ' + s.boss.name +
      (best ? ' 　最高 ' + best.kills + '討' : '') + '</div>' +
      (prevOk ? '' : '<div class="sc-lock">前の戦場を制圧せよ</div>');
    if (prevOk) c.onclick = () => { selStage = s.id; drawStageSel(); Snd.ui(); };
    box.appendChild(c);
  });
  const st = STAGES.find(x => x.id === selStage);
  $('stage-go').textContent = st.name + ' へ';
}

/* ============ 錬兵所 ============ */
function drawForge() {
  $('forge-gold').textContent = SAVE.gold;
  const box = $('forge-list'); box.innerHTML = '';
  FORGE.forEach(f => {
    const lv = SAVE.forge[f.id] || 0;
    const maxed = lv >= f.max;
    const cost = maxed ? 0 : f.cost(lv);
    const can = !maxed && SAVE.gold >= cost;
    const c = el('div', 'card forge-card' + (maxed ? ' maxed' : '') + (can ? '' : ' poor'));
    c.innerHTML =
      '<div class="fc-head"><span class="fc-name">' + f.name + '</span>' +
      '<span class="fc-lv">' + lv + ' / ' + f.max + '</span></div>' +
      '<div class="fc-desc">' + f.desc + '</div>' +
      '<div class="fc-cost">' + (maxed ? '極めた' : '功 ' + cost) + '</div>';
    if (can) c.onclick = () => {
      SAVE.gold -= cost; SAVE.forge[f.id] = lv + 1; persist(); drawForge(); Snd.levelup();
    };
    box.appendChild(c);
  });
}

/* ============ 保管庫 ============ */
let vaultSlot = 'weapon';
function drawVault() {
  $('vault-gold').textContent = SAVE.gold;
  const tabs = $('vault-tabs'); tabs.innerHTML = '';
  SLOTS.forEach(s => {
    const n = SAVE.vault.filter(i => i.slot === s.id).length;
    const t = el('div', 'vtab' + (vaultSlot === s.id ? ' on' : ''), s.name + '<i>' + n + '</i>');
    t.onclick = () => { vaultSlot = s.id; drawVault(); Snd.ui(); };
    tabs.appendChild(t);
  });
  const box = $('vault-list'); box.innerHTML = '';
  const items = SAVE.vault.filter(i => i.slot === vaultSlot).sort((a, b) => equipScore(b) - equipScore(a));
  if (!items.length) box.appendChild(el('div', 'dim pad', 'まだ何も落ちていない。戦場で豪傑を討て。'));
  items.forEach(it => {
    const on = SAVE.equipped[it.slot] === it.uid;
    const c = el('div', 'card item-card' + (on ? ' on' : ''));
    const rc = RARITY[it.rar];
    c.innerHTML =
      '<div class="ic-head"><span class="ic-name" style="color:' + rc.color + '">' + it.name + '</span>' +
      '<span class="ic-rar" style="color:' + rc.color + '">' + rc.name + '</span></div>' +
      (it.quote ? '<div class="ic-quote">' + it.quote + '</div>' : '') +
      '<div class="ic-stats">' + statLines(it) + '</div>' +
      (it.unique ? '<div class="ic-uniq">' + it.unique + '</div>' : '') +
      (on ? '<div class="ic-on">装備中</div>' : '');
    c.onclick = () => { SAVE.equipped[it.slot] = it.uid; persist(); drawVault(); Snd.ui(); };
    box.appendChild(c);
  });
}
function statLines(it) {
  const out = [];
  for (const k in it.stats) {
    const a = AFFIXES.find(x => x.key === k);
    const v = it.stats[k];
    out.push(a ? a.fmt(v) : (k === 'pierce' ? '貫通 +' + v : k + ' +' + v.toFixed(2)));
  }
  return out.map(s => '<span>' + s + '</span>').join('');
}

/* ============ レベルアップ ============ */
function showLevelUp() {
  if (G.mode !== 'run') return;
  G.mode = 'levelup';
  $('scr-levelup').classList.add('on');
  const box = $('lu-list'); box.innerHTML = '';
  $('lu-lv').textContent = '第 ' + R.lv + ' 級';
  const cs = levelUpChoices();
  if (!cs.length) { closeLevelUp(); return; }
  cs.forEach(c => {
    const s = c.s;
    const card = el('div', 'card lu-card' + (s.kind === 'sub' ? ' sub' : ''));
    card.innerHTML =
      '<div class="lu-icon">' + s.icon + '</div>' +
      '<div class="lu-body">' +
      '<div class="lu-name">' + s.name + (c.lv ? ' <i>' + (c.lv + 1) + '</i>' : ' <i class="new">新</i>') + '</div>' +
      '<div class="lu-desc">' + (typeof s.desc === 'function' ? s.desc(c.lv + 1) : s.desc) + '</div>' +
      '</div>';
    card.onclick = () => { applyChoice(c); closeLevelUp(); };
    box.appendChild(card);
  });
}
function closeLevelUp() {
  $('scr-levelup').classList.remove('on');
  pendingLevelUps = Math.max(0, pendingLevelUps - 1);
  if (pendingLevelUps > 0) { G.mode = 'run'; showLevelUp(); }
  else G.mode = 'run';
}

/* ============ 一時停止 ============ */
function togglePause() {
  if (G.mode === 'run') { G.mode = 'paused'; $('scr-pause').classList.add('on'); drawPause(); }
  else if (G.mode === 'paused') { G.mode = 'run'; $('scr-pause').classList.remove('on'); }
}
function drawPause() {
  const box = $('pause-body'); box.innerHTML = '';
  const S = R.stats;
  box.appendChild(el('div', 'p-line', '第 ' + R.lv + ' 級 　討 ' + R.kills + ' 　功 ' + R.gold));
  box.appendChild(el('div', 'p-line dim',
    '攻 ' + Math.round(S.atk) + ' ／ 速 ' + S.aspd.toFixed(2) + ' ／ 範 ' + S.area.toFixed(2) +
    ' ／ 会心 ' + Math.round(S.crit * 100) + '% ／ 軽減 ' + Math.round(S.armor * 100) + '%'));
  if (R.subs.length) {
    const w = el('div', 'p-subs');
    R.subs.forEach(s => w.appendChild(el('span', 'p-sub', s.def.name + ' ' + s.lv)));
    box.appendChild(w);
  }
  const it = el('div', 'p-subs');
  R.items.forEach(i => {
    const sp = el('span', 'p-sub', i.name);
    sp.style.color = RARITY[i.rar].color; sp.style.borderColor = RARITY[i.rar].color;
    it.appendChild(sp);
  });
  if (R.items.length) box.appendChild(it);
}

/* ============ 結果 ============ */
function showResult(won) {
  $('scr-pause').classList.remove('on');
  $('scr-levelup').classList.remove('on');
  pendingLevelUps = 0;
  $('scr-result').classList.add('on');
  $('r-title').textContent = won ? '制 圧' : '討 死';
  $('r-title').className = won ? 'r-title win' : 'r-title lose';
  const m = Math.floor(R.t / 60), s = Math.floor(R.t % 60);
  $('r-body').innerHTML =
    '<div class="r-stage">' + R.stage.name + ' — ' + R.hero.name + '</div>' +
    '<div class="r-grid">' +
    rrow('持ちこたえた', m + '分' + String(s).padStart(2, '0') + '秒') +
    rrow('討ち取った', R.kills + ' 騎') +
    rrow('最大連撃', R.stat.maxCombo + ' 連') +
    rrow('豪傑', R.stat.elites + ' 人') +
    rrow('与えた傷', Math.round(R.stat.dmgDealt).toLocaleString()) +
    rrow('得た戦功', '功 ' + R.gold) +
    '</div>' +
    (R.lootFound.length
      ? '<div class="r-loot"><div class="r-loot-t">戦利 ' + R.lootFound.length + ' 点</div>' +
        R.lootFound.slice(-10).map(i =>
          '<span style="color:' + RARITY[i.rar].color + '">' + i.name + '</span>').join(' · ') + '</div>'
      : '');
  const un = R.newHeroes || [];
  if (un.length) {
    $('r-unlock').style.display = 'block';
    $('r-unlock').innerHTML = '新たな武将 — ' + un.map(h => h.name).join('・');
    persist();
  } else $('r-unlock').style.display = 'none';
}
function rrow(k, v) { return '<div class="rr"><span>' + k + '</span><b>' + v + '</b></div>'; }

/* ============ 起動 ============ */
function resize() {
  const cv = G.canvas;
  const w = window.innerWidth, h = window.innerHeight;
  G.dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.floor(w * G.dpr); cv.height = Math.floor(h * G.dpr);
  cv.style.width = w + 'px'; cv.style.height = h + 'px';
  G.W = w; G.H = h;
  G.ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
  G.ctx.textBaseline = 'alphabetic';
}

function boot() {
  loadSave();
  // 装備のuidが被らないように
  let mx = 0;
  SAVE.vault.forEach(i => { if (i.uid > mx) mx = i.uid; });
  uidSeq = mx + 1;

  G.canvas = $('cv');
  G.ctx = G.canvas.getContext('2d');
  Sprites.scale = Math.min(2, window.devicePixelRatio || 1);
  resize();
  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 250));
  setupInput(G.canvas);

  const unlock = () => { Snd.init(); Snd.resume(); };
  addEventListener('pointerdown', unlock, { once: true });
  addEventListener('touchstart', unlock, { once: true });
  addEventListener('keydown', unlock, { once: true });

  // ボタン結線
  $('t-start').onclick = () => go('hero');
  $('t-forge').onclick = () => go('forge');
  $('t-vault').onclick = () => go('vault');
  $('hero-back').onclick = () => go('title');
  $('hero-go').onclick = () => { if (SAVE.heroes.indexOf(selHero) >= 0) go('stage'); };
  $('stage-back').onclick = () => go('hero');
  $('stage-go').onclick = () => {
    $('scr-stage').classList.remove('on');
    $('hud-top').style.display = 'flex';
    startRun(selHero, selStage);
  };
  $('forge-back').onclick = () => go('title');
  $('vault-back').onclick = () => go('title');
  $('btn-pause').onclick = () => togglePause();
  $('p-resume').onclick = () => togglePause();
  $('p-quit').onclick = () => { endRun(false); };
  $('p-mute').onclick = () => {
    Snd.muted = !Snd.muted;
    $('p-mute').textContent = Snd.muted ? '音を出す' : '音を消す';
  };
  $('r-again').onclick = () => { $('scr-result').classList.remove('on'); startRun(selHero, selStage); };
  $('r-home').onclick = () => go('title');
  $('r-vault').onclick = () => go('vault');

  go('title');
  requestAnimationFrame(frame);

  /* ヘッドレス自己検証: ?selftest=秒数[&hero=..&stage=..][&all=1] */
  const q = new URLSearchParams(location.search);
  if (q.get('probe')) { setTimeout(() => probeLayout(q.get('probe')), 60); return; }
  if (q.get('selftest')) runSelfTest(q);
  else if (q.get('demo')) runDemo(q);
}

/* 絵を確かめるための静止画モード: ?demo=秒数 で戦況を進めた状態から始める */
function runDemo(q) {
  const secs = parseFloat(q.get('demo')) || 90;
  G.headless = true;
  selfTest(secs, q.get('hero') || 'guanyu', q.get('stage') || 'guangzong');
  G.headless = false;
  ['scr-title','scr-hero','scr-stage','scr-forge','scr-vault','scr-result','scr-pause','scr-levelup']
    .forEach(id => $(id).classList.remove('on'));
  $('hud-top').style.display = 'flex';
  if (G.mode !== 'result') G.mode = 'run';
  G.input.active = true; G.input.ox = 86; G.input.oy = G.H - 120;
  G.input.dx = 0.62; G.input.dy = -0.38;
  G.demoFreeze = true;
  const ui = q.get('ui');
  if (ui === 'levelup') { pendingLevelUps = 1; showLevelUp(); }
  else if (ui === 'result') { endRun(false); }
  else if (ui === 'vault') { endRun(false); go('vault'); }
  else if (ui === 'hero') { endRun(false); go('hero'); }
}

/* レイアウトの実測（はみ出しの犯人を名指しするため） */
function probeLayout(screen) {
  go(screen || 'vault');
  if (screen === 'vault') {
    for (let i = 0; i < 14; i++) SAVE.vault.push(rollEquip(0.4, 0.5));
    drawVault();
  }
  const out = ['viewport=' + innerWidth + 'x' + innerHeight,
               'doc.scrollWidth=' + document.documentElement.scrollWidth,
               'body.scrollWidth=' + document.body.scrollWidth];
  document.querySelectorAll('.screen.on, .screen.on *').forEach(e => {
    const r = e.getBoundingClientRect();
    if (r.right > innerWidth + 0.5 || r.width > innerWidth + 0.5)
      out.push('OVER ' + e.tagName + '.' + (e.className || '') +
               ' w=' + Math.round(r.width) + ' right=' + Math.round(r.right) +
               ' scrollW=' + e.scrollWidth + ' txt=' + (e.textContent || '').slice(0, 18));
  });
  const pre = document.createElement('pre');
  pre.id = 'selftest-result';
  pre.textContent = out.join('\n');
  document.body.appendChild(pre);
}

function runSelfTest(q) {
  const secs = parseFloat(q.get('selftest')) || 20;
  const out = [];
  let allOk = true;
  const combos = [];
  if (q.get('all')) {
    HEROES.forEach(h => combos.push([h.id, q.get('stage') || 'guangzong']));
    STAGES.forEach(s => combos.push([q.get('hero') || 'zhaoyun', s.id]));
  } else {
    combos.push([q.get('hero') || 'guanyu', q.get('stage') || 'guangzong']);
  }
  combos.forEach(([h, s]) => {
    const r = selfTest(secs, h, s);
    r.hero = h; r.stage = s;
    if (!r.ok) allOk = false;
    out.push(r);
  });
  const pre = document.createElement('pre');
  pre.id = 'selftest-result';
  pre.style.cssText = 'position:fixed;inset:0;z-index:99;background:#000;color:#0f0;font-size:10px;overflow:auto;padding:8px;white-space:pre-wrap';
  pre.textContent = JSON.stringify(out, null, 1);
  document.body.appendChild(pre);
  document.title = allOk ? 'SELFTEST_OK' : 'SELFTEST_FAIL';
  G.mode = 'selftest';
}

window.addEventListener('error', e => { G.lastErr = String(e.message); });
document.addEventListener('DOMContentLoaded', boot);
