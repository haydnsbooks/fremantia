# Combat Realm — Design Specification (Draft)

## Status

This is a **new design document**, not yet cross-checked against a
spreadsheet or naming file (none exists yet for this sub-game). It
proposes concrete numbers and formulas so the system is buildable, but
every number below is a **proposed starting point for playtesting**,
not a verified fact — flag anything you want changed before it's
treated as final.

---

## 0. Ambiguities to resolve before building

These came up while checking your request against the existing project
files (`gameData.js`) and should be confirmed, not silently guessed:

1. **RESOLVED — weapon names.** `game_world_names_master.md` and
   `gameData.js` disagreed; per your instruction this doc now uses
   what's actually implemented in `gameData.js`: Forest = *Steel
   Sword*, Water = *Verdant Blade*, Fire = *Tidecaller*, Ice =
   *Emberblade*. Note `game_world_names_master.md` itself still
   contains the old, unimplemented names (Leaf Blade / Hydro Blade /
   Inferno Blade) — that file wasn't edited as part of this request, so
   it will keep disagreeing with the live game until someone updates it
   separately.
2. **"Lvl 1 weapon" for Monster 1.** Combat Realm access requires
   clearing one world in each of the four realms. Under the existing
   main-game rule (+5 damage per world clear), that would already put
   each weapon at **Level 2** (15 damage), not Level 1 (10 damage), by
   the time a player can reach the Combat Realm. I've balanced Monster
   1 around a literal Level 1 weapon (10 damage) as you described, which
   only makes it *easier* than strictly necessary at Level 2 — safe
   either way, just flagging the discrepancy.
3. **Per-weapon maximum damage differs by realm**, because realms have
   different world counts in the current spreadsheet-derived data:

   | Realm  | Weapon | Worlds | Max weapon damage (10 + 5×worlds) |
   |---|---|---|---|
   | Forest | Steel Sword | 9 | 55 |
   | Water | Verdant Blade | 8 | 50 |
   | Fire | Tidecaller | 7 | 45 |
   | Ice | Emberblade | 7 | 45 |

   The final-boss balancing below uses **45** (the lowest max) as the
   worst-case so the game stays completable no matter which weapon a
   player must use against a given boss's element.

---

## 1. Access, Navigation, and First-Login Popup

**Unlock condition:** the Combat Realm becomes available once the
player has cleared one world in each of the four realms (Forest,
Water, Fire, Ice) — i.e. once all four weapons exist.

**Entry point:** a Combat Portal on the Fremantia hub screen, placed
next to the (locked) fifth-realm "mystery portal." It should read as
clearly optional and separate from the core adventure loop.

**First-login popup** (shown once per player, first time they enter):

> **The Combat Realm**
>
> Here, monsters fight back.
>
> Defeat them to earn **Combat XP** (which levels up your combat
> attributes) and **Fremantium** (currency you can spend in the Shop
> on pets and trophies).
>
> **Battles:** choose a weapon, then watch your hero and the monster
> trade blows automatically. Your **Attack**, **Attack Speed**,
> **Vitality** and **Defence** all affect how the fight goes.
>
> **Energy:** clearing a stage in the main game earns you 1 Energy (up
> to 10) — and even a failed attempt earns Energy if you got 8 or more
> correct before the portal closed. Each battle costs 2 Energy — so
> keep practising your maths to keep fighting!
>
> **Elements:** each monster has an element, and each weapon is
> strong against one element and weak against another — match them
> well.

**Sub-zones inside the Combat Realm:**

- **Battle** — the monster ladder
- **Attributes** — current attributes, combat level, XP bar, and a
  "Reset Attributes" option
- **Shop** — buy pets and trophies with Fremantium
- **Pets** — owned pets on display
- **Trophies** — owned trophies on display

---

## 2. Energy System

*Updated: see the changelog at the end of this doc — cost and the
qualifying-attempt rule were revised after initial playtesting.*

