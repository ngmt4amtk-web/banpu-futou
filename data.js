/* 万夫不当 — データ定義
   依存ゼロ / 非module（file:// でも動く）
*/
'use strict';

/* ============ 陣営 ============ */
const FACTION = {
  shu:  { name: '蜀', color: '#3fae6d', dark: '#1d5c39' },
  wei:  { name: '魏', color: '#4a86d8', dark: '#22436e' },
  wu:   { name: '呉', color: '#d84a4a', dark: '#6e2222' },
  gun:  { name: '群雄', color: '#9a6ad8', dark: '#4a3070' },
  kou:  { name: '黄巾', color: '#d8b93f', dark: '#6e5c1d' },
};

/* ============ 攻撃タイプ ============
   sweep : 扇状の薙ぎ払い（前方）
   spin  : 自身の周囲を一回転
   thrust: 直線の貫通突き
   shot  : 投射体
   homing: 追尾する投射体
*/

/* ============ 武将 ============ */
const HEROES = [
  {
    id: 'guanyu', name: '関羽', style: '雲長', faction: 'shu',
    weapon: '青龍偃月刀',
    desc: '巨刀を薙ぎ回す。範囲最大、一撃が重い。',
    unlock: null,
    base: { hp: 128, atk: 18, aspd: 0.82, area: 1.35, spd: 128, crit: 0.05, critDmg: 1.6, pierce: 99, regen: 0.4 },
    attack: { type: 'spin', radius: 96, arc: Math.PI * 2, dur: 0.34, knock: 130 },
    trait: '長刀 — 攻撃範囲 +35%',
  },
  {
    id: 'zhangfei', name: '張飛', style: '益徳', faction: 'shu',
    weapon: '丈八蛇矛',
    desc: '一直線を貫く。当たった者は皆吹き飛ぶ。',
    unlock: null,
    base: { hp: 145, atk: 22, aspd: 0.62, area: 1.0, spd: 122, crit: 0.05, critDmg: 1.8, pierce: 99, regen: 0.5 },
    attack: { type: 'thrust', length: 210, width: 54, dur: 0.22, knock: 300 },
    trait: '当陽橋 — 撃退の衝撃が絶大',
  },
  {
    id: 'zhaoyun', name: '趙雲', style: '子龍', faction: 'shu',
    weapon: '龍胆亮銀槍',
    desc: '最速。止まらぬ手数で乱軍を裂く。',
    unlock: null,
    base: { hp: 116, atk: 11, aspd: 1.55, area: 1.0, spd: 158, crit: 0.12, critDmg: 1.7, pierce: 3, regen: 0.55 },
    attack: { type: 'sweep', radius: 122, arc: Math.PI * 1.0, dur: 0.16, knock: 90 },
    trait: '七進七出 — 移動速度と攻撃速度が最高',
  },
  {
    id: 'lubu', name: '呂布', style: '奉先', faction: 'gun',
    weapon: '方天画戟',
    desc: '人中の呂布。一振りで戦場が空く。ただし鈍い。',
    unlock: { type: 'clear', stage: 'hulao', label: '虎牢関を制する' },
    base: { hp: 160, atk: 34, aspd: 0.5, area: 1.5, spd: 112, crit: 0.08, critDmg: 2.2, pierce: 99, regen: 0.6 },
    attack: { type: 'sweep', radius: 150, arc: Math.PI * 1.25, dur: 0.4, knock: 220 },
    trait: '人中呂布 — 一撃が全武将中最大',
  },
  {
    id: 'zhugeliang', name: '諸葛亮', style: '孔明', faction: 'shu',
    weapon: '白羽扇',
    desc: '自ら斬らぬ。風刃が勝手に敵を探して墜ちる。',
    unlock: { type: 'kills', n: 3000, label: '通算3000騎を討つ' },
    base: { hp: 82, atk: 13, aspd: 1.05, area: 1.15, spd: 126, crit: 0.1, critDmg: 1.6, pierce: 2, regen: 0.8 },
    attack: { type: 'homing', speed: 420, count: 3, life: 1.6, radius: 24 },
    trait: '八陣図 — 攻撃が自動追尾。毎秒回復が高い',
  },
  {
    id: 'huangzhong', name: '黄忠', style: '漢升', faction: 'shu',
    weapon: '強弓',
    desc: '老いてなお矢は遠い。列ごと射抜く。',
    unlock: { type: 'clear', stage: 'guangzong', label: '広宗を鎮める' },
    base: { hp: 92, atk: 19, aspd: 0.92, area: 1.0, spd: 130, crit: 0.15, critDmg: 2.0, pierce: 99, regen: 0.3 },
    attack: { type: 'shot', speed: 700, count: 1, life: 1.1, radius: 16, spread: 0 },
    trait: '百歩穿楊 — 矢は敵列を貫通、会心が高い',
  },
  {
    id: 'xiahoudun', name: '夏侯惇', style: '元譲', faction: 'wei',
    weapon: '偃月刀',
    desc: '啖睛。斬るほどに己の傷が塞がる。',
    unlock: { type: 'kills', n: 1200, label: '通算1200騎を討つ' },
    base: { hp: 155, atk: 17, aspd: 0.85, area: 1.1, spd: 126, crit: 0.06, critDmg: 1.6, pierce: 99, regen: 0.2, lifesteal: 0.035 },
    attack: { type: 'sweep', radius: 116, arc: Math.PI * 1.0, dur: 0.24, knock: 140 },
    trait: '啖睛 — 与えた傷の3.5%を吸収する',
  },
  {
    id: 'ganning', name: '甘寧', style: '興霸', faction: 'wu',
    weapon: '鈴と短刀',
    desc: '錦帆賊。鈴の音とともに短刀が降りそそぐ。',
    unlock: { type: 'clear', stage: 'changban', label: '長坂坡を駆け抜ける' },
    base: { hp: 96, atk: 8, aspd: 2.1, area: 1.0, spd: 148, crit: 0.2, critDmg: 1.8, pierce: 2, regen: 0.3 },
    attack: { type: 'shot', speed: 620, count: 2, life: 0.85, radius: 12, spread: 0.28 },
    trait: '百騎劫営 — 投擲が二条。会心率が最も高い',
  },
  {
    id: 'sunshangxiang', name: '孫尚香', style: '弓腰姫', faction: 'wu',
    weapon: '連弩',
    desc: '弾幕。撃ち続けるほど束が広がる。',
    unlock: { type: 'kills', n: 6000, label: '通算6000騎を討つ' },
    base: { hp: 88, atk: 7, aspd: 2.4, area: 1.0, spd: 142, crit: 0.14, critDmg: 1.7, pierce: 1, regen: 0.3 },
    attack: { type: 'shot', speed: 660, count: 3, life: 0.8, radius: 11, spread: 0.4 },
    trait: '弓腰姫 — 三条同時発射。手数が全武将中最多',
  },
  {
    id: 'xuchu', name: '許褚', style: '仲康', faction: 'wei',
    weapon: '大刀',
    desc: '虎痴。裸で回る。近づいた者から消える。',
    unlock: { type: 'clear', stage: 'chibi', label: '赤壁を生き延びる' },
    base: { hp: 200, atk: 26, aspd: 0.7, area: 1.25, spd: 118, crit: 0.05, critDmg: 1.7, pierce: 99, regen: 1.0, armor: 0.12 },
    attack: { type: 'spin', radius: 108, arc: Math.PI * 2, dur: 0.3, knock: 200 },
    trait: '虎痴 — 体力最大。被害を12%軽減',
  },
];

