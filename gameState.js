// ============================================================================
// GAME STATE — persistent player progression. Separate from math/naming data.
// Saved to localStorage so progress survives reloads. A failed portal run
// never touches this data (only stage-in-progress state, which lives
// elsewhere and is thrown away on failure).
// ============================================================================

const SAVE_KEY_PREFIX = "mathsFluencyGame_save_v2_";

function freshState() {
  return {
    // realmId -> true if unlocked
    unlockedRealms: { Forest: true },
    completedRealms: {},
    realmOrbs: {},
    // "Forest:World 1" -> true if unlocked
    unlockedWorlds: { "Forest:World 1": true },
    completedWorlds: {},
    worldKeys: {},
    // "Forest:World 1" -> { "A1": true, "A2": true, ... }  (boss shard collected)
    shards: {},
    // "Forest:World 1" -> { "A1": true } (stage fully completed, distinct from shard for clarity — same trigger)
    completedStages: {},
    // realmId -> weapon level (1-based)
    weaponLevel: { Forest: 1, Water: 0, Fire: 0, Ice: 0 },
    weaponFound: { Forest: true, Water: false, Fire: false, Ice: false },
    // realmId -> true once the "I can use my [weapon] here!" first-entry
    // dialogue has been shown for that realm (shown once, ever)
    weaponIntroSeen: {},
    fifthRealmUnlocked: false,

    // ------------------------------------------------------------------
    // COMBAT REALM — separate progression layer. See combat_realm_design.md.
    // Never touches Hero Level, World/Realm progression, or the main-game
    // weapon levels above; only reads them.
    // ------------------------------------------------------------------
    combat: {
      energy: 0,
      combatXp: 0,
      // levels spent per attribute (0..levelsToMax) — see combatData.js
      attributeLevels: { attackSpeed: 0, attack: 0, vitality: 0, defence: 0 },
      monsterProgress: 1, // highest monster unlocked (1-20); earlier ones stay fightable
      bossesDefeated: {}, // monster id (17-20) -> true
      fremantium: 0,
      ownedItems: {}, // shop item id -> true
      firstEntrySeen: false,
      // "Forest:World 1:A1" -> hour-bucket (see currentHourBucket()) of the
      // last time CLEARING this stage awarded Energy. Limits Energy-farming
      // via repeatedly replaying an already-mastered stage. Failed attempts
      // with 8+ correct are NOT limited by this — see awardEnergyForAttempt().
      energyClearHour: {}
    }
  };
}

// The logged-in hero's account info. Set by login()/createAccount() in
// backend.js. Kept separate from STATE (which is just world/stage/weapon
// progress) so the two concerns don't tangle.
let HERO = null; // { username, heroName, hasPlayedBefore }

let STATE = null;

// Local cache key is per-username so multiple heroes on the same iPad don't
// clobber each other while the network save round-trips.
function localCacheKey(username) {
  return SAVE_KEY_PREFIX + username.toLowerCase();
}

// Load progress for the given username. Tries the backend first (source of
// truth); falls back to the local cache if offline, and to a fresh save if
// neither exists. Returns { state, isFirstPlay }.
async function loadStateForUser(username, remoteProgress) {
  let isFirstPlay = true;
  if (remoteProgress && typeof remoteProgress === "object" && Object.keys(remoteProgress).length) {
    STATE = remoteProgress;
    isFirstPlay = false;
  } else {
    try {
      const raw = localStorage.getItem(localCacheKey(username));
      if (raw) {
        STATE = JSON.parse(raw);
        isFirstPlay = false;
      }
    } catch (e) {
      console.warn("Could not read local cache.", e);
    }
  }
  if (!STATE) STATE = freshState();

  // backfill any newly-added fields for saves created by earlier versions
  const fresh = freshState();
  for (const k of Object.keys(fresh)) {
    if (!(k in STATE)) STATE[k] = fresh[k];
  }
  // combat is itself an object that gains fields over time (e.g. a save
  // made before the Combat Realm existed, or before a later attribute was
  // added) — backfill one level deep so older saves don't crash on missing
  // sub-fields.
  for (const k of Object.keys(fresh.combat)) {
    if (!(k in STATE.combat)) STATE.combat[k] = fresh.combat[k];
  }
  for (const k of Object.keys(fresh.combat.attributeLevels)) {
    if (!(k in STATE.combat.attributeLevels)) STATE.combat.attributeLevels[k] = 0;
  }
  cacheStateLocally(username);
  return { state: STATE, isFirstPlay };
}

