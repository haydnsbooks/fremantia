// ============================================================================
// APP — screen rendering & the battle loop. Reads GAME_DATA (math+naming),
// CONFIG (constants) and GAME STATE (progression) but never hard-codes any
// realm/world/stage content itself.
// ============================================================================

const REALM_EMOJI = {
  Forest: { enemy: ["🍄", "🐛", "🦔", "🌿"], boss: "🌳" },
  Water:  { enemy: ["🐚", "🐡", "🦑", "🌊"], boss: "🐙" },
  Fire:   { enemy: ["🔥", "🦂", "🕷️", "☄️"], boss: "🐲" },
  Ice:    { enemy: ["❄️", "🧊", "🦉", "🌨️"], boss: "🐺" }
};
const REALM_ICON = { Forest: "🌲", Water: "🌊", Fire: "🔥", Ice: "❄️" };

let nav = { realmId: null, worldId: null };
let battle = null; // active battle state

function el(id) { return document.getElementById(id); }
function showScreen(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  el(id).classList.add("active");
}

// ---------------------------------------------------------------------------
// GENERIC MODAL DIALOG (used for account creation, welcome messages, confirms)
// ---------------------------------------------------------------------------
function showDialog({ icon = "✨", title, body, buttons }) {
  return new Promise(resolve => {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-card">
        <div class="modal-icon">${icon}</div>
        <div class="modal-title">${title}</div>
        <div class="modal-body">${body}</div>
        <div class="btn-row" id="dialog-btn-row"></div>
      </div>`;
    const row = overlay.querySelector("#dialog-btn-row");
    let cleanup = () => {};
    (buttons || [{ label: "Continue", value: true, primary: true }]).forEach(b => {
      const btn = document.createElement("button");
      btn.className = "btn" + (b.primary ? " big" : " secondary");
      btn.textContent = b.label;
      btn.addEventListener("click", () => {
        cleanup();
        overlay.remove();
        resolve(b.value);
      });
      row.appendChild(btn);
    });
    document.body.appendChild(overlay);
    cleanup = enableOverlayKeyboardNav(overlay);
  });
}

// ---------------------------------------------------------------------------
// GENERIC OVERLAY KEYBOARD NAV — lets arrow keys move between an overlay's
// buttons and Enter activate whichever one is focused. Used by every modal
// pop up (showDialog, showNextModal, the nav sheet) so keyboard/iPad-keyboard
// users never need a mouse to get through a dialog. Returns a cleanup
// function the caller must invoke when the overlay closes.
// ---------------------------------------------------------------------------
function enableOverlayKeyboardNav(overlay) {
  const buttons = Array.from(overlay.querySelectorAll("button"));
  if (!buttons.length) return () => {};

  let idx = Math.max(0, buttons.findIndex(b => b.classList.contains("big")));
  buttons[idx].focus();

  const focusHandlers = buttons.map((b, i) => {
    const handler = () => { idx = i; };
    b.addEventListener("focus", handler);
    return handler;
  });

  function onKey(e) {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") {
      e.preventDefault();
      idx = (idx + 1) % buttons.length;
      buttons[idx].focus();
    } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
      e.preventDefault();
      idx = (idx - 1 + buttons.length) % buttons.length;
      buttons[idx].focus();
    } else if (e.key === "Enter") {
      e.preventDefault();
      buttons[idx].click();
    }
  }
  document.addEventListener("keydown", onKey);

  return function cleanup() {
    document.removeEventListener("keydown", onKey);
    buttons.forEach((b, i) => b.removeEventListener("focus", focusHandlers[i]));
  };
}

function mmSetError(msg) {
  const box = el("mm-error");
  if (!msg) { box.style.display = "none"; box.textContent = ""; return; }
  box.style.display = "block";
  box.textContent = msg;
}

// ---------------------------------------------------------------------------
// MAIN MENU
// ---------------------------------------------------------------------------
function initMainMenu() {
  el("create-account-btn").addEventListener("click", handleCreateAccount);
  el("login-btn").addEventListener("click", handleLogin);
}

// Guards against a double-tap on iPad firing handleLogin/handleCreateAccount
// twice concurrently, which was the source of the welcome dialog appearing
// twice on first login.
let authInFlight = false;

function setAuthButtonsDisabled(disabled) {
  el("login-btn").disabled = disabled;
  el("create-account-btn").disabled = disabled;
}

async function handleCreateAccount() {
  if (authInFlight) return;
  mmSetError("");
  const username = el("mm-username").value.trim();
  const password = el("mm-password").value;
  if (!username || !password) {
    mmSetError("Please enter a username and password first.");
    return;
  }

  authInFlight = true;
  setAuthButtonsDisabled(true);
  try {
    const confirmed = await showDialog({
      icon: "📝",
      title: "Remember Your Details!",
      body: `You're creating the account <b>${username}</b>.<br><br>
             Please choose a username and password you'll remember — and it's a great idea to <b>write them down somewhere safe</b> (like a notebook or with a parent/teacher).<br><br>
             There's no way to recover a lost password, so keep it somewhere safe!`,
      buttons: [
        { label: "Go Back", value: false },
        { label: "I've Written It Down — Create Account!", value: true, primary: true }
      ]
    });
    if (!confirmed) return;

    const result = await apiCreateAccount(username, password);
    await onAuthSuccess(result);
  } catch (e) {
    mmSetError(e.message === "BACKEND_NOT_CONFIGURED"
      ? "The game's save system isn't set up yet — ask your teacher to finish the backend setup."
      : (e.message || "Could not create account. Please try again."));
  } finally {
    authInFlight = false;
    setAuthButtonsDisabled(false);
  }
}

