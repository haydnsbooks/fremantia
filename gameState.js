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
    fifthRealmUnlocked: false
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