function cacheStateLocally(username) {
  try {
    localStorage.setItem(localCacheKey(username), JSON.stringify(STATE));
  } catch (e) {
    console.warn("Could not cache progress locally.", e);
  }
}

// Persist STATE. Always updates the local cache immediately (instant, never
// fails); also pushes to the Apps Script backend in the background so the
// Google Sheet stays the source of truth across devices. Callers don't need
// to await this for the game to feel responsive.
function saveState() {
  if (!HERO || !HERO.username) return;
  cacheStateLocally(HERO.username);
  if (typeof pushProgressToBackend === "function") {
    pushProgressToBackend(HERO.username, STATE).catch(e => {
      console.warn("Background progress sync failed (will retry on next save):", e);
    });
  }
}

function resetState() {
  STATE = freshState();
  saveState();
}

// ----------------------------------------------------------------------------
// HERO LEVEL — derived purely from unique completed stage IDs. See
// hero_level_and_rank_progression.md: heroLevel = unique(completedStages).length
// ----------------------------------------------------------------------------
function getTotalStageCount() {
  let total = 0;
  for (const realm of GAME_DATA.realms) {
    for (const world of realm.worlds) total += world.stages.length;
  }
  return total || CONFIG.MAX_HERO_LEVEL_FALLBACK;
}

function getHeroLevel() {
  if (!STATE) return 0;
  const seen = new Set();
  for (const wk of Object.keys(STATE.completedStages)) {
    for (const stageId of Object.keys(STATE.completedStages[wk])) {
      if (STATE.completedStages[wk][stageId]) seen.add(stageId);
    }
  }
  return seen.size;
}

function worldKey(realmId, worldId) {
  return `${realmId}:${worldId}`;
}

function getRealm(realmId) {
  return GAME_DATA.realms.find(r => r.realmId === realmId);
}
function getWorld(realmId, worldId) {
  return getRealm(realmId).worlds.find(w => w.worldId === worldId);
}
function getStage(realmId, worldId, stageId) {
  return getWorld(realmId, worldId).stages.find(s => s.stageId === stageId);
}

function isRealmUnlocked(realmId) {
  return !!STATE.unlockedRealms[realmId];
}
function isRealmCompleted(realmId) {
  return !!STATE.completedRealms[realmId];
}
function isWorldUnlocked(realmId, worldId) {
  return !!STATE.unlockedWorlds[worldKey(realmId, worldId)];
}
function isWorldCompleted(realmId, worldId) {
  return !!STATE.completedWorlds[worldKey(realmId, worldId)];
}
function hasWorldKey(realmId, worldId) {
  return !!STATE.worldKeys[worldKey(realmId, worldId)];
}
function isStageCompleted(realmId, worldId, stageId) {
  const wk = worldKey(realmId, worldId);
  return !!(STATE.completedStages[wk] && STATE.completedStages[wk][stageId]);
}
function getWeaponLevel(realmId) {
  return STATE.weaponLevel[realmId] || 0;
}
function getWeaponDamage(realmId) {
  const lvl = getWeaponLevel(realmId);
  if (lvl <= 0) return 0;
  return CONFIG.BASE_WEAPON_DAMAGE + (lvl - 1) * CONFIG.DAMAGE_PER_LEVEL;
}
function getWeaponName(realmId) {
  return getRealm(realmId).weaponName;
}

