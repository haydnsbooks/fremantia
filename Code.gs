/**
 * FREMANTIA — Apps Script backend
 * ----------------------------------------------------------------------
 * Bind this script to a Google Sheet (Extensions > Apps Script from inside
 * the Sheet). It creates/uses a sheet tab called "Accounts" and exposes a
 * single POST endpoint that the game's backend.js talks to.
 *
 * Columns in "Accounts":
 *   A: username        (unique, stored lowercase for lookup)
 *   B: displayUsername (as typed, for showing back to the player)
 *   C: heroName
 *   D: passwordHash     (SHA-256 of "fremantia::username::password" — never plaintext)
 *   E: heroLevel        (cached number, kept in sync so the leaderboard is a cheap read)
 *   F: progressJson     (STATE object, JSON-stringified)
 *   G: createdAt         (ISO timestamp)
 *   H: lastSavedAt        (ISO timestamp)
 *
 * See SETUP.md for deployment steps.
 */

const SHEET_NAME = "Accounts";
const HEADERS = ["username", "displayUsername", "heroName", "passwordHash", "heroLevel", "progressJson", "createdAt", "lastSavedAt"];

const PROMOTIONS_SHEET_NAME = "RankPromotions";
const PROMOTIONS_HEADERS = ["timestamp", "username", "heroName", "rankNumber", "rankName"];

// Mirrors HERO_RANKS in config.js exactly — see
// hero_level_and_rank_progression.md. Kept in sync manually since Apps
// Script can't share a module with the front end.
const RANK_LEVELS_ = [
  { level: 0,   rankNumber: 0,  name: "Unranked" },
  { level: 10,  rankNumber: 1,  name: "Trailblazer" },
  { level: 20,  rankNumber: 2,  name: "Pathfinder" },
  { level: 30,  rankNumber: 3,  name: "Beast Hunter" },
  { level: 40,  rankNumber: 4,  name: "Realm Guardian" },
  { level: 50,  rankNumber: 5,  name: "Storm Knight" },
  { level: 60,  rankNumber: 6,  name: "Flame Warden" },
  { level: 70,  rankNumber: 7,  name: "Frost Champion" },
  { level: 80,  rankNumber: 8,  name: "Arcane Vanguard" },
  { level: 90,  rankNumber: 9,  name: "Mythic Warrior" },
  { level: 100, rankNumber: 10, name: "Dragon Slayer" },
  { level: 110, rankNumber: 11, name: "Realm Conqueror" },
  { level: 120, rankNumber: 12, name: "Worldbreaker" },
  { level: 130, rankNumber: 13, name: "Starforged" },
  { level: 140, rankNumber: 14, name: "Eternal Champion" },
  { level: 150, rankNumber: 15, name: "Ascendant" },
  { level: 160, rankNumber: 16, name: "Mythic Legend" },
  { level: 170, rankNumber: 17, name: "Fremantia Legend" }
];

// Mirrors CONFIG.BASE_WEAPON_DAMAGE / CONFIG.DAMAGE_PER_LEVEL / CONFIG.REALM_ORDER
// in config.js — kept in sync manually, same as RANK_LEVELS_ above.
const WEAPON_BASE_DAMAGE_ = 10;
const WEAPON_DAMAGE_PER_LEVEL_ = 5;
const REALM_ORDER_ = ["Forest", "Water", "Fire", "Ice"];

function rankForLevel_(level) {
  let current = RANK_LEVELS_[0];
  for (const r of RANK_LEVELS_) {
    if (level >= r.level) current = r;
    else break;
  }
  return current;
}

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(HEADERS);
  }
  return sheet;
}

function getPromotionsSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(PROMOTIONS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(PROMOTIONS_SHEET_NAME);
    sheet.appendRow(PROMOTIONS_HEADERS);
  }
  return sheet;
}

