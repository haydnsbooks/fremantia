// ============================================================================
// BACKEND — talks to the Google Apps Script web app backed by a Google Sheet.
// This is the only file that knows about the network. Everything else in the
// game just calls these functions and gets plain JS objects back.
//
// See /apps-script/Code.gs for the server-side script and
// /apps-script/SETUP.md for how to deploy it and paste the URL into config.js.
// ============================================================================

// ---- password hashing (client-side) ---------------------------------------
// We never want a plaintext password to leave the device or sit in the
// spreadsheet. This hashes username+password with SHA-256 before it's ever
// sent over the network. It's a lightweight prototype-grade protection (no
// per-user salt/pepper), not bank-grade security — good enough so the sheet
// never contains a readable password, but the Apps Script URL and sheet
// should still be treated as sensitive.
async function hashPassword(username, password) {
  const enc = new TextEncoder();
  const data = enc.encode(`fremantia::${username.trim().toLowerCase()}::${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function backendConfigured() {
  return !!(CONFIG.BACKEND_URL && !CONFIG.BACKEND_URL.startsWith("PASTE_"));
}

async function callBackend(action, payload) {
  if (!backendConfigured()) {
    throw new Error("BACKEND_NOT_CONFIGURED");
  }
  const res = await fetch(CONFIG.BACKEND_URL, {
    method: "POST",
    // Apps Script web apps choke on a real preflight; text/plain keeps this a
    // "simple request" so no CORS preflight is needed.
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  const json = await res.json();
  if (!json.ok) throw new Error(json.error || "Unknown backend error");
  return json;
}

// Returns { ok, username, heroName, progress, hasPlayedBefore }
async function apiCreateAccount(username, password, heroName) {
  const passwordHash = await hashPassword(username, password);
  return callBackend("createAccount", { username, passwordHash, heroName: heroName || username });
}

// Returns { ok, username, heroName, progress, hasPlayedBefore }
async function apiLogin(username, password) {
  const passwordHash = await hashPassword(username, password);
  return callBackend("login", { username, passwordHash });
}

// Fire-and-forget progress sync. Never throws to the caller's caller — errors
// are logged, and the local cache (see gameState.js) means nothing is lost.
async function pushProgressToBackend(username, state) {
  if (!backendConfigured()) return; // silently no-op if not set up yet
  const heroLevel = getHeroLevel();
  return callBackend("saveProgress", { username, progress: state, heroLevel });
}

// Returns { ok,
//   scores: [{ heroName, heroLevel }, ...],
//   promotions: [{ heroName, rankName, rankNumber, timestamp }, ...] (one entry per
//     player — their most recent promotion — newest first),
//   weaponLeaderboards: { Forest: [{ heroName, level, damage }, ...], Water: [...],
//     Fire: [...], Ice: [...] } (each sorted strongest first)
// }
async function apiGetHighScores() {
  if (!backendConfigured()) return { ok: true, scores: [], promotions: [], weaponLeaderboards: {} };
  return callBackend("getHighScores", {});
}