async function handleLogin() {
  if (authInFlight) return;
  mmSetError("");
  const username = el("mm-username").value.trim();
  const password = el("mm-password").value;
  if (!username || !password) {
    mmSetError("Please enter your username and password.");
    return;
  }
  authInFlight = true;
  setAuthButtonsDisabled(true);
  try {
    const result = await apiLogin(username, password);
    await onAuthSuccess(result);
  } catch (e) {
    mmSetError(e.message === "BACKEND_NOT_CONFIGURED"
      ? "The game's save system isn't set up yet — ask your teacher to finish the backend setup."
      : (e.message || "Could not log in. Please check your username and password."));
  } finally {
    authInFlight = false;
    setAuthButtonsDisabled(false);
  }
}

// Extra idempotency guard: even if something ever calls onAuthSuccess twice
// concurrently, only one welcome dialog can be open at a time.
let welcomeDialogOpen = false;

async function onAuthSuccess(result) {
  HERO = { username: result.username, heroName: result.heroName };
  await loadStateForUser(result.username, result.progress);
  document.body.classList.add("has-hero-header");
  el("hero-header").style.display = "flex";
  updateHeroHeader();

  showScreen("screen-fremantia");
  renderFremantia();

  if (welcomeDialogOpen) return;
  welcomeDialogOpen = true;
  try {
    if (!result.hasPlayedBefore) {
      await showDialog({
        icon: "🌟",
        title: "Welcome to Fremantia!",
        body: `The four realms of Fremantia — Forest, Water, Fire and Ice — have been overtaken by monsters!<br><br>
               Fremantia needs a hero. <b>Your</b> help is needed to save the lands.<br><br>
               The <b>Ding Dong Spirit</b> has gifted you a <b>Steel Sword</b> to begin your quest.<br><br>
               Enter the <b>Forest Realm</b> to begin your adventure!`,
        buttons: [{ label: "Begin My Adventure!", value: true, primary: true }]
      });
    } else {
      await showDialog({
        icon: "👋",
        title: `Welcome back, ${HERO.heroName}!`,
        body: "Fremantia has missed you. Good luck out there, hero!",
        buttons: [{ label: "Continue", value: true, primary: true }]
      });
    }
  } finally {
    welcomeDialogOpen = false;
  }
}

function updateHeroHeader() {
  if (!HERO) return;
  const level = getHeroLevel();
  const rank = getHeroRank(level);
  const total = getTotalStageCount();
  el("hero-header-name").textContent = HERO.heroName;
  el("hero-header-level").textContent = `HERO LEVEL ${level}` + (level >= total ? " · MAX" : "");
  el("hero-header-rank").textContent = rank.name;
}

async function showRankInfoDialog() {
  const level = getHeroLevel();
  const rank = getHeroRank(level);
  await showDialog({
    icon: "🏅",
    title: rank.name,
    body: rank.description,
    buttons: [{ label: "Close", value: true, primary: true }]
  });
}

// ---------------------------------------------------------------------------
// HEADER DROPDOWNS — weapons attained, the player's account menu, and travel.
// Each dropdown opens directly below the button that triggered it (rather
// than pinned to a side of the screen) and supports ↑/↓ + Enter keyboard
// navigation for any selectable buttons it contains, matching every other
// pop up in the game.
// ---------------------------------------------------------------------------
let headerDropdownCleanup = null;

function closeHeaderDropdowns() {
  el("weapons-dropdown").style.display = "none";
  el("player-dropdown").style.display = "none";
  el("travel-dropdown").style.display = "none";
  if (headerDropdownCleanup) { headerDropdownCleanup(); headerDropdownCleanup = null; }
}

// Positions a header dropdown directly below its anchor button, keeping it
// on-screen horizontally (important on narrow iPad/phone widths).
function positionHeaderDropdown(dd, anchorBtn) {
  const rect = anchorBtn.getBoundingClientRect();
  const margin = 10;
  const maxWidth = Math.min(280, window.innerWidth - margin * 2);
  let left = rect.left;
  if (left + maxWidth > window.innerWidth - margin) left = window.innerWidth - margin - maxWidth;
  if (left < margin) left = margin;
  dd.style.left = `${left}px`;
  dd.style.top = `${rect.bottom + 6}px`;
}

// Generic open/toggle for a header dropdown. `fillFn(dd)` is responsible for
// populating dd.innerHTML (and wiring up any button click handlers) before
// it's shown.
function openHeaderDropdown(dd, anchorBtn, fillFn) {
  const opening = dd.style.display === "none" || !dd.style.display;
  closeHeaderDropdowns();
  if (!opening) return;
  fillFn(dd);
  positionHeaderDropdown(dd, anchorBtn);
  dd.style.display = "block";
  headerDropdownCleanup = enableOverlayKeyboardNav(dd);
}