function findRowByUsername_(sheet, usernameLower) {
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]).toLowerCase() === usernameLower) {
      return { rowIndex: i + 1, row: data[i] }; // rowIndex is 1-based sheet row
    }
  }
  return null;
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ ok: false, error: "Malformed request body." });
  }

  const action = body.action;
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    switch (action) {
      case "createAccount":
        return jsonResponse_(createAccount_(body));
      case "login":
        return jsonResponse_(login_(body));
      case "saveProgress":
        return jsonResponse_(saveProgress_(body));
      case "getHighScores":
        return jsonResponse_(getHighScores_());
      case "getRankPromotions":
        return jsonResponse_(getRankPromotions_());
      default:
        return jsonResponse_({ ok: false, error: "Unknown action: " + action });
    }
  } catch (err) {
    return jsonResponse_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function createAccount_(body) {
  const username = String(body.username || "").trim();
  const usernameLower = username.toLowerCase();
  if (!username || !body.passwordHash) {
    return { ok: false, error: "Username and password are required." };
  }
  const sheet = getSheet_();
  if (findRowByUsername_(sheet, usernameLower)) {
    return { ok: false, error: "That username is already taken. Please choose another." };
  }
  const now = new Date().toISOString();
  sheet.appendRow([usernameLower, username, body.heroName || username, body.passwordHash, 0, "{}", now, now]);
  return { ok: true, username: usernameLower, heroName: body.heroName || username, progress: {}, hasPlayedBefore: false };
}

function login_(body) {
  const usernameLower = String(body.username || "").trim().toLowerCase();
  const sheet = getSheet_();
  const found = findRowByUsername_(sheet, usernameLower);
  if (!found) {
    return { ok: false, error: "No account found with that username." };
  }
  const row = found.row;
  if (String(row[3]) !== String(body.passwordHash)) {
    return { ok: false, error: "Incorrect password." };
  }
  let progress = {};
  try { progress = JSON.parse(row[5] || "{}"); } catch (e) { progress = {}; }
  const hasPlayedBefore = !!(progress && Object.keys(progress).length);
  return { ok: true, username: usernameLower, heroName: row[2] || row[1], progress, hasPlayedBefore };
}

function saveProgress_(body) {
  const usernameLower = String(body.username || "").trim().toLowerCase();
  const sheet = getSheet_();
  const found = findRowByUsername_(sheet, usernameLower);
  if (!found) {
    return { ok: false, error: "No account found with that username." };
  }
  const now = new Date().toISOString();
  const progressJson = JSON.stringify(body.progress || {});
  const heroLevel = Number(body.heroLevel || 0);
  const oldHeroLevel = Number(found.row[4] || 0);
  const heroName = found.row[2] || found.row[1];

  sheet.getRange(found.rowIndex, 5).setValue(heroLevel);       // heroLevel
  sheet.getRange(found.rowIndex, 6).setValue(progressJson);    // progressJson
  sheet.getRange(found.rowIndex, 8).setValue(now);             // lastSavedAt

  const oldRank = rankForLevel_(oldHeroLevel);
  const newRank = rankForLevel_(heroLevel);
  if (newRank.rankNumber > oldRank.rankNumber) {
    getPromotionsSheet_().appendRow([now, usernameLower, heroName, newRank.rankNumber, newRank.name]);
  }

  return { ok: true };
}

// Returns { ok, promotions: [{ heroName, rankNumber, rankName, timestamp }, ...] },
// one entry per player (their single most recent promotion only — a player
// who has promoted several times shouldn't clutter the board with their own
// older entries), sorted most-recent first and capped to 50. This is what
// makes a new promotion jump straight to the top and stay there until a
// *different* player earns a new rank.
function getRankPromotions_() {
  const sheet = getPromotionsSheet_();
  const data = sheet.getDataRange().getValues();
  const latestByUser = {};
  for (let i = 1; i < data.length; i++) {
    const usernameLower = String(data[i][1] || "").toLowerCase();
    const promo = {
      timestamp: data[i][0],
      heroName: data[i][2],
      rankNumber: Number(data[i][3] || 0),
      rankName: data[i][4]
    };
    const existing = latestByUser[usernameLower];
    if (!existing || new Date(promo.timestamp) > new Date(existing.timestamp)) {
      latestByUser[usernameLower] = promo;
    }
  }
  const promotions = Object.keys(latestByUser).map(k => latestByUser[k]);
  promotions.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return { ok: true, promotions: promotions.slice(0, 50) };
}

// Returns { ok,
//   scores: [{ heroName, heroLevel }, ...] (highest first, capped to 50),
//   promotions: see getRankPromotions_,
//   weaponLeaderboards: { Forest: [{ heroName, level, damage }, ...], Water: [...],
//     Fire: [...], Ice: [...] } — each sorted strongest (highest damage) first,
//     capped to 20. Built from every account's saved weaponLevel progress, so
//     it reflects the strongest player of each realm's weapon across everyone
//     who has ever played.
// }
function getHighScores_() {
  const sheet = getSheet_();
  const data = sheet.getDataRange().getValues();
  const scores = [];
  const weaponRows = {};
  REALM_ORDER_.forEach(r => weaponRows[r] = []);

  for (let i = 1; i < data.length; i++) {
    const heroName = data[i][2] || data[i][1];
    scores.push({
      heroName: heroName,
      heroLevel: Number(data[i][4] || 0)
    });

    let progress = {};
    try { progress = JSON.parse(data[i][5] || "{}"); } catch (e) { progress = {}; }
    const weaponLevel = (progress && progress.weaponLevel) || {};
    REALM_ORDER_.forEach(realmId => {
      const lvl = Number(weaponLevel[realmId] || 0);
      if (lvl > 0) {
        weaponRows[realmId].push({
          heroName: heroName,
          level: lvl,
          damage: WEAPON_BASE_DAMAGE_ + (lvl - 1) * WEAPON_DAMAGE_PER_LEVEL_
        });
      }
    });
  }

  scores.sort((a, b) => b.heroLevel - a.heroLevel);

  const weaponLeaderboards = {};
  REALM_ORDER_.forEach(realmId => {
    weaponRows[realmId].sort((a, b) => b.damage - a.damage);
    weaponLeaderboards[realmId] = weaponRows[realmId].slice(0, 20);
  });

  return {
    ok: true,
    scores: scores.slice(0, 50),
    promotions: getRankPromotions_().promotions,
    weaponLeaderboards: weaponLeaderboards
  };
}