/* ============ 敵 ============ */
const ENEMIES = {
  zoku:   { name: '黄巾賊',   hp: 10,   spd: 46,  atk: 6,  r: 13, xp: 2,  fac: 'kou', body: 'small',  gold: 1 },
  hei:    { name: '歩兵',     hp: 22,   spd: 52,  atk: 8,  r: 14, xp: 3,  fac: 'wei', body: 'small',  gold: 1 },
  kyu:    { name: '弓兵',     hp: 16,   spd: 40,  atk: 9,  r: 13, xp: 4,  fac: 'wu',  body: 'small',  gold: 2, ranged: { range: 260, cd: 2.2, speed: 240, dmg: 9 } },
  ju:     { name: '重装兵',   hp: 78,   spd: 32,  atk: 14, r: 19, xp: 9,  fac: 'wei', body: 'big',    gold: 3, armor: 0.25 },
  ki:     { name: '騎兵',     hp: 40,   spd: 70,  atk: 16, r: 18, xp: 7,  fac: 'gun', body: 'horse',  gold: 3, charge: true },
  gou:    { name: '豪傑',     hp: 260,  spd: 54,  atk: 22, r: 24, xp: 30, fac: 'gun', body: 'elite',  gold: 14, elite: true },
  sen:    { name: '仙術士',   hp: 150,  spd: 36,  atk: 18, r: 20, xp: 24, fac: 'kou', body: 'elite',  gold: 12, elite: true, ranged: { range: 320, cd: 1.6, speed: 200, dmg: 16, homing: true } },
  ko:     { name: '虎豹騎',   hp: 420,  spd: 84,  atk: 30, r: 26, xp: 50, fac: 'wei', body: 'horse',  gold: 24, elite: true, charge: true },
};