function fillWeaponsDropdown(dd) {
  dd.innerHTML = "";
  CONFIG.REALM_ORDER.forEach(realmId => {
    const lvl = getWeaponLevel(realmId);
    if (lvl <= 0) return; // not found yet — don't reveal it
    const dmg = getWeaponDamage(realmId);
    const row = document.createElement("div");
    row.className = "weapon-dropdown-row";
    row.innerHTML = `<span>⚔️ ${getWeaponName(realmId)}</span><span>Lv ${lvl} · ${dmg} dmg</span>`;
    dd.appendChild(row);
  });
  if (!dd.children.length) {
    dd.innerHTML = `<div class="weapon-dropdown-row">No weapons found yet.</div>`;
  }
}

function fillPlayerDropdown(dd) {
  dd.innerHTML = `<button class="btn secondary" id="sign-out-btn">Sign Out</button>`;
  dd.querySelector("#sign-out-btn").addEventListener("click", () => {
    closeHeaderDropdowns();
    guardedNavigate(signOut);
  });
}

// Same destinations the old full-screen nav sheet offered, now rendered as
// a dropdown anchored to the Travel button.
function fillTravelDropdown(dd) {
  dd.innerHTML = `
    <button class="btn" id="nav-fremantia">🏰 Back to Fremantia</button>
    ${nav.realmId ? `<button class="btn secondary" id="nav-realm">${REALM_ICON[nav.realmId]} Back to ${nav.realmId} Realm</button>` : ""}
    ${nav.worldId ? `<button class="btn secondary" id="nav-world">🌀 Back to Current World</button>` : ""}
  `;
  dd.querySelector("#nav-fremantia").addEventListener("click", () => {
    closeHeaderDropdowns();
    renderFremantia(); showScreen("screen-fremantia");
  });
  const navRealm = dd.querySelector("#nav-realm");
  if (navRealm) navRealm.addEventListener("click", () => {
    closeHeaderDropdowns();
    renderRealmScreen(); showScreen("screen-realm");
  });
  const navWorld = dd.querySelector("#nav-world");
  if (navWorld) navWorld.addEventListener("click", () => {
    closeHeaderDropdowns();
    renderWorldScreen(); showScreen("screen-world");
  });
}

// ---------------------------------------------------------------------------
// GUARDED NAVIGATION — the hero header (Travel, Leaderboards, Sign Out) stays
// visible during battle, so any of those controls must confirm with the
// player before abandoning an in-progress attempt, exactly like the in-battle
// leave button. Outside of battle, navFn just runs immediately.
// ---------------------------------------------------------------------------
async function guardedNavigate(navFn) {
  if (battle && !battle.finished) {
    const confirmed = await showDialog({
      icon: "🌀",
      title: "Leave the Portal?",
      body: "If you leave now, this attempt won't count — you'll need to start the stage again next time. Nothing you've already earned will be lost.",
      buttons: [
        { label: "Stay and Fight", value: false },
        { label: "Leave Battle", value: true, primary: true }
      ]
    });
    if (!confirmed || !battle || battle.finished) return;
    battle.finished = true;
    clearInterval(battle.timerHandle);
  }
  navFn();
}

function signOut() {
  closeHeaderDropdowns();
  clearInterval(battle && battle.timerHandle);
  HERO = null;
  STATE = null;
  battle = null;
  nav = { realmId: null, worldId: null };
  document.body.classList.remove("has-hero-header");
  el("hero-header").style.display = "none";
  el("mm-username").value = "";
  el("mm-password").value = "";
  showScreen("screen-mainmenu");
}

// ---------------------------------------------------------------------------
// FREMANTIA (hub)
// ---------------------------------------------------------------------------
function renderFremantia() {
  const grid = el("realm-grid");
  grid.innerHTML = "";
  for (const realmId of CONFIG.REALM_ORDER) {
    const realm = getRealm(realmId);
    const unlocked = isRealmUnlocked(realmId);
    const completed = isRealmCompleted(realmId);
    // Every portal LOOKS available from the start — whether it's actually
    // enterable is only revealed narratively (by the Ding Dong Spirit) when
    // the player taps it, not communicated through the card's appearance.
    const prog = unlocked ? realmProgress(realmId) : { done: 0, total: realm.worlds.length };

    const card = document.createElement("div");
    card.className = "realm-card";
    card.dataset.realm = realmId;
    card.innerHTML = `
      ${completed ? `<div class="realm-status-badge completed">COMPLETED</div>` : ""}
      <h3>${REALM_ICON[realmId]} ${realmId} Realm</h3>
      <div class="realm-meta">${prog.done}/${prog.total} worlds cleared</div>
    `;
    card.addEventListener("click", () => {
      if (isRealmUnlocked(realmId)) {
        openRealm(realmId);
      } else {
        showDingDongLockedDialog(realmId);
      }
    });
    grid.appendChild(card);
  }

  const fifth = el("fifth-portal");
  const unlocked5 = !!STATE.fifthRealmUnlocked;
  fifth.className = "fifth-portal" + (unlocked5 ? " unlocked" : "");
  fifth.innerHTML = unlocked5
    ? `<h3>🌀 A New Portal Has Appeared</h3><div class="realm-meta">All four realm orbs are united. A fifth adventure awaits — coming soon.</div>`
    : `<h3>🌀 ??? Portal</h3><div class="realm-meta">Collect all four realm orbs to reveal this portal.</div>`;
}