- Cap: **10 Energy**
- Cost: **2 Energy per battle** (5 battles "banked" at full cap)
- Regeneration: **+1 Energy per qualifying 60-second attempt** in the
  main game:
  - A **successful** stage clear always qualifies.
  - A **failed** (timed-out) attempt qualifies if the player answered
    at least **8 correct answers** before the portal closed.

An attempt that doesn't meet this bar still counts as a normal
fluency attempt for the main game, it simply **does not** award
Energy.

---

## 3. Attributes and Combat Level

| Attribute | Start | Step per level | Max | Levels to max |
|---|---|---|---|---|
| Attack Speed (attacks/sec) | 1.0 | +0.1 | 2.0 | 10 |
| Attack (bonus damage) | +0 | +10 | +100 | 10 |
| Vitality (HP) | 100 | +100 | 1000 | 9 |
| Defence (damage reduction) | −0 | −5 | −50 | 10 |

**Total attribute points to fully max every attribute: 10+10+9+10 = 39**

Combat Level starts at **1** (0 points spent) and grants **1 attribute
point per level-up**.

**→ Maximum Combat Level = 1 + 39 = 40** — this is the point at which
every attribute is simultaneously maxed.

A "Reset Attributes" action refunds all spent points (keeping Combat
Level/XP as-is) so players can respec.

### Combat XP required per level-up (proposed)

Exponential curve so late levels are meaningfully harder to reach than
early ones (discourages parking on the level-1 monster forever):

```
XP to reach level L+1 = 50 × 1.25^(L−1)
```

| Level-up | XP needed | Cumulative |
|---|---|---|
| 1→2 | 50 | 50 |
| 2→3 | 62 | 112 |
| 3→4 | 78 | 191 |
| 4→5 | 98 | 288 |
| 5→6 | 122 | 410 |
| … | … | … |
| 37→38 | 192,593 | 962,765 |
| 38→39 | 240,741 | 1,203,506 |

Total XP to reach Combat Level 40 (fully maxed): **≈1.2 million XP.**
This is a long-term grind by design — see §5 for how monster XP
rewards scale to make climbing the ladder the efficient path.

---

## 4. Weapons and Elemental Type Chart

Monsters have an element: **Forest, Water, Fire, or Ice.** Weapons
(the same four from the main game) are used freely in the Combat
Realm regardless of which realm they came from — unlike the main
game's "weapon only usable in its home realm" rule. This is a
deliberate Combat-Realm-only exception; flag it if you'd rather keep
weapons realm-locked here too.

**Effectiveness cycle:** `Water → Fire → Ice → Forest → Water`
(each element is strong against the next one in the cycle, weak
against the one before it):

| Weapon element | 2× vs | 0.5× vs | 1× vs |
|---|---|---|---|
| Water (Verdant Blade) | Fire | Forest | Ice |
| Fire (Tidecaller) | Ice | Water | Forest |
| Ice (Emberblade) | Forest | Fire | Water |
| Forest (Steel Sword) | Water | Ice | Fire |

Because the final four bosses are one of each element (§5), clearing
the game requires all four weapons to be levelled — i.e. all four
realms and all four operations.

---

## 5. The 20-Monster Ladder

Monsters unlock sequentially (defeat Monster *n* to unlock Monster
*n+1*), but **previously unlocked monsters stay fightable** — this is
how grinding for Fremantium/XP works. Monsters 1–16 cycle through the
four elements for variety; **Monsters 17–20 are the four final
bosses, one of each element**, gating full completion behind mastering
every weapon/operation.

### Scaling formulas

```
HP(n)      = 50    × 1.3062^(n−1)
Attack(n)  = 8      × 1.1397^(n−1)
AtkSpeed(n)= 1.0 + 0.5 × (n−1)/19        [1.0 → 1.5 across the ladder]
XP(n)      = 10    × 1.3062^(n−1)
Fremantium(n) = 5   × 1.3062^(n−1)
```