/* ============ 戦場 ============ */
const STAGES = [
  {
    id: 'guangzong', name: '広宗', sub: '黄巾の乱 · 中平元年',
    dur: 480, ground: '#927640', accent: '#67490e',
    boss: { key: 'zhangjiao', name: '張角', title: '大賢良師', hp: 15000, spd: 40, atk: 26, r: 44, fac: 'kou',
            pattern: 'summon', xp: 400, gold: 200 },
    waves: [
      { t: 0,   e: 'zoku', rate: 2.2, hpM: 1.0 },
      { t: 45,  e: 'zoku', rate: 3.6, hpM: 1.1 },
      { t: 90,  e: 'hei',  rate: 1.5, hpM: 1.1 },
      { t: 140, e: 'zoku', rate: 5.0, hpM: 1.3 },
      { t: 170, e: 'kyu',  rate: 0.9, hpM: 1.2 },
      { t: 220, e: 'ju',   rate: 0.5, hpM: 1.2 },
      { t: 260, e: 'zoku', rate: 7.0, hpM: 1.6 },
      { t: 300, e: 'ki',   rate: 0.8, hpM: 1.4 },
      { t: 350, e: 'hei',  rate: 3.0, hpM: 1.8 },
      { t: 400, e: 'zoku', rate: 9.0, hpM: 2.2 },
      { t: 430, e: 'ju',   rate: 1.2, hpM: 2.0 },
    ],
    elites: [55, 110, 175, 250, 330, 410],
    note: '蒼天已死 黄天當立 — 天下の乱はここから始まった。',
  },
  {
    id: 'hulao', name: '虎牢関', sub: '反董卓連合 · 初平元年',
    dur: 540, ground: '#ae6846', accent: '#922a17',
    boss: { key: 'lubu', name: '呂布', title: '人中の呂布', hp: 26000, spd: 96, atk: 44, r: 40, fac: 'gun',
            pattern: 'rush', xp: 700, gold: 340 },
    waves: [
      { t: 0,   e: 'hei',  rate: 2.6, hpM: 1.3 },
      { t: 40,  e: 'kyu',  rate: 1.0, hpM: 1.3 },
      { t: 90,  e: 'ki',   rate: 1.0, hpM: 1.3 },
      { t: 140, e: 'ju',   rate: 0.9, hpM: 1.4 },
      { t: 190, e: 'hei',  rate: 4.5, hpM: 1.7 },
      { t: 240, e: 'ki',   rate: 1.8, hpM: 1.7 },
      { t: 300, e: 'kyu',  rate: 2.2, hpM: 1.9 },
      { t: 350, e: 'ju',   rate: 1.6, hpM: 2.0 },
      { t: 410, e: 'ki',   rate: 2.6, hpM: 2.3 },
      { t: 470, e: 'hei',  rate: 7.0, hpM: 2.6 },
    ],
    elites: [50, 105, 165, 230, 300, 375, 455],
    note: '三英 呂布と戦う — 一人で三人を相手取った男が、関の前に立つ。',
  },
  {
    id: 'changban', name: '長坂坡', sub: '荊州潰走 · 建安十三年',
    dur: 540, ground: '#847b4c', accent: '#485420',
    boss: { key: 'caochun', name: '曹純', title: '虎豹騎督', hp: 32000, spd: 104, atk: 40, r: 38, fac: 'wei',
            pattern: 'charge', xp: 800, gold: 380 },
    waves: [
      { t: 0,   e: 'ki',   rate: 1.4, hpM: 1.5 },
      { t: 50,  e: 'hei',  rate: 3.4, hpM: 1.5 },
      { t: 100, e: 'ko',   rate: 0.16, hpM: 1.0 },
      { t: 150, e: 'kyu',  rate: 1.8, hpM: 1.7 },
      { t: 200, e: 'ki',   rate: 2.6, hpM: 1.9 },
      { t: 260, e: 'ju',   rate: 1.6, hpM: 2.0 },
      { t: 320, e: 'ko',   rate: 0.3, hpM: 1.2 },
      { t: 380, e: 'hei',  rate: 6.5, hpM: 2.4 },
      { t: 440, e: 'ki',   rate: 3.4, hpM: 2.7 },
      { t: 490, e: 'ju',   rate: 2.4, hpM: 2.8 },
    ],
    elites: [45, 95, 150, 210, 270, 330, 400, 470],
    note: '子龍 一身 都是胆也 — 単騎で乱軍に突っ込み、抱いて戻った。',
  },
  {
    id: 'chibi', name: '赤壁', sub: '烏林の火 · 建安十三年冬',
    dur: 600, ground: '#ad6a37', accent: '#8c320b',
    boss: { key: 'caiMao', name: '蔡瑁', title: '荊州水軍都督', hp: 42000, spd: 62, atk: 46, r: 42, fac: 'wei',
            pattern: 'ring', xp: 950, gold: 460 },
    waves: [
      { t: 0,   e: 'hei',  rate: 4.0, hpM: 1.8 },
      { t: 50,  e: 'kyu',  rate: 2.2, hpM: 1.8 },
      { t: 110, e: 'ju',   rate: 1.6, hpM: 1.9 },
      { t: 170, e: 'sen',  rate: 0.24, hpM: 1.2 },
      { t: 220, e: 'hei',  rate: 7.0, hpM: 2.3 },
      { t: 280, e: 'ki',   rate: 3.0, hpM: 2.4 },
      { t: 340, e: 'kyu',  rate: 3.4, hpM: 2.6 },
      { t: 400, e: 'ju',   rate: 2.8, hpM: 2.8 },
      { t: 460, e: 'ko',   rate: 0.4, hpM: 1.6 },
      { t: 520, e: 'hei',  rate: 10.0, hpM: 3.2 },
    ],
    elites: [50, 100, 160, 220, 280, 340, 400, 460, 530],
    note: '東南の風 — 火は船を焼き、天下を三つに割った。',
  },
  {
    id: 'wuzhangyuan', name: '五丈原', sub: '北伐終焉 · 建興十二年',
    dur: 660, ground: '#8b785e', accent: '#3b5169',
    boss: { key: 'simayi', name: '司馬懿', title: '大将軍', hp: 62000, spd: 74, atk: 54, r: 44, fac: 'wei',
            pattern: 'all', xp: 1400, gold: 700 },
    waves: [
      { t: 0,   e: 'hei',  rate: 5.0, hpM: 2.2 },
      { t: 45,  e: 'kyu',  rate: 3.0, hpM: 2.2 },
      { t: 100, e: 'ju',   rate: 2.2, hpM: 2.4 },
      { t: 160, e: 'ki',   rate: 3.2, hpM: 2.5 },
      { t: 220, e: 'sen',  rate: 0.4, hpM: 1.5 },
      { t: 280, e: 'ko',   rate: 0.44, hpM: 1.7 },
      { t: 340, e: 'hei',  rate: 9.0, hpM: 3.0 },
      { t: 400, e: 'ju',   rate: 3.4, hpM: 3.2 },
      { t: 460, e: 'ki',   rate: 4.6, hpM: 3.4 },
      { t: 530, e: 'kyu',  rate: 5.0, hpM: 3.6 },
      { t: 590, e: 'hei',  rate: 13.0, hpM: 4.2 },
    ],
    elites: [45, 95, 150, 205, 260, 320, 380, 440, 500, 570],
    note: '秋風五丈原 — 死せる孔明、生ける仲達を走らす。',
  },
];