// The player is allowed to see/tap every realm portal from the start, but
// entering one they haven't earned a weapon for is narratively blocked here.
async function showDingDongLockedDialog(realmId) {
  await showDialog({
    icon: "🔔",
    title: "The Ding Dong Spirit",
    body: `"You don't have a suitable weapon yet — it's too dangerous to enter the <b>${realmId} Realm</b>.<br><br>
           Return here once you've found a weapon that can help you."`,
    buttons: [{ label: "Understood", value: true, primary: true }]
  });
}

function openRealm(realmId) {
  nav.realmId = realmId;
  renderRealmScreen();
  showScreen("screen-realm");
  maybeShowWeaponIntro(realmId);
}

// Shown once, the first time the player ever opens a realm that isn't
// Forest (Forest's weapon is introduced in the welcome dialogue instead).
async function maybeShowWeaponIntro(realmId) {
  if (realmId === "Forest") return;
  if (!STATE.weaponIntroSeen) STATE.weaponIntroSeen = {};
  if (STATE.weaponIntroSeen[realmId]) return;
  STATE.weaponIntroSeen[realmId] = true;
  saveState();
  await showDialog({
    icon: "⚔️",
    title: "A New Weapon!",
    body: `I can use my <b>${getWeaponName(realmId)}</b> here!`,
    buttons: [{ label: "Let's go!", value: true, primary: true }]
  });
}