// Call when a stage's boss is defeated and the player returns through the portal in time.
// Returns an object describing what happened, for the UI to show celebratory popups.
function completeStage(realmId, worldId, stageId) {
  const wk = worldKey(realmId, worldId);
  const result = { stageCompleted: true, worldCompleted: false, worldKeyCreated: false,
                    weaponLeveledUp: false, realmCompleted: false, orbAwarded: false,
                    nextWorldUnlocked: null, nextRealmUnlocked: null, fifthRealmUnlocked: false,
                    weaponDropped: false, droppedWeaponName: null, droppedWeaponFlavor: null };

  if (!STATE.completedStages[wk]) STATE.completedStages[wk] = {};
  STATE.completedStages[wk][stageId] = true;
  if (!STATE.shards[wk]) STATE.shards[wk] = {};
  STATE.shards[wk][stageId] = true;

  const world = getWorld(realmId, worldId);
  const allStagesDone = world.stages.every(s => STATE.completedStages[wk] && STATE.completedStages[wk][s.stageId]);

  if (allStagesDone && !STATE.completedWorlds[wk]) {
    STATE.completedWorlds[wk] = true;
    STATE.worldKeys[wk] = true;
    result.worldCompleted = true;
    result.worldKeyCreated = true;

    // Weapon levels up
    STATE.weaponLevel[realmId] = (STATE.weaponLevel[realmId] || 1) + 1;
    result.weaponLeveledUp = true;
    result.newWeaponDamage = getWeaponDamage(realmId);
    result.newWeaponLevel = STATE.weaponLevel[realmId];

    const realm = getRealm(realmId);
    const worldIndex = realm.worlds.findIndex(w => w.worldId === worldId);
    const isFirstWorld = worldIndex === 0;
    const isFinalWorld = worldIndex === realm.worlds.length - 1;

    // World 1 clear: the boss drops a weapon themed after THIS realm, which
    // (per the type-advantage chain) becomes the weapon equipped in the
    // NEXT realm. This is also what actually unlocks that next realm —
    // matches game_world_names_master.md ("Completing Forest World 1
    // unlocks Water", etc.), not realm completion.
    if (isFirstWorld) {
      const drop = CONFIG.WORLD1_BOSS_DROPS[realmId];
      if (drop) {
        result.weaponDropped = true;
        result.droppedWeaponName = drop.item;
        result.droppedWeaponFlavor = drop.flavor;
      }
      const nextRealmId = Object.keys(CONFIG.REALM_UNLOCK_AFTER).find(
        r => CONFIG.REALM_UNLOCK_AFTER[r] === realmId
      );
      if (nextRealmId && !STATE.unlockedRealms[nextRealmId]) {
        STATE.unlockedRealms[nextRealmId] = true;
        STATE.weaponFound[nextRealmId] = true;
        STATE.weaponLevel[nextRealmId] = 1;
        const firstWorldOfNext = getRealm(nextRealmId).worlds[0];
        STATE.unlockedWorlds[worldKey(nextRealmId, firstWorldOfNext.worldId)] = true;
        result.nextRealmUnlocked = nextRealmId;
      }
    }

    if (isFinalWorld) {
      // Realm complete -> orb (next realm no longer unlocks here — see above)
      STATE.completedRealms[realmId] = true;
      STATE.realmOrbs[realmId] = true;
      result.realmCompleted = true;
      result.orbAwarded = true;
      result.orbName = realm.orbName;

      // Check for fifth-realm portal
      const allOrbs = CONFIG.REALM_ORDER.every(r => STATE.realmOrbs[r]);
      if (allOrbs && !STATE.fifthRealmUnlocked) {
        STATE.fifthRealmUnlocked = true;
        result.fifthRealmUnlocked = true;
      }
    } else {
      // Unlock next world in this realm
      const nextWorld = realm.worlds[worldIndex + 1];
      STATE.unlockedWorlds[worldKey(realmId, nextWorld.worldId)] = true;
      result.nextWorldUnlocked = nextWorld.worldId;
    }
  }

  saveState();
  return result;
}

function worldProgress(realmId, worldId) {
  const world = getWorld(realmId, worldId);
  const wk = worldKey(realmId, worldId);
  const done = world.stages.filter(s => STATE.completedStages[wk] && STATE.completedStages[wk][s.stageId]).length;
  return { done, total: world.stages.length };
}

function realmProgress(realmId) {
  const realm = getRealm(realmId);
  const done = realm.worlds.filter(w => STATE.completedWorlds[worldKey(realmId, w.worldId)]).length;
  return { done, total: realm.worlds.length };
}

// ============================================================================
// COMBAT REALM — reads combatData.js (COMBAT_CONFIG, COMBAT_MONSTERS,
// SHOP_ITEMS, etc.) plus STATE.combat. See combat_realm_design.md.
// ============================================================================

