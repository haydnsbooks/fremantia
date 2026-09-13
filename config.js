// ============================================================================
// CONFIG — game-wide constants. Kept separate from progression/naming data.
// ============================================================================

const CONFIG = {
  PORTAL_SECONDS: 60,
  BASE_WEAPON_DAMAGE: 10,
  DAMAGE_PER_LEVEL: 5,
  HITS_REQUIRED: [1, 2, 3, 4, 5], // enemy1, enemy2, enemy3, enemy4, boss — 15 correct answers per world
  REALM_ORDER: ["Forest", "Water", "Fire", "Ice"],
  REALM_ENV_LABEL: {
    Forest: "Forest",
    Water: "Water / Aquatic",
    Fire: "Fire / Volcanic",
    Ice: "Ice / Frozen"
  },
  // Unlock rule: completing World 1 of realm[n] unlocks realm[n+1]
  REALM_UNLOCK_AFTER: {
    Forest: null,   // available from the start
    Water: "Forest",
    Fire: "Water",
    Ice: "Fire"
  },

  // Boss drops when a realm's WORLD 1 is cleared. Each item is themed after
  // the realm it drops in, and — following the type-advantage chain
  // (grass beats water, water beats fire, fire melts ice) — is equipped in
  // the NEXT realm (see REALM_UNLOCK_AFTER). Must match that realm's
  // `weaponName` in GAME_DATA. Names are sourced from
  // game_world_names_master.md — do not invent replacements here.
  // Ice's drop (Frostfang) isn't equipped anywhere yet — reserved for a
  // future realm — but the boss still drops it narratively.
  WORLD1_BOSS_DROPS: {
    Forest: { item: "Verdant Blade", flavor: "A blade grown from living forest wood." },
    Water:  { item: "Tidecaller",    flavor: "A weapon that channels the pull of the tides." },
    Fire:   { item: "Emberblade",    flavor: "A blade that burns with a low, steady flame." },
    Ice:    { item: "Frostfang",     flavor: "A blade so cold it seems to bite on its own." }
  },

  // -------------------------------------------------------------------------
  // Apps Script backend — paste the deployed Web App URL here (see
  // apps-script/Code.gs and apps-script/SETUP.md for how to create it).
  // -------------------------------------------------------------------------
  BACKEND_URL: "https://script.google.com/macros/s/AKfycby1roZaBtXNf7tl0T_FiIw6BMrwRBdDx35-NCrcVRgdRX5AMhtFIKiQSVSNMkkekyqx_w/exec",

  // Total number of unique stages in the game — the max Hero Level.
  // Derived at runtime from GAME_DATA so this never has to be hand-maintained,
  // but kept here as a documented fallback.
  MAX_HERO_LEVEL_FALLBACK: 170
};

// ----------------------------------------------------------------------------
// HERO RANKS — from hero_level_and_rank_progression.md. A new rank every 10
// Hero Levels. Rank names are player-facing and can be edited freely; the
// level thresholds and progression logic must not change without updating
// the reference file.
// ----------------------------------------------------------------------------
const HERO_RANKS = [
  { level: 0,   rankNumber: 0,  name: "Unranked",        description: "Beginning the journey" },
  { level: 10,  rankNumber: 1,  name: "Trailblazer",     description: "The hero has proven they can conquer the first challenges." },
  { level: 20,  rankNumber: 2,  name: "Pathfinder",      description: "The hero is confidently finding their way through Fremantia." },
  { level: 30,  rankNumber: 3,  name: "Beast Hunter",    description: "The hero has defeated a serious number of monsters." },
  { level: 40,  rankNumber: 4,  name: "Realm Guardian",  description: "The hero has begun to earn the respect of the realms." },
  { level: 50,  rankNumber: 5,  name: "Storm Knight",    description: "The hero has become a formidable warrior." },
  { level: 60,  rankNumber: 6,  name: "Flame Warden",    description: "The hero's power is becoming legendary." },
  { level: 70,  rankNumber: 7,  name: "Frost Champion",  description: "The hero has mastered increasingly difficult challenges." },
  { level: 80,  rankNumber: 8,  name: "Arcane Vanguard", description: "The hero stands among Fremantia's elite warriors." },
  { level: 90,  rankNumber: 9,  name: "Mythic Warrior",  description: "The hero has reached a truly legendary level." },
  { level: 100, rankNumber: 10, name: "Dragon Slayer",   description: "The hero has crossed into the realm of great legends." },
  { level: 110, rankNumber: 11, name: "Realm Conqueror", description: "Entire realms are no longer beyond the hero's reach." },
  { level: 120, rankNumber: 12, name: "Worldbreaker",    description: "The hero has become powerful enough to challenge the greatest worlds." },
  { level: 130, rankNumber: 13, name: "Starforged",      description: "The hero has been forged by an extraordinary journey." },
  { level: 140, rankNumber: 14, name: "Eternal Champion",description: "The hero has achieved a level few could ever reach." },
  { level: 150, rankNumber: 15, name: "Ascendant",       description: "The hero has risen beyond ordinary champions." },
  { level: 160, rankNumber: 16, name: "Mythic Legend",   description: "The hero is approaching the absolute peak of Fremantia." },
  { level: 170, rankNumber: 17, name: "Fremantia Legend",description: "The ultimate rank. Every stage in every realm has been defeated." }
];

function getHeroRank(heroLevel) {
  let current = HERO_RANKS[0];
  for (const r of HERO_RANKS) {
    if (heroLevel >= r.level) current = r;
    else break;
  }
  return current;
}
