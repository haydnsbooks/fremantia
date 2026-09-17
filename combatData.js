// ============================================================================
// COMBAT REALM DATA — formulas + generated reference data for the optional
// Combat Realm side-game. Kept separate from GAME_DATA (academic maths
// progression), CONFIG (main-game constants) and STATE (player progression)
// — this file only defines the SHAPE of the combat system, never
// player-specific state. See combat_realm_design.md and
// combat_realm_shop_items.md for the design rationale behind every number.
// ============================================================================

const COMBAT_CONFIG = {
  ENERGY_CAP: 10,
  ENERGY_COST_PER_BATTLE: 5,
  MIN_ANSWERS_FOR_ENERGY: 3,
  MIN_SECONDS_BETWEEN_ANSWERS: 1.5,

  // Attribute steps — see combat_realm_design.md §3. Sum of levelsToMax (39)
  // + starting level (1) = MAX_COMBAT_LEVEL (40).
  ATTRIBUTES: {
    attackSpeed: { key: "attackSpeed", label: "Attack Speed", start: 1.0, step: 0.1, max: 2.0, levelsToMax: 10, suffix: "/sec", decimals: 1 },
    attack:      { key: "attack",      label: "Attack",       start: 0,   step: 10,  max: 100, levelsToMax: 10, prefix: "+",   decimals: 0 },
    vitality:    { key: "vitality",    label: "Vitality",     start: 100, step: 100, max: 1000, levelsToMax: 9, prefix: "",    decimals: 0 },
    defence:     { key: "defence",     label: "Defence",      start: 0,   step: 5,   max: 50,  levelsToMax: 10, prefix: "-",   decimals: 0 }
  },
  MAX_COMBAT_LEVEL: 40,

  XP_BASE: 50,
  XP_GROWTH: 1.25,

  MONSTER_COUNT: 20,
  FINAL_BOSS_COUNT: 4, // monsters 17-20
  HP1: 50, HP20: 8000,
  ATK1: 8, ATK20: 96,
  ATKSPD1: 1.0, ATKSPD20: 1.5,
  XP1: 10,
  CUR1: 5,

  // Strong vs the next element in the cycle, weak vs the one before it.
  TYPE_CYCLE: ["Water", "Fire", "Ice", "Forest"],

  SHOP_TIERS: [
    { id: "entry",    label: "Entry",    price: 50 },
    { id: "mid",      label: "Mid",      price: 500 },
    { id: "advanced", label: "Advanced", price: 2000 },
    { id: "epic",     label: "Epic",     price: 5600 }
  ]
};

const COMBAT_ELEMENT_ICON = { Forest: "🌲", Water: "🌊", Fire: "🔥", Ice: "❄️" };

// ----------------------------------------------------------------------------
// TYPE EFFECTIVENESS
// ----------------------------------------------------------------------------
function typeMultiplier(weaponElement, monsterElement) {
  const cycle = COMBAT_CONFIG.TYPE_CYCLE;
  const wi = cycle.indexOf(weaponElement);
  const mi = cycle.indexOf(monsterElement);
  if (wi === -1 || mi === -1) return 1;
  if ((wi + 1) % 4 === mi) return 2;    // strong vs the next element
  if ((mi + 1) % 4 === wi) return 0.5;  // weak vs the element that beats us
  return 1;
}

// ----------------------------------------------------------------------------
// ATTRIBUTES
// ----------------------------------------------------------------------------
function attributeValue(key, level) {
  const def = COMBAT_CONFIG.ATTRIBUTES[key];
  const raw = def.start + def.step * level;
  return Math.round(raw * 100) / 100;
}
function formatAttributeValue(key, level) {
  const def = COMBAT_CONFIG.ATTRIBUTES[key];
  const v = attributeValue(key, level);
  return `${def.prefix || ""}${v.toFixed(def.decimals)}${def.suffix || ""}`;
}