/* ============ 技（レベルアップ選択） ============ */
/* kind: 'sub' 副武装（新規/強化）  'stat' 能力強化 */
const SKILLS = [
  /* --- 副武装 --- */
  { id: 'kaya',   kind: 'sub', name: '火矢',       max: 5, icon: '火',
    desc: lv => `${2 + lv}本の火矢を周期的に放つ（威力 ${Math.round(60 + lv * 22)}%）`,
    sub: { type: 'shot', cd: 2.0, dmg: 0.6, speed: 460, life: 1.5, r: 14, count: 3, spread: 0.5, color: '#e8722a', pierce: 1 } },
  { id: 'renfu',  kind: 'sub', name: '連弩',       max: 5, icon: '弩',
    desc: lv => `最寄りの敵へ連射する（毎秒 ${(1.6 + lv * 0.5).toFixed(1)}射）`,
    sub: { type: 'shot', cd: 0.62, dmg: 0.35, speed: 700, life: 1.0, r: 9, count: 1, spread: 0.08, color: '#d8cfae', pierce: 0, aim: true } },
  { id: 'tetsu',  kind: 'sub', name: '鉄蒺藜',     max: 5, icon: '蒺',
    desc: lv => `足元に撒菱を残す。踏んだ者が傷つく（${3 + lv}個）`,
    sub: { type: 'drop', cd: 1.5, dmg: 0.5, life: 5.0, r: 20, count: 4, color: '#8a8272' } },
  { id: 'rakurai',kind: 'sub', name: '落雷',       max: 5, icon: '雷',
    desc: lv => `無作為な敵へ雷を落とす（${1 + lv}条・威力 ${Math.round(140 + lv * 40)}%）`,
    sub: { type: 'bolt', cd: 3.2, dmg: 1.4, count: 2, r: 52, color: '#9fd8f0' } },
  { id: 'kakei',  kind: 'sub', name: '火計',       max: 5, icon: '燎',
    desc: lv => `自身を炎が取り巻き、触れた者を焼く（半径 ${90 + lv * 18}）`,
    sub: { type: 'aura', cd: 0.4, dmg: 0.22, r: 96, color: '#e0562a' } },
  { id: 'toko',   kind: 'sub', name: '藤甲兵',     max: 5, icon: '藤',
    desc: lv => `${1 + lv}体の兵が周囲を巡り、触れた敵を薙ぐ`,
    sub: { type: 'orbit', cd: 0.25, dmg: 0.55, count: 2, r: 108, speed: 2.4, color: '#8fae5a' } },
  { id: 'toseki', kind: 'sub', name: '投石',       max: 5, icon: '砲',
    desc: lv => `巨石が落ち、着弾点が爆ぜる（範囲 ${70 + lv * 14}）`,
    sub: { type: 'mortar', cd: 2.8, dmg: 1.6, r: 84, count: 1, color: '#9a8f7a' } },
  { id: 'seiko',  kind: 'sub', name: '青釭剣',     max: 5, icon: '剣',
    desc: lv => `影の剣が敵を切り裂きながら走る（${1 + lv}振）`,
    sub: { type: 'shot', cd: 2.4, dmg: 1.1, speed: 540, life: 1.8, r: 20, count: 2, spread: 6.28, color: '#a9d8e8', pierce: 99 } },
  { id: 'senpu',  kind: 'sub', name: '旋風',       max: 5, icon: '旋',
    desc: lv => `つむじ風が戦場を彷徨い、巻き込む（${1 + lv}基）`,
    sub: { type: 'wander', cd: 0.3, dmg: 0.4, count: 1, r: 62, speed: 150, color: '#b8c8d8' } },
  { id: 'mokugyu',kind: 'sub', name: '木牛流馬',   max: 3, icon: '牛',
    desc: lv => `経験と戦功を自動で拾い集める（範囲 +${60 + lv * 40}%）`,
    sub: { type: 'passive_pickup', v: 0.6 } },

  /* --- 能力強化 --- */
  { id: 'bu',   kind: 'stat', name: '武',   max: 8, icon: '武', stat: 'atk',     v: 0.12, desc: lv => `攻撃力 +12%（現在 +${lv * 12}%）` },
  { id: 'shitsu',kind:'stat', name: '疾',   max: 8, icon: '疾', stat: 'aspd',    v: 0.10, desc: lv => `攻撃速度 +10%（現在 +${lv * 10}%）` },
  { id: 'en',   kind: 'stat', name: '遠',   max: 6, icon: '遠', stat: 'area',    v: 0.10, desc: lv => `攻撃範囲 +10%（現在 +${lv * 10}%）` },
  { id: 'jin',  kind: 'stat', name: '迅',   max: 6, icon: '迅', stat: 'spd',     v: 0.08, desc: lv => `移動速度 +8%（現在 +${lv * 8}%）` },
  { id: 'ken',  kind: 'stat', name: '堅',   max: 8, icon: '堅', stat: 'hp',      v: 0.15, desc: lv => `最大体力 +15%（現在 +${lv * 15}%）` },
  { id: 'katsu',kind: 'stat', name: '活',   max: 6, icon: '活', stat: 'regen',   v: 0.7,  desc: lv => `毎秒回復 +0.7（現在 +${(lv * 0.7).toFixed(1)}）` },
  { id: 'ei',   kind: 'stat', name: '鋭',   max: 6, icon: '鋭', stat: 'crit',    v: 0.05, desc: lv => `会心率 +5%（現在 +${lv * 5}%）` },
  { id: 'retsu',kind: 'stat', name: '烈',   max: 6, icon: '烈', stat: 'critDmg', v: 0.25, desc: lv => `会心の威力 +25%（現在 +${lv * 25}%）` },
  { id: 'kan',  kind: 'stat', name: '貫',   max: 4, icon: '貫', stat: 'pierce',  v: 1,    desc: lv => `貫通 +1（現在 +${lv}）` },
  { id: 'un',   kind: 'stat', name: '運',   max: 6, icon: '運', stat: 'luck',    v: 0.14, desc: lv => `戦利品の質と量 +14%（現在 +${lv * 14}%）` },
  { id: 'don',  kind: 'stat', name: '貪',   max: 6, icon: '貪', stat: 'exp',     v: 0.12, desc: lv => `獲得経験 +12%（現在 +${lv * 12}%）` },
  { id: 'go',   kind: 'stat', name: '剛',   max: 5, icon: '剛', stat: 'armor',   v: 0.05, desc: lv => `被害軽減 +5%（現在 +${lv * 5}%）` },
];