// Unlocked once the player has cleared one world in each of the four realms.
function isCombatRealmUnlocked() {
  return CONFIG.REALM_ORDER.every(r => realmProgress(r).done >= 1);
}

// ---- Energy ----------------------------------------------------------------
// Dev/test account: username "123" gets unlimited Combat Realm Energy so the
// combat system can be tested without grinding fluency attempts first. Does
// not touch STATE.combat.energy itself, so nothing here affects real accounts
// or needs undoing later — just remove isUnlimitedEnergyAccount()'s special
// case when this test account is no longer needed.
function isUnlimitedEnergyAccount() {
  return !!(HERO && HERO.username && HERO.username.trim() === "123");
}

function getEnergy() {
  return isUnlimitedEnergyAccount() ? COMBAT_CONFIG.ENERGY_CAP : STATE.combat.energy;
}

function canAffordBattle() {
  return isUnlimitedEnergyAccount() || STATE.combat.energy >= COMBAT_CONFIG.ENERGY_COST_PER_BATTLE;
}
function spendEnergyForBattle() {
  if (isUnlimitedEnergyAccount()) return true; // never actually spent
  if (!canAffordBattle()) return false;
  STATE.combat.energy -= COMBAT_CONFIG.ENERGY_COST_PER_BATTLE;
  saveState();
  return true;
}
function stageEnergyKey(realmId, worldId, stageId) {
  return `${realmId}:${worldId}:${stageId}`;
}
// Whole-hour bucket (e.g. every clock hour is its own bucket) rather than a
// rolling "60 minutes since last time" — much simpler to store/compare, and
// it's still at most an hour's wait either way.
function currentHourBucket() {
  return Math.floor(Date.now() / 3600000);
}

// Called once per finished 60s fluency attempt (success OR fail) that passed
// the "genuine attempt" check in app.js. `stageKey` identifies the exact
// stage (see stageEnergyKey); `success` is whether the stage was cleared.
//
//   - Failed attempts (8+ correct before the portal closed) are UNLIMITED —
//     every genuine failed attempt earns Energy, no matter how many times
//     the player has tried that stage.
//   - Successful clears are limited to once per stage per hour, so a student
//     can't farm Energy by replaying a stage they've already mastered —
//     resets automatically every hour (see currentHourBucket()).
//
// Either way this is still capped by ENERGY_CAP overall. Returns true if
// Energy was actually gained.
function awardEnergyForAttempt(stageKey, success) {
  if (success) {
    const bucket = currentHourBucket();
    if (STATE.combat.energyClearHour[stageKey] === bucket) return false; // already claimed this hour
  }
  if (STATE.combat.energy >= COMBAT_CONFIG.ENERGY_CAP) return false;
  STATE.combat.energy = Math.min(COMBAT_CONFIG.ENERGY_CAP, STATE.combat.energy + 1);
  if (success) STATE.combat.energyClearHour[stageKey] = currentHourBucket();
  saveState();
  return true;
}

// ---- Combat level / attributes ---------------------------------------------
function getCombatLevel() {
  return combatLevelForXp(STATE.combat.combatXp);
}
function getCombatXpProgress() {
  const level = getCombatLevel();
  const xp = STATE.combat.combatXp;
  const atLevel = xpForCombatLevel(level);
  const next = level < COMBAT_CONFIG.MAX_COMBAT_LEVEL ? xpForCombatLevel(level + 1) : null;
  return { level, xp, atLevel, next, isMax: next === null };
}
function getAttributePointsAvailable() {
  const spent = Object.values(STATE.combat.attributeLevels).reduce((a, b) => a + b, 0);
  return Math.max(0, (getCombatLevel() - 1) - spent);
}
function getAttributeLevel(key) {
  return STATE.combat.attributeLevels[key] || 0;
}
function spendAttributePoint(key) {
  const def = COMBAT_CONFIG.ATTRIBUTES[key];
  if (!def) return false;
  if (getAttributePointsAvailable() <= 0) return false;
  if (getAttributeLevel(key) >= def.levelsToMax) return false;
  STATE.combat.attributeLevels[key]++;
  saveState();
  return true;
}
function resetAttributePoints() {
  STATE.combat.attributeLevels = { attackSpeed: 0, attack: 0, vitality: 0, defence: 0 };
  saveState();
}