| # | HP | Attack | Atk Spd | XP | Fremantium |
|---|---:|---:|---:|---:|---:|
| 1 | 50 | 8.0 | 1.00 | 10 | 5 |
| 2 | 65 | 9.1 | 1.03 | 13 | 7 |
| 3 | 85 | 10.4 | 1.05 | 17 | 9 |
| 4 | 111 | 11.8 | 1.08 | 22 | 11 |
| 5 | 146 | 13.5 | 1.11 | 29 | 15 |
| 6 | 190 | 15.4 | 1.13 | 38 | 19 |
| 7 | 248 | 17.5 | 1.16 | 50 | 25 |
| 8 | 324 | 20.0 | 1.18 | 65 | 32 |
| 9 | 424 | 22.8 | 1.21 | 85 | 42 |
| 10 | 553 | 26.0 | 1.24 | 111 | 55 |
| 11 | 723 | 29.6 | 1.26 | 145 | 72 |
| 12 | 944 | 33.7 | 1.29 | 189 | 94 |
| 13 | 1,233 | 38.4 | 1.32 | 247 | 123 |
| 14 | 1,611 | 43.8 | 1.34 | 322 | 161 |
| 15 | 2,104 | 49.9 | 1.37 | 421 | 210 |
| 16 | 2,748 | 56.9 | 1.39 | 550 | 275 |
| **17 (boss)** | 3,590 | 64.8 | 1.42 | 718 | 359 |
| **18 (boss)** | 4,689 | 73.9 | 1.45 | 938 | 469 |
| **19 (boss)** | 6,125 | 84.2 | 1.47 | 1,225 | 612 |
| **20 (final boss)** | 8,000 | 96.0 | 1.50 | 1,600 | 800 |

### Battle model

Each hit resolves as:
```
Player damage/hit = (weapon damage + Attack bonus) × type multiplier
Player DPS = Player damage/hit × Attack Speed
Time to kill = Monster HP ÷ Player DPS

Monster damage/hit = max(1, Monster Attack − Defence)
Monster DPS = Monster damage/hit × Monster Attack Speed
Damage taken over the fight = Monster DPS × Time to kill
Player wins if Damage taken < Vitality
```

### Validated against your two anchor requirements

**Monster 1, Level 1 weapon (10 dmg), all attributes at default,
worst-case 0.5× matchup:** time to kill 10s, damage taken 80 of 100
HP — a real but winnable fight, with any weapon, at minimum stats. ✓

**Monster 20 (final boss), full Level 40 stats, weakest maxed weapon
(45 dmg), 2× type match:** damage taken 952 of 1000 HP — survives, but
narrowly. Every one of the following, tested individually with
everything *else* maxed, **fails** (player dies before the kill):
weapon not maxed, Attack not maxed, Attack Speed not maxed, Defence
not maxed, Vitality not maxed, or fighting at only a neutral (1×)
match-up instead of the 2× counter. So Monster 20 genuinely requires
full Combat Level 40, a maxed weapon, *and* the correct elemental
counter — which in turn requires owning and levelling all four
weapons. ✓

---

## 6. Currency, Shop, Pets and Trophies

**Fremantium** is earned only from defeating monsters (§5 table).
Selling an owned item refunds **50% of its purchase price**.

### Suggested price tiers

Derived directly from the Fremantium curve above, so the "grind low
monsters vs. climb the ladder" incentive falls out naturally:

| Tier | Price | Reachable via | Reachable via grinding Monster 1 |
|---|---:|---|---|
| Entry | 50 | 10 kills of Monster 1 | 10 kills |
| Mid | ~500 | ~9–10 kills of Monster 10 | 100 kills |
| Advanced | ~2,000 | ~9 kills of Monster 15 | 400 kills |
| Epic (final) | ~5,600 | ~10 kills across the final 4 bosses | 1,120 kills |

The gap between "10 kills at the top" and "1,120 kills at the bottom"
for the epic tier is what makes grinding Monster 1 for late-game items
impractical, as you wanted — the incentive to push up the ladder is
built into the currency curve itself rather than needing a separate
rule.

Apply this same 4-tier structure independently to **Pets** and
**Trophies** (so there's a cheap/mid/advanced/epic pet and the same
for trophies).

### Stock