/* ============ 装備 ============ */
const RARITY = [
  { id: 0, name: '常品', color: '#8d8578', glow: 0.0, rolls: 1, mult: 1.00 },
  { id: 1, name: '良品', color: '#5f9fd8', glow: 0.4, rolls: 2, mult: 1.35 },
  { id: 2, name: '名品', color: '#a86ad8', glow: 0.8, rolls: 3, mult: 1.85 },
  { id: 3, name: '神品', color: '#e0b93f', glow: 1.4, rolls: 4, mult: 2.6 },
];

const SLOTS = [
  { id: 'weapon', name: '兵器' },
  { id: 'armor',  name: '甲冑' },
  { id: 'helm',   name: '兜'   },
  { id: 'mount',  name: '坐騎' },
  { id: 'jade',   name: '佩玉' },
  { id: 'book',   name: '兵書' },
];

const BASE_NAMES = {
  weapon: ['環首刀', '長矛', '戟', '鉄剣', '偃月刀', '双戟', '大斧', '鉤鑲'],
  armor:  ['皮甲', '札甲', '鎖子甲', '両当鎧', '明光鎧', '筒袖鎧'],
  helm:   ['幘', '兜鍪', '鉄兜', '獣面兜', '鳳翅兜'],
  mount:  ['駑馬', '駿馬', '西涼馬', '烏騅', '爪黄飛電'],
  jade:   ['玉佩', '銅印', '虎符', '金印紫綬', '瑞玉'],
  book:   ['竹簡', '兵法書', '奇門遁甲', '太平要術', '孟徳新書'],
};