// ----------------------------------------------------------------------------
// COMBAT XP / LEVEL — cumulative-threshold table, same "derive from a single
// source" pattern as Hero Level. Threshold[L] = XP needed to BE at level L
// (0 at level 1).
// ----------------------------------------------------------------------------
const COMBAT_XP_THRESHOLDS = (() => {
  const arr = [0, 0]; // index 0 unused; index 1 (level 1) = 0 XP
  let cum = 0;
  for (let L = 1; L < COMBAT_CONFIG.MAX_COMBAT_LEVEL; L++) {
    cum += Math.round(COMBAT_CONFIG.XP_BASE * Math.pow(COMBAT_CONFIG.XP_GROWTH, L - 1));
    arr[L + 1] = cum;
  }
  return arr;
})();

function combatLevelForXp(xp) {
  let level = 1;
  for (let L = 1; L <= COMBAT_CONFIG.MAX_COMBAT_LEVEL; L++) {
    if (xp >= COMBAT_XP_THRESHOLDS[L]) level = L; else break;
  }
  return level;
}
function xpForCombatLevel(level) {
  return COMBAT_XP_THRESHOLDS[level] || 0;
}

// ----------------------------------------------------------------------------
// MONSTER LADDER — generated from the anchor formulas, not hand-authored.
// See combat_realm_design.md §5 for the validated balance checks.
// ----------------------------------------------------------------------------
function generateMonsterLadder() {
  const c = COMBAT_CONFIG;
  const n = c.MONSTER_COUNT;
  const rHp = Math.pow(c.HP20 / c.HP1, 1 / (n - 1));
  const rAtk = Math.pow(c.ATK20 / c.ATK1, 1 / (n - 1));
  const list = [];
  for (let i = 1; i <= n; i++) {
    const isFinalBoss = i > n - c.FINAL_BOSS_COUNT;
    const element = c.TYPE_CYCLE[(i - 1) % 4];
    list.push({
      id: i,
      element,
      isFinalBoss,
      // Placeholder display names — real names belong in a future
      // combat_realm_monster_names.md, same pattern as the realm
      // monster-name files. Not invented here since they weren't asked for.
      name: isFinalBoss ? `${element} Realm Boss` : `${element} Foe ${i}`,
      hp: Math.round(c.HP1 * Math.pow(rHp, i - 1)),
      attack: Math.round(c.ATK1 * Math.pow(rAtk, i - 1) * 10) / 10,
      attackSpeed: Math.round((c.ATKSPD1 + (c.ATKSPD20 - c.ATKSPD1) * (i - 1) / (n - 1)) * 100) / 100,
      xpReward: Math.round(c.XP1 * Math.pow(rHp, i - 1)),
      fremantiumReward: Math.round(c.CUR1 * Math.pow(rHp, i - 1))
    });
  }
  return list;
}
const COMBAT_MONSTERS = generateMonsterLadder();
function getCombatMonster(id) { return COMBAT_MONSTERS.find(m => m.id === id); }

// ----------------------------------------------------------------------------
// BATTLE MATH — pure function, no DOM/state side effects. See
// combat_realm_design.md §5 "Battle model".
// ----------------------------------------------------------------------------
function computeBattleParams(weaponElement, weaponDamage, attributeLevels, monster) {
  const atkBonus = attributeValue("attack", attributeLevels.attack || 0);
  const atkSpeed = attributeValue("attackSpeed", attributeLevels.attackSpeed || 0);
  const vitality = attributeValue("vitality", attributeLevels.vitality || 0);
  const defence = attributeValue("defence", attributeLevels.defence || 0);
  const mult = typeMultiplier(weaponElement, monster.element);

  const playerDamagePerHit = Math.round((weaponDamage + atkBonus) * mult);
  const monsterDamagePerHit = Math.max(1, Math.round(monster.attack - defence));

  return {
    typeMultiplier: mult,
    playerDamagePerHit,
    playerAttackIntervalMs: 1000 / atkSpeed,
    monsterDamagePerHit,
    monsterAttackIntervalMs: 1000 / monster.attackSpeed,
    playerMaxHp: vitality
  };
}