Each shop item can only be owned once — once purchased it shows as
"Owned" / out of stock (consistent with your "own each item once"
rule); selling it returns it to purchasable stock.

### Epic tier: locked as a mystery item

The single Epic pet and Epic trophy are **hidden until the player has
defeated all four final bosses (Monsters 17–20) at least once** — this
is an assumption on my part (you said "every boss"; I've read that as
the four Combat Realm final bosses rather than every stage boss in the
main game, since that's the natural reading in context — flag it if
you meant something else).

Before that condition is met:

- The Epic pet/trophy still appear in the Shop list (so players know
  something is coming), but rendered as a **silhouette with "???" for
  the name, description and price**.
- Tapping the mystery entry shows a short locked message rather than a
  purchase option, e.g.:

  > **???**
  >
  > A legendary reward awaits the hero who conquers every element.
  >
  > *Defeat all four Realm Bosses in the Combat Realm to reveal this
  > item.*

- The item is **not purchasable** in this state regardless of the
  player's Fremantium balance — the gate is boss defeats, not currency.

Once all four bosses have been defeated:

- The entry **unlocks and reveals** its real name, artwork/description
  and price (the ~5,600 Fremantium epic price from the table above
  still applies — defeating the bosses reveals the item, it doesn't
  make it free).
- A one-time celebratory pop-up should mark the reveal, e.g.:

  > **A Mystery Revealed!**
  >
  > You have defeated every Realm Boss.
  >
  > **[Epic Pet/Trophy Name] is now available in the Shop!**

This mirrors the "own each item once" stock rule — it's simply an
additional unlock condition (boss defeats) layered on top of the
existing purchase condition (enough Fremantium), and should be tracked
as its own flag (`epicItemsUnlocked: true/false`) alongside the
existing progression data in §7, independent of whether the player has
actually bought the item yet.

### Item names

Shop item names and flavour text are now finalised in a separate
naming reference file, **`combat_realm_shop_items.md`**, following the
same separation-of-concerns pattern as the four realm monster-name
files (naming data kept apart from game logic/progression data). See
that file for the full list of pets and trophies at each tier.

---

## 7. Data Architecture Notes

Consistent with the rest of the project, keep three things separate:

1. **Combat progression data** — energy, combat XP, combat level,
   attribute points spent, monster ladder position, owned
   pets/trophies, Fremantium balance. Data-driven, not hard-coded per
   monster.
2. **Monster ladder data** — generated from the formulas in §5 rather
   than hand-authored per monster, the same way the main game's `gen`
   objects generate questions rather than hard-coding each one.
3. **Naming/flavour data** — monster names, pet names, trophy names —
   belongs in a new reference `.md` file once you're ready to lock
   those in, the same way the four realms' monster names already do.

The Combat Realm should not touch or overwrite Hero Level, World/Realm
progression, or main-game weapon levels — it only *reads* which
weapons the player owns and their levels.

---

## 8. Changelog (post-launch fixes)

- **Combat Realm unlock** was already a live check
  (`isCombatRealmUnlocked()` in `gameState.js` recomputes from
  `realmProgress()` on every call, not a one-time flag set at the
  moment of completion), so players who cleared all four World 1s
  before this system existed are unlocked automatically the next time
  Fremantia renders — no migration needed.
- **Energy cost per battle**: 5 → **2**.
- **Energy-earning rule**: replaced the "3 answers, spaced ≥1.5s
  apart" anti-farming check with a simpler rule tied to genuine
  fluency practice — a successful stage clear always earns Energy; a
  failed (timed-out) attempt earns Energy only with **8+ correct
  answers** before time ran out.
- **Weapon icons** (Combat Realm weapon-select screen only): now
  reflect each weapon's own name/theme rather than the realm it's
  associated with — e.g. Emberblade (the Ice realm's weapon) shows an
  ember/fire icon 🔥, not Ice's snowflake ❄️. See `COMBAT_WEAPON_ICON`
  in `combatData.js`. Monster element icons are unchanged (they
  correctly reflect the monster's own element).