/* 接頭辞（強化の性格を決める） */
const AFFIXES = [
  { key: 'atk',     name: '鋭利の',   v: [0.06, 0.16], fmt: v => `攻撃力 +${Math.round(v * 100)}%` },
  { key: 'aspd',    name: '迅速の',   v: [0.05, 0.14], fmt: v => `攻撃速度 +${Math.round(v * 100)}%` },
  { key: 'area',    name: '広大の',   v: [0.05, 0.14], fmt: v => `攻撃範囲 +${Math.round(v * 100)}%` },
  { key: 'spd',     name: '疾風の',   v: [0.04, 0.11], fmt: v => `移動速度 +${Math.round(v * 100)}%` },
  { key: 'hp',      name: '堅牢の',   v: [0.07, 0.20], fmt: v => `最大体力 +${Math.round(v * 100)}%` },
  { key: 'regen',   name: '不撓の',   v: [0.3, 1.4],   fmt: v => `毎秒回復 +${v.toFixed(1)}` },
  { key: 'crit',    name: '狙撃の',   v: [0.03, 0.09], fmt: v => `会心率 +${Math.round(v * 100)}%` },
  { key: 'critDmg', name: '苛烈の',   v: [0.12, 0.40], fmt: v => `会心威力 +${Math.round(v * 100)}%` },
  { key: 'luck',    name: '幸運の',   v: [0.06, 0.18], fmt: v => `戦利 +${Math.round(v * 100)}%` },
  { key: 'exp',     name: '研鑽の',   v: [0.06, 0.18], fmt: v => `経験 +${Math.round(v * 100)}%` },
  { key: 'armor',   name: '鉄壁の',   v: [0.02, 0.07], fmt: v => `被害軽減 +${Math.round(v * 100)}%` },
  { key: 'pickup',  name: '貪婪の',   v: [0.15, 0.5],  fmt: v => `取得範囲 +${Math.round(v * 100)}%` },
];