// ---- Monster ladder ----------------------------------------------------------
function highestUnlockedMonster() { return STATE.combat.monsterProgress; }
function isMonsterUnlocked(id) { return id <= STATE.combat.monsterProgress; }
function allFinalBossesDefeated() {
  return COMBAT_MONSTERS.filter(m => m.isFinalBoss).every(m => STATE.combat.bossesDefeated[m.id]);
}

// Call after a battle is won. Awards XP/Fremantium, unlocks the next monster
// (only if this was the current frontier monster), tracks final-boss
// defeats, and reports whether the Epic shop tier just unlocked.
function recordMonsterVictory(monsterId) {
  const monster = getCombatMonster(monsterId);
  if (!monster) return null;

  const beforeLevel = getCombatLevel();
  const beforeAllBosses = allFinalBossesDefeated();

  STATE.combat.combatXp += monster.xpReward;
  STATE.combat.fremantium += monster.fremantiumReward;
  if (monster.isFinalBoss) STATE.combat.bossesDefeated[monsterId] = true;

  let nextUnlocked = null;
  if (monsterId === STATE.combat.monsterProgress && monsterId < COMBAT_CONFIG.MONSTER_COUNT) {
    STATE.combat.monsterProgress = monsterId + 1;
    nextUnlocked = STATE.combat.monsterProgress;
  }

  const afterLevel = getCombatLevel();
  const afterAllBosses = allFinalBossesDefeated();

  saveState();
  return {
    xpGained: monster.xpReward,
    fremantiumGained: monster.fremantiumReward,
    leveledUp: afterLevel > beforeLevel,
    combatLevelBefore: beforeLevel,
    combatLevelAfter: afterLevel,
    attributePointsGained: afterLevel - beforeLevel,
    nextUnlocked,
    epicJustUnlocked: afterAllBosses && !beforeAllBosses
  };
}

// ---- Shop --------------------------------------------------------------------
function isEpicUnlocked() { return allFinalBossesDefeated(); }
function ownsItem(itemId) { return !!STATE.combat.ownedItems[itemId]; }

function canPurchaseItem(itemId) {
  const item = findShopItem(itemId);
  if (!item) return { ok: false, reason: "Item not found." };
  if (ownsItem(itemId)) return { ok: false, reason: "You already own this." };
  if (item.mystery && !isEpicUnlocked()) {
    return { ok: false, reason: "Defeat all four Realm Bosses in the Combat Realm to reveal this item." };
  }
  const price = shopItemPrice(item);
  if (STATE.combat.fremantium < price) return { ok: false, reason: "Not enough Fremantium." };
  return { ok: true, price };
}
function purchaseItem(itemId) {
  const check = canPurchaseItem(itemId);
  if (!check.ok) return check;
  STATE.combat.fremantium -= check.price;
  STATE.combat.ownedItems[itemId] = true;
  saveState();
  return { ok: true, price: check.price };
}
function sellItem(itemId) {
  if (!ownsItem(itemId)) return { ok: false, reason: "You don't own this." };
  const item = findShopItem(itemId);
  const refund = Math.round(shopItemPrice(item) * 0.5);
  delete STATE.combat.ownedItems[itemId];
  STATE.combat.fremantium += refund;
  saveState();
  return { ok: true, refund };
}
function ownedPets() { return SHOP_ITEMS.pets.filter(i => ownsItem(i.id)); }
function ownedTrophies() { return SHOP_ITEMS.trophies.filter(i => ownsItem(i.id)); }

// ---- Weapons available for combat (any weapon the player has found, used
// freely regardless of which realm it's "at home" in — a deliberate
// Combat-Realm-only exception to the main game's realm-locked weapon rule) --
function ownedCombatWeapons() {
  return CONFIG.REALM_ORDER
    .filter(realmId => getWeaponLevel(realmId) > 0)
    .map(realmId => ({
      realmId, // also doubles as the weapon's element for the type chart
      name: getWeaponName(realmId),
      level: getWeaponLevel(realmId),
      damage: getWeaponDamage(realmId)
    }));
}