// ---------------------------------------------------------------------------
// REALM SCREEN — list of world portals
// ---------------------------------------------------------------------------
function renderRealmScreen() {
  const realmId = nav.realmId;
  const realm = getRealm(realmId);
  el("realm-screen-title").textContent = `${REALM_ICON[realmId]} ${realmId} Realm`;
  const lvl = getWeaponLevel(realmId);
  const dmg = getWeaponDamage(realmId);
  el("realm-weapon-chip").innerHTML = `⚔️ ${getWeaponName(realmId)} · Lv ${lvl} · ${dmg} dmg`;

  const list = el("world-list");
  list.innerHTML = "";
  realm.worlds.forEach((world, idx) => {
    const unlocked = isWorldUnlocked(realmId, world.worldId);
    const completed = isWorldCompleted(realmId, world.worldId);
    const prog = worldProgress(realmId, world.worldId);
    const isFinal = idx === realm.worlds.length - 1;

    const card = document.createElement("div");
    card.className = "portal-card" + (unlocked ? "" : " locked") + (completed ? " completed" : "");
    card.innerHTML = `
      <div class="portal-icon">${completed ? "🔑" : unlocked ? "🌀" : "🔒"}</div>
      <div class="portal-info">
        <div class="name">${world.worldName}${isFinal ? " ⭐" : ""}</div>
        <div class="sub">${unlocked ? `${prog.done}/${prog.total} stages cleared${isFinal ? " · Final World" : ""}` : "Requires the previous world's key"}</div>
      </div>
      <div class="chev">›</div>
    `;
    if (unlocked) {
      card.addEventListener("click", () => openWorld(realmId, world.worldId));
    } else {
      card.addEventListener("click", () => {
        alert(`This portal is locked. Clear the previous world to collect its key first.`);
      });
    }
    list.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// HIGH SCORES — rendered as a row of minimal-width, side-scrolling columns:
// Hero Level, Recent Rank Promotions, and one per realm weapon.
// ---------------------------------------------------------------------------
function buildLeaderboardColumn(title, subtitle, rows, emptyMessage, rowRenderer) {
  const col = document.createElement("div");
  col.className = "leaderboard-column";
  col.innerHTML = `<div class="realm-screen-header"><h2>${title}</h2><div class="eyebrow-plain">${subtitle}</div></div>`;
  const list = document.createElement("div");
  list.className = "highscore-list";
  if (!rows.length) {
    list.innerHTML = `<div class="eyebrow-plain" style="text-align:center;">${emptyMessage}</div>`;
  } else {
    rows.forEach((row, i) => list.appendChild(rowRenderer(row, i)));
  }
  col.appendChild(list);
  return col;
}

function highscoreRow(rankLabel, name, detail) {
  const row = document.createElement("div");
  row.className = "highscore-row";
  row.innerHTML = `
    <div class="highscore-rank">${rankLabel}</div>
    <div class="highscore-name">${name}</div>
    <div class="highscore-level">${detail}</div>
  `;
  return row;
}

async function openHighScores() {
  const scroll = el("leaderboard-scroll");
  scroll.innerHTML = `<div class="eyebrow-plain" style="text-align:center; padding:20px;">Loading leaderboards…</div>`;
  showScreen("screen-highscores");
  try {
    const result = await apiGetHighScores();
    scroll.innerHTML = "";

    const scores = (result.scores || []).slice(0, 50);
    scroll.appendChild(buildLeaderboardColumn(
      "🏆 Hero Level", "Highest across Fremantia",
      scores, "No heroes on the leaderboard yet — be the first!",
      (s, i) => highscoreRow(`#${i + 1}`, s.heroName, `Lv ${s.heroLevel} · ${getHeroRank(s.heroLevel).name}`)
    ));

    const promotions = (result.promotions || []).slice(0, 50);
    scroll.appendChild(buildLeaderboardColumn(
      "🏅 Recent Promotions", "Newest first",
      promotions, "No rank promotions yet.",
      (p) => highscoreRow("🏅", p.heroName, `Promoted to ${p.rankName}`)
    ));

    const weaponLeaderboards = result.weaponLeaderboards || {};
    CONFIG.REALM_ORDER.forEach(realmId => {
      const rows = (weaponLeaderboards[realmId] || []).slice(0, 20);
      scroll.appendChild(buildLeaderboardColumn(
        `⚔️ ${getWeaponName(realmId)}`, `Strongest in ${realmId}`,
        rows, "No one has found this weapon yet.",
        (w, i) => highscoreRow(`#${i + 1}`, w.heroName, `Lv ${w.level} · ${w.damage} dmg`)
      ));
    });
  } catch (e) {
    scroll.innerHTML = `<div class="eyebrow-plain" style="text-align:center; padding:20px;">Couldn't load the leaderboard right now.</div>`;
  }
}

function openWorld(realmId, worldId) {
  nav.realmId = realmId;
  nav.worldId = worldId;
  renderWorldScreen();
  showScreen("screen-world");
}

// ---------------------------------------------------------------------------
// WORLD SCREEN — list of stage portals
// ---------------------------------------------------------------------------
function renderWorldScreen() {
  const { realmId, worldId } = nav;
  const world = getWorld(realmId, worldId);
  el("world-screen-title").textContent = world.worldName;
  el("world-screen-sub").textContent = world.theme;

  const list = el("stage-list");
  list.innerHTML = "";
  world.stages.forEach((stage, idx) => {
    const completed = isStageCompleted(realmId, worldId, stage.stageId);
    const card = document.createElement("div");
    card.className = "portal-card" + (completed ? " completed" : "");
    card.innerHTML = `
      <div class="portal-icon">${completed ? "✅" : "🌀"}</div>
      <div class="portal-info">
        <div class="name">Stage ${idx + 1}: ${stage.bossName}</div>
      </div>
      <div class="chev">›</div>
    `;
    card.addEventListener("click", () => openPortalIntro(realmId, worldId, stage.stageId));
    list.appendChild(card);
  });
}

// ---------------------------------------------------------------------------
// PORTAL INTRO
// ---------------------------------------------------------------------------
function openPortalIntro(realmId, worldId, stageId) {
  const stage = getStage(realmId, worldId, stageId);
  el("portal-intro-title").textContent = `Unstable Portal`;
  el("portal-intro-body").textContent =
    `The portal leads to ${stage.bossName}'s lair. It will only stay open for ${CONFIG.PORTAL_SECONDS} seconds — defeat all five monsters, collect the shard, and return before it closes!`;
  el("enter-portal-btn").onclick = () => startBattle(realmId, worldId, stageId);
  showScreen("screen-portal-intro");
}

// ---------------------------------------------------------------------------
// BATTLE
// ---------------------------------------------------------------------------
function startBattle(realmId, worldId, stageId) {
  const stage = getStage(realmId, worldId, stageId);
  const weaponDamage = getWeaponDamage(realmId);

  resetQuestionHistory(stage);

  battle = {
    realmId, worldId, stageId, stage,
    weaponDamage,
    monsterIndex: 0,
    monsters: stage.enemies.map(e => ({
      techId: e.techId, name: e.name, role: e.role,
      hitsRequired: e.hitsRequired, hitsRemaining: e.hitsRequired
    })),
    seconds: CONFIG.PORTAL_SECONDS,
    inputBuffer: "",
    question: null,
    bossDefeated: false,
    finished: false
  };

  renderBattleChrome();
  loadQuestionForCurrentMonster();
  renderMonster();

  showScreen("screen-battle");

  clearInterval(battle.timerHandle);
  battle.timerHandle = setInterval(tickTimer, 1000);
  updateTimerDisplay();
}

function renderBattleChrome() {
  const realm = getRealm(battle.realmId);
  const world = getWorld(battle.realmId, battle.worldId);
  el("battle-weapon-chip").innerHTML = `⚔️ ${realm.weaponName}`;
  el("battle-weapon-lvl-chip").innerHTML = `Lv ${getWeaponLevel(battle.realmId)}`;
  el("battle-weapon-dmg-chip").innerHTML = `${battle.weaponDamage} dmg`;
  el("battle-realm-chip").innerHTML = `${REALM_ICON[battle.realmId]} ${battle.realmId}`;
  el("battle-world-chip").innerHTML = `${world.worldName}`;

  const track = el("stage-track");
  track.innerHTML = "";
  battle.monsters.forEach((m, i) => {
    const node = document.createElement("div");
    node.className = "track-node" + (m.role === "boss" ? " boss-node" : "");
    node.textContent = m.role === "boss" ? "👑" : (i + 1);
    track.appendChild(node);
  });
}

function tickTimer() {
  if (!battle || battle.finished) return;
  battle.seconds--;
  updateTimerDisplay();
  if (battle.seconds <= 0) {
    battle.seconds = 0;
    updateTimerDisplay();
    finishBattle(false);
  }
}

function updateTimerDisplay() {
  const pill = el("timer-pill");
  pill.textContent = `⏱ ${battle.seconds}s`;
  pill.classList.toggle("urgent", battle.seconds <= 15);

  // Reflect defeated monsters + current on the track
  const nodes = el("stage-track").children;
  battle.monsters.forEach((m, i) => {
    const node = nodes[i];
    node.classList.toggle("defeated", m.hitsRemaining <= 0);
    node.classList.toggle("current", i === battle.monsterIndex && m.hitsRemaining > 0);
  });
}

function currentMonster() {
  return battle.monsters[battle.monsterIndex];
}

function loadQuestionForCurrentMonster() {
  battle.question = generateQuestion(battle.stage);
  battle.inputBuffer = "";
  el("question-text").textContent = battle.question.text + " =";
  updateAnswerDisplay();
}

function updateAnswerDisplay() {
  const d = el("answer-display");
  d.classList.remove("correct", "wrong");
  d.textContent = battle.inputBuffer.length ? battle.inputBuffer : "?";
  d.classList.toggle("answer-placeholder", battle.inputBuffer.length === 0);
}

function renderMonster() {
  const m = currentMonster();
  const isBoss = m.role === "boss";
  const emojiSet = REALM_EMOJI[battle.realmId];
  const emoji = isBoss ? emojiSet.boss : emojiSet.enemy[battle.monsterIndex % emojiSet.enemy.length];

  el("monster-name").textContent = (isBoss ? "👑 BOSS · " : "") + m.name;
  el("monster-role-tag").textContent = isBoss ? "Defeat the boss to claim the shard!" : `Enemy ${battle.monsterIndex + 1} of 4`;
  el("battle-monster-chip").innerHTML = `${isBoss ? "👑 " : ""}${m.name}`;
  const sprite = el("monster-sprite");
  sprite.className = "monster-sprite" + (isBoss ? " boss-sprite" : "");
  sprite.textContent = emoji;

  updateHpBar();
  loadQuestionForCurrentMonster();
}

function updateHpBar() {
  const m = currentMonster();
  const pct = Math.max(0, (m.hitsRemaining / m.hitsRequired) * 100);
  el("hp-bar-fill").style.width = pct + "%";
  el("hp-label").textContent = `HP: ${m.hitsRemaining * battle.weaponDamage} / ${m.hitsRequired * battle.weaponDamage}`;
}

function numpadPress(key) {
  if (!battle || battle.finished) return;
  if (key === "back") {
    battle.inputBuffer = battle.inputBuffer.slice(0, -1);
  } else if (key === "clear") {
    battle.inputBuffer = "";
  } else if (key === "submit") {
    submitAnswer();
    return;
  } else if (key === ".") {
    if (!battle.inputBuffer.includes(".")) battle.inputBuffer += ".";
  } else {
    if (battle.inputBuffer.length < 8) battle.inputBuffer += key;
  }
  updateAnswerDisplay();
}

function submitAnswer() {
  if (!battle.inputBuffer.length) return;
  const val = parseFloat(battle.inputBuffer);
  const correct = Math.abs(val - battle.question.answer) < 0.005;
  const display = el("answer-display");

  if (correct) {
    display.classList.add("correct");
    applyHit();
  } else {
    display.classList.add("wrong");
    setTimeout(() => display.classList.remove("wrong"), 350);
    battle.inputBuffer = "";
    setTimeout(updateAnswerDisplay, 200);
  }
}

function applyHit() {
  const m = currentMonster();
  m.hitsRemaining = Math.max(0, m.hitsRemaining - 1);

  const sprite = el("monster-sprite");
  sprite.classList.remove("hit");
  void sprite.offsetWidth;
  sprite.classList.add("hit");

  updateHpBar();
  updateTimerDisplay();

  if (m.hitsRemaining <= 0) {
    sprite.classList.add("defeated");
    const wasBoss = m.role === "boss";
    setTimeout(() => {
      if (wasBoss) {
        battle.bossDefeated = true;
        clearInterval(battle.timerHandle); // boss is down — the attempt is already won
        finishBattle(true);
      } else {
        battle.monsterIndex++;
        renderMonster();
      }
    }, 420);
  } else {
    setTimeout(() => {
      battle.inputBuffer = "";
      loadQuestionForCurrentMonster();
    }, 250);
  }
}

function finishBattle(success) {
  if (!battle || battle.finished) return;
  battle.finished = true;
  clearInterval(battle.timerHandle);

  if (success) {
    const result = completeStage(battle.realmId, battle.worldId, battle.stageId);
    updateHeroHeader();
    showSuccessScreen(result);
  } else {
    showFailScreen();
  }
}

// Player-initiated exit from an in-progress battle. Counts as an abandoned
// attempt (same as a portal closing) — no stage progress is awarded, but
// nothing already earned is lost.
function leaveBattle() {
  if (!battle || battle.finished) return;
  guardedNavigate(() => {
    renderWorldScreen();
    showScreen("screen-world");
  });
}

// ---------------------------------------------------------------------------
// RESULT SCREENS
// ---------------------------------------------------------------------------
function showSuccessScreen(result) {
  const stage = battle.stage;
  const world = getWorld(battle.realmId, battle.worldId);
  el("success-body").innerHTML =
    `You escaped with the shard from <b>${stage.bossName}</b>!<br>` +
    `Boss shard collected for ${world.worldName}.`;
  showScreen("screen-success");

  const stages = world.stages;
  const idx = stages.findIndex(s => s.stageId === battle.stageId);
  const nextStage = stages[idx + 1];

  const continueBtn = el("success-continue-btn");
  const returnBtn = el("success-return-btn");
  // Once every stage in this world is cleared there's no more world to
  // return to — send the player back to the realm instead (or all the way
  // to Fremantia if that was also the realm's final world).
  returnBtn.textContent = result.worldCompleted ? `Return to ${battle.realmId} Realm` : `Return to ${world.worldName}`;

  const goReturn = () => {
    runModalQueue(result, () => {
      if (result.realmCompleted) {
        renderFremantia();
        showScreen("screen-fremantia");
      } else if (result.worldCompleted) {
        renderRealmScreen();
        showScreen("screen-realm");
      } else {
        renderWorldScreen();
        showScreen("screen-world");
      }
    });
  };
  const goContinue = () => {
    runModalQueue(result, () => {
      startBattle(battle.realmId, battle.worldId, nextStage.stageId);
    });
  };

  returnBtn.onclick = goReturn;
  if (nextStage) {
    continueBtn.style.display = "";
    continueBtn.onclick = goContinue;
  } else {
    // Final stage of the world — there's no next monster to continue to.
    continueBtn.style.display = "none";
  }
  setChoice(el("success-choice-row"), 0);
}

// ---------------------------------------------------------------------------
// RESULT-SCREEN CHOICE NAVIGATION (↑/↓ or ←/→ + Enter, or tap) — shared by
// the success screen and the fail screen, or any future screen with a
// .choice-row of .choice-btn buttons.
// ---------------------------------------------------------------------------
let choiceIndex = 0;
function choiceButtons(row) {
  if (!row) return [];
  return Array.from(row.querySelectorAll(".choice-btn")).filter(b => b.style.display !== "none");
}
function setChoice(row, i) {
  const btns = choiceButtons(row);
  if (!btns.length) return;
  choiceIndex = Math.max(0, Math.min(i, btns.length - 1));
  btns.forEach((b, idx) => b.classList.toggle("selected", idx === choiceIndex));
}
function moveChoice(row, delta) {
  const btns = choiceButtons(row);
  if (!btns.length) return;
  setChoice(row, (choiceIndex + delta + btns.length) % btns.length);
}
function activateChoice(row) {
  const btns = choiceButtons(row);
  if (btns[choiceIndex]) btns[choiceIndex].click();
}

function showFailScreen() {
  showScreen("screen-fail");
  el("fail-retry-btn").onclick = () => openPortalIntro(battle.realmId, battle.worldId, battle.stageId);
  el("fail-back-btn").onclick = () => {
    renderWorldScreen();
    showScreen("screen-world");
  };
  setChoice(el("fail-choice-row"), 0);
}

function runModalQueue(result, onDone) {
  const queue = [];
  const realmId = battle.realmId;

  if (result.worldCompleted) {
    const world = getWorld(realmId, battle.worldId);
    queue.push({
      icon: "🗝️",
      title: "World Key Created!",
      body: `You collected every shard in <b>${world.worldName}</b>.<br>The <b>${world.worldName} Key</b> has been forged automatically.<br><br>` +
            `Your <b>${getWeaponName(realmId)}</b> leveled up!<br>Damage: ${result.newWeaponDamage - CONFIG.DAMAGE_PER_LEVEL} → <b>${result.newWeaponDamage}</b>` +
            (result.nextWorldUnlocked ? `<br><br>The portal to <b>${getWorld(realmId, result.nextWorldUnlocked).worldName}</b> has unlocked!` : "")
    });
  }
  if (result.weaponDropped) {
    queue.push({
      icon: "🗡️",
      title: "A Weapon Was Dropped!",
      body: `The boss dropped the <b>${result.droppedWeaponName}</b>!<br><br>` +
            (result.droppedWeaponFlavor ? `<i>"${result.droppedWeaponFlavor}"</i><br><br>` : "") +
            `I wonder where I could use this...`
    });
  }
  if (result.realmCompleted) {
    queue.push({
      icon: "🔮",
      title: `${realmId} Realm Complete!`,
      body: `You have conquered the ${realmId} Realm.<br><b>${result.orbName} acquired!</b>` +
            (result.nextRealmUnlocked ? `<br><br>The <b>${result.nextRealmUnlocked} Realm</b> has unlocked in Fremantia!` : "")
    });
  }
  if (result.fifthRealmUnlocked) {
    queue.push({
      icon: "🌀",
      title: "A New Portal Appears!",
      body: `All four realm orbs are united.<br>A mysterious new portal has appeared in Fremantia...`
    });
  }

  showNextModal(queue, 0, onDone);
}

function showNextModal(queue, i, onDone) {
  if (i >= queue.length) { onDone(); return; }
  const m = queue[i];
  const overlay = document.createElement("div");
  overlay.className = "modal-overlay";
  overlay.innerHTML = `
    <div class="modal-card">
      <div class="modal-icon">${m.icon}</div>
      <div class="modal-title">${m.title}</div>
      <div class="modal-body">${m.body}</div>
      <button class="btn big">Continue</button>
    </div>`;
  document.body.appendChild(overlay);
  const cleanup = enableOverlayKeyboardNav(overlay);
  overlay.querySelector("button").addEventListener("click", () => {
    cleanup();
    overlay.remove();
    showNextModal(queue, i + 1, onDone);
  });
}

// ---------------------------------------------------------------------------
// BOOTSTRAP
// ---------------------------------------------------------------------------
function buildNumpad() {
  const pad = el("numpad");
  const keys = ["7","8","9","4","5","6","1","2","3",".","0","back"];
  pad.innerHTML = "";
  keys.forEach(k => {
    const b = document.createElement("button");
    b.className = "numkey" + (k === "back" ? " clear" : "");
    b.textContent = k === "back" ? "⌫" : k;
    b.addEventListener("click", () => numpadPress(k === "back" ? "back" : k));
    pad.appendChild(b);
  });
  const submit = document.createElement("button");
  submit.className = "numkey submit";
  submit.style.gridColumn = "span 3";
  submit.textContent = "Attack! ⚔️";
  submit.addEventListener("click", () => numpadPress("submit"));
  pad.appendChild(submit);
}

document.addEventListener("DOMContentLoaded", () => {
  initMainMenu();
  buildNumpad();
  bindKeyboardControls();
  el("open-highscores-btn").addEventListener("click", openHighScores);
  el("leave-battle-btn").addEventListener("click", leaveBattle);
  document.querySelectorAll("[data-back-realm]").forEach(b => b.addEventListener("click", () => { renderRealmScreen(); showScreen("screen-realm"); }));
  document.querySelectorAll("[data-back-fremantia]").forEach(b => b.addEventListener("click", () => { renderFremantia(); showScreen("screen-fremantia"); }));
  document.querySelectorAll("[data-back-world]").forEach(b => b.addEventListener("click", () => { renderWorldScreen(); showScreen("screen-world"); }));

  el("hero-header-rank").addEventListener("click", showRankInfoDialog);
  el("hero-header-name").addEventListener("click", (e) => {
    e.stopPropagation();
    openHeaderDropdown(el("player-dropdown"), el("hero-header-name"), fillPlayerDropdown);
  });
  el("weapons-icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    openHeaderDropdown(el("weapons-dropdown"), el("weapons-icon-btn"), fillWeaponsDropdown);
  });
  el("travel-icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    guardedNavigate(() => openHeaderDropdown(el("travel-dropdown"), el("travel-icon-btn"), fillTravelDropdown));
  });
  el("leaderboards-icon-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    closeHeaderDropdowns();
    guardedNavigate(openHighScores);
  });
  document.addEventListener("click", (e) => {
    if (e.target.closest("#weapons-dropdown, #weapons-icon-btn, #player-dropdown, #hero-header-name, #travel-dropdown, #travel-icon-btn")) return;
    closeHeaderDropdowns();
  });
});