/* 神品（固有装備）— 落ちた瞬間に画面が金になる */
const LEGENDS = [
  { id: 'fangtian', slot: 'weapon', name: '方天画戟',   quote: '呂布これを提げ、天下に敵なし',
    stats: { atk: 0.42, area: 0.22, aspd: -0.08 }, unique: '一撃が特大。ただし手数は落ちる' },
  { id: 'qinglong', slot: 'weapon', name: '青龍偃月刀', quote: '八十二斤、月の如く曲がる',
    stats: { atk: 0.28, area: 0.30 }, unique: '範囲と威力を同時に伸ばす' },
  { id: 'zhangba',  slot: 'weapon', name: '丈八蛇矛',   quote: '当陽橋上、一喝して水を逆流させた',
    stats: { atk: 0.30, pierce: 2, critDmg: 0.35 }, unique: '貫通と会心威力' },
  { id: 'yitian',   slot: 'weapon', name: '倚天剣',     quote: '曹操の佩剣。自ら佩き、青釭を典韋に授けた',
    stats: { atk: 0.22, crit: 0.10, critDmg: 0.30 }, unique: '会心に全振り' },
  { id: 'qixing',   slot: 'weapon', name: '七星宝刀',   quote: '董卓を刺すため、王允が曹操に渡した',
    stats: { atk: 0.20, pierce: 3, aspd: 0.12 }, unique: '貫通が伸びる' },
  { id: 'chitu',    slot: 'mount',  name: '赤兎馬',     quote: '人中に呂布あり、馬中に赤兎あり',
    stats: { spd: 0.26, pickup: 0.4, aspd: 0.10 }, unique: '移動が別次元になる' },
  { id: 'dilu',     slot: 'mount',  name: '的盧',       quote: '檀渓を一跳びに越えた',
    stats: { spd: 0.20, regen: 1.6, hp: 0.15 }, unique: '主を乗り越えさせる' },
  { id: 'yuxi',     slot: 'jade',   name: '伝国璽',     quote: '受命於天 既寿永昌',
    stats: { luck: 0.35, exp: 0.30 }, unique: '戦利と経験が跳ね上がる' },
  { id: 'hufu',     slot: 'jade',   name: '虎符',       quote: '兵を発するの証',
    stats: { atk: 0.18, hp: 0.18, armor: 0.05 }, unique: '攻守を同時に底上げ' },
  { id: 'mingguang',slot: 'armor',  name: '明光鎧',     quote: '日を受けて明るく光る',
    stats: { hp: 0.30, armor: 0.08 }, unique: '生存力の要' },
  { id: 'taiping',  slot: 'book',   name: '太平要術',   quote: '于吉より張角へ渡った巻',
    stats: { atk: 0.16, area: 0.18, regen: 1.2 }, unique: '術者の書' },
  { id: 'mengde',   slot: 'book',   name: '孟徳新書',   quote: '孫子を己の言葉で書き直した',
    stats: { exp: 0.28, crit: 0.06, aspd: 0.12 }, unique: '成長が加速する' },
  { id: 'fengchi',  slot: 'helm',   name: '鳳翅紫金冠', quote: '呂布の頭上に燦然と',
    stats: { atk: 0.20, crit: 0.08, hp: 0.12 }, unique: '将たる証' },
];