// ----------------------------------------------------------------------------
// SHOP ITEMS — naming data from combat_realm_shop_items.md. Two items per
// tier for Entry/Mid/Advanced; a single mystery-locked item per category at
// Epic tier (see combat_realm_design.md §6).
// ----------------------------------------------------------------------------
const SHOP_ITEMS = {
  pets: [
    { id: "pet_entry_1", tier: "entry", name: "Pebble the Rock Snail", icon: "🐌",
      flavor: "Moves at one pebble per minute. Has never once been in a hurry, even during battles that were happening to him directly." },
    { id: "pet_entry_2", tier: "entry", name: "Squeaky the Battle Bat", icon: "🦇",
      flavor: "Flies in a straight line roughly 40% of the time. Considers itself extremely fierce. It is not." },
    { id: "pet_mid_1", tier: "mid", name: "Glimmerwing Butterfly", icon: "🦋",
      flavor: "Its wings hold a faint shimmer of leftover spark from every battle it's watched. Doesn't fight. Mostly just glows supportively." },
    { id: "pet_mid_2", tier: "mid", name: "Bramblehop", icon: "🐰",
      flavor: "A rabbit made of tangled thistle and burrs who somehow never gets stuck on anything else. Extremely loyal, mildly prickly to hug." },
    { id: "pet_adv_1", tier: "advanced", name: "Ashback", icon: "🐺",
      flavor: "A wolf pup with fur that smoulders faintly at the tips. Still growing into a much bigger howl than the one it currently has." },
    { id: "pet_adv_2", tier: "advanced", name: "Frostmaw Cub", icon: "🐻‍❄️",
      flavor: "A baby glacier bear. Freezes puddles by accident when it gets excited, which is often." },
    { id: "pet_epic", tier: "epic", mystery: true, name: "Fremantia's Last Dragon", icon: "🐉",
      flavor: "Said to be the last hatchling of the dragon that once guarded all four realms, before its power split into Forest, Water, Fire, and Ice. Only answers to heroes who have proven themselves against every element." }
  ],
  trophies: [
    { id: "trophy_entry_1", tier: "entry", name: "Participation Pretzel (Slightly Bent)", icon: "🥨",
      flavor: "Awarded for showing up. The bend happened during an enthusiastic victory pose — turns out it looked pretty good on a trophy anyway." },
    { id: "trophy_entry_2", tier: "entry", name: "The Just-Okay Burger", icon: "🍔",
      flavor: "For doing fine, actually. It's a trophy. It's also, somehow, a burger. No further comment." },
    { id: "trophy_mid_1", tier: "mid", name: "Golden Gauntlet of Getting There", icon: "🧤",
      flavor: "Half-polished, half still tarnished. A visible reminder that you're not finished yet — but you're closer than you think." },
    { id: "trophy_mid_2", tier: "mid", name: "The Unbroken Streak Cup", icon: "🏆",
      flavor: "Engraved with a tally of every correct answer in a row. Politely declines to mention the ones that weren't." },
    { id: "trophy_adv_1", tier: "advanced", name: "Gauntlet of the Undefeated", icon: "🥊",
      flavor: "Battle-worn, dented, and still standing. Technically never lost a fight — mostly because it refuses to lose on principle." },
    { id: "trophy_adv_2", tier: "advanced", name: "Crest of the Four Blades", icon: "🛡️",
      flavor: "A shield-shaped crest bearing the emblems of Steel Sword, Verdant Blade, Tidecaller, and Emberblade side by side. Only earned by heroes who've wielded all four." },
    { id: "trophy_epic", tier: "epic", mystery: true, name: "Crown of the Fourfold Master", icon: "👑",
      flavor: "Forged from a fragment of each of the four Realm Orbs. Worn only by the hero who has stood against every element in the Combat Realm — and won." }
  ]
};

function shopItemTier(item) {
  return COMBAT_CONFIG.SHOP_TIERS.find(t => t.id === item.tier);
}
function shopItemPrice(item) {
  const tier = shopItemTier(item);
  return tier ? tier.price : 0;
}
function findShopItem(itemId) {
  return SHOP_ITEMS.pets.find(i => i.id === itemId) || SHOP_ITEMS.trophies.find(i => i.id === itemId);
}