// ---------------------------------------------------------------------------
// KEYBOARD CONTROLS (PC/desktop play) — mirrors the on-screen numpad and
// login flow 1:1 so nothing about the game logic needs to change. Never
// interferes with typing in the username/password fields.
// ---------------------------------------------------------------------------
function bindKeyboardControls() {
  // Enter submits the login/create-account form from either field.
  ["mm-username", "mm-password"].forEach(id => {
    el(id).addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLogin();
      }
    });
  });

  document.addEventListener("keydown", (e) => {
    // Don't hijack keystrokes while the player is typing into a text field
    // (e.g. the login form), or while a modal dialog is open.
    const activeTag = document.activeElement && document.activeElement.tagName;
    if (activeTag === "INPUT" || activeTag === "TEXTAREA") return;
    if (document.querySelector(".modal-overlay")) return;

    // Result-screen choice controls (success or fail — continue/return/retry)
    const activeChoiceRow = document.querySelector(".screen.active .choice-row");
    if (activeChoiceRow) {
      if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
        e.preventDefault();
        moveChoice(activeChoiceRow, -1);
      } else if (e.key === "ArrowDown" || e.key === "ArrowRight") {
        e.preventDefault();
        moveChoice(activeChoiceRow, 1);
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        activateChoice(activeChoiceRow);
      }
      return;
    }

    // Battle-only controls
    if (el("screen-battle").classList.contains("active")) {
      if (e.key >= "0" && e.key <= "9") {
        numpadPress(e.key);
      } else if (e.key === "." || e.key === ",") {
        numpadPress(".");
      } else if (e.key === "Backspace") {
        e.preventDefault();
        numpadPress("back");
      } else if (e.key === "Delete") {
        numpadPress("clear");
      } else if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        numpadPress("submit");
      } else if (e.key === "Escape") {
        leaveBattle();
      }
      return;
    }

    // Global: Escape backs out of overlays/menus one level where it's safe to.
    if (e.key === "Escape") {
      closeHeaderDropdowns();
    }
  });
}