/* ============ 錬兵所（永続強化） ============ */
const FORGE = [
  { id: 'p_atk',   name: '練武',   stat: 'atk',    v: 0.05, max: 10, cost: lv => 60 + lv * 55,  desc: '攻撃力 +5%' },
  { id: 'p_hp',    name: '養生',   stat: 'hp',     v: 0.07, max: 10, cost: lv => 55 + lv * 50,  desc: '最大体力 +7%' },
  { id: 'p_spd',   name: '軽功',   stat: 'spd',    v: 0.03, max: 6,  cost: lv => 80 + lv * 70,  desc: '移動速度 +3%' },
  { id: 'p_aspd',  name: '鍛錬',   stat: 'aspd',   v: 0.04, max: 8,  cost: lv => 90 + lv * 80,  desc: '攻撃速度 +4%' },
  { id: 'p_luck',  name: '福徳',   stat: 'luck',   v: 0.08, max: 8,  cost: lv => 100 + lv * 90, desc: '戦利の質と量 +8%' },
  { id: 'p_exp',   name: '学問',   stat: 'exp',    v: 0.06, max: 8,  cost: lv => 85 + lv * 75,  desc: '獲得経験 +6%' },
  { id: 'p_regen', name: '導引',   stat: 'regen',  v: 0.5,  max: 6,  cost: lv => 110 + lv * 95, desc: '毎秒回復 +0.5' },
  { id: 'p_armor', name: '護身',   stat: 'armor',  v: 0.02, max: 6,  cost: lv => 130 + lv * 110, desc: '被害軽減 +2%' },
  { id: 'p_rev',   name: '再起',   stat: 'revive', v: 1,    max: 2,  cost: lv => 900 + lv * 1200, desc: '戦死から一度立ち上がる' },
];

/* ============ 名言（撃破数の節目に出る） ============ */
const CRIES = [
  { n: 30,   text: '当たるを幸い' },
  { n: 80,   text: '一騎当千' },
  { n: 150,  text: '万夫不当' },
  { n: 250,  text: '人馬もろとも' },
  { n: 400,  text: '血は河を成す' },
  { n: 600,  text: '天下に敵なし' },
  { n: 900,  text: '鬼神の如し' },
  { n: 1300, text: '修羅' },
];
