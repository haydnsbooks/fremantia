// ============================================================================
// MATH ENGINE — generates a question for a stage's "gen" spec.
// The spec for every stage comes from the progression spreadsheet (see
// gameData.js). This file only turns that spec into a random question that
// matches the intended skill — it never invents new mathematical content.
// ============================================================================

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick(arr) {
  return arr[randInt(0, arr.length - 1)];
}
function round1(n) {
  return Math.round(n * 10) / 10;
}
function round2(n) {
  return Math.round(n * 100) / 100;
}
function fmt(n) {
  // Format numbers for display: keep decimals tidy, add thousands separators for big ints
  if (Number.isInteger(n)) {
    return n.toLocaleString("en-US");
  }
  // decimal — trim floating point noise
  let s = n.toFixed(2);
  if (s.endsWith("0")) s = n.toFixed(1);
  return s;
}

// Tracks every question already asked so far in the CURRENT battle attempt
// for each stage, so the same question never repeats within one battle.
// Keyed by stageId (falls back to the generator type if a stage has no id).
// Reversing the operands produces different text (e.g. "4 x 10" vs "10 x 4"),
// so those are treated as distinct questions, not repeats.
const _usedQuestionText = {};

// How many times we'll re-roll before giving up and accepting a repeat.
// This is a safety valve for stages whose generator only has a
// handful of possible questions (so eventually running out of fresh
// ones is unavoidable) — it stops us from looping forever.
const MAX_REROLLS = 20;

// Returns { text, answer, a, b, op }
function generateQuestion(stage) {
  const spec = stage.gen;
  const fn = GENERATORS[spec.type];
  if (!fn) {
    console.error("Unknown generator type", spec.type, stage.stageId);
    return { text: "1 + 1", answer: 2, a: 1, b: 1, op: "+" };
  }

  const key = stage.stageId || spec.type;
  if (!_usedQuestionText[key]) _usedQuestionText[key] = new Set();
  const used = _usedQuestionText[key];

  let question = fn(spec);
  let attempts = 0;
  while (used.has(question.text) && attempts < MAX_REROLLS) {
    question = fn(spec);
    attempts++;
  }

  used.add(question.text);
  return question;
}

// Call when starting a fresh stage/battle (including a retry after a fail)
// so the new attempt's questions aren't restricted by questions asked in a
// previous run of the same stage.
function resetQuestionHistory(stage) {
  const key = (stage && stage.stageId) || (stage && stage.gen && stage.gen.type);
  if (key) _usedQuestionText[key] = new Set();
}

function buildQ(a, b, op, answer) {
  return { text: `${fmt(a)} ${op} ${fmt(b)}`, answer: round2(answer), a, b, op };
}

const GENERATORS = {
  // ---------------- ADDITION ----------------
  add_single(spec) {
    let a, b;
    do { a = randInt(1, 9); b = randInt(1, 9); } while (a + b > (spec.maxSum || 9));
    return buildQ(a, b, "+", a + b);
  },
  add_single_bridge() {
    let a, b;
    do { a = randInt(2, 9); b = randInt(2, 9); } while (a + b < 10 || a + b > 18);
    return buildQ(a, b, "+", a + b);
  },
  add_n_single(spec) {
    const n = spec.n;
    const nums = [];
    for (let i = 0; i < n; i++) nums.push(randInt(1, 9));
    const sum = nums.reduce((x, y) => x + y, 0);
    return { text: nums.join(" + "), answer: sum, a: nums, b: null, op: "+" };
  },
  add_mult10() {
    const a = randInt(1, 9) * 10, b = randInt(1, 9) * 10;
    return buildQ(a, b, "+", a + b);
  },
  add_mult10_single() {
    const a = randInt(1, 9) * 10, b = randInt(1, 9);
    return buildQ(a, b, "+", a + b);
  },
  add_teen_single(spec) {
    let a, b;
    do {
      a = randInt(10, 19); b = randInt(1, 9);
      const units = a % 10;
      const bridges = (units + b) >= 10;
      if (spec.bridge === bridges) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_2d_single(spec) {
    let a, b;
    do {
      a = randInt(11, 98); b = randInt(1, 9);
      const carries = (a % 10) + b >= 10;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_2d_mult10() {
    const a = randInt(11, 89), b = randInt(1, 8) * 10;
    return buildQ(a, b, "+", a + b);
  },
  add_2d_2d(spec) {
    let a, b;
    do {
      a = randInt(11, 89); b = randInt(11, 89);
      const carryOnes = (a % 10) + (b % 10) >= 10;
      const carryTens = Math.floor(a / 10) + Math.floor(b / 10) >= 10;
      if ((spec.carryOnes === null || spec.carryOnes === carryOnes) &&
          (spec.carryTens === null || spec.carryTens === carryTens)) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_single(spec) {
    let a, b;
    do {
      a = randInt(101, 989); b = randInt(1, 9);
      const carries = (a % 10) + b >= 10;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_mult10(spec) {
    let a, b;
    do {
      a = randInt(101, 989); b = randInt(1, 8) * 10;
      const carries = (Math.floor(a / 10) % 10) + (b / 10) >= 10;
      if (spec.carry === null || spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_mult100(spec) {
    let a, b;
    do {
      a = randInt(101, 899); b = randInt(1, 8) * 100;
      const carries = Math.floor(a / 100) + (b / 100) >= 10;
      if (spec.carry === null || spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_2d(spec) {
    let a, b;
    do {
      a = randInt(101, 899); b = randInt(11, 89);
      const carryOnes = (a % 10) + (b % 10) >= 10;
      const carryTens = (Math.floor(a / 10) % 10) + Math.floor(b / 10) >= 10;
      const carries = carryOnes || carryTens;
      if (spec.carry === null || spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_2d_pvfriendly() {
    const a = randInt(11, 98) * 10; // three-digit ending in 0
    const b = randInt(11, 89);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_3d(spec) {
    let a, b;
    do {
      a = randInt(101, 799); b = randInt(101, 799);
      const carryOnes = (a % 10) + (b % 10) >= 10;
      const carryTens = (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 10;
      const carryHund = Math.floor(a / 100) + Math.floor(b / 100) >= 10;
      const carries = carryOnes || carryTens || carryHund;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_3d_3d_pvfriendly() {
    const a = randInt(11, 89) * 10, b = randInt(11, 89) * 10;
    return buildQ(a, b, "+", a + b);
  },
  add_4d_single(spec) {
    let a, b;
    do {
      a = randInt(1001, 8999); b = randInt(1, 9);
      const carries = (a % 10) + b >= 10;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_4d_mult10(spec) {
    let a, b;
    do {
      a = randInt(1001, 8999); b = randInt(1, 8) * 10;
      const carries = (Math.floor(a / 10) % 10) + (b / 10) >= 10;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_4d_mult100(spec) {
    let a, b;
    do {
      a = randInt(1001, 8999); b = randInt(1, 8) * 100;
      const carries = (Math.floor(a / 100) % 10) + (b / 100) >= 10;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_4d_mult1000() {
    const a = randInt(1001, 8999), b = randInt(1, 8) * 1000;
    return buildQ(a, b, "+", a + b);
  },
  add_4d_2d(spec) {
    let a, b;
    do {
      a = randInt(1001, 8999); b = randInt(11, 89);
      const carries = ((a % 10) + (b % 10) >= 10) || ((Math.floor(a / 10) % 10) + Math.floor(b / 10) >= 10);
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_4d_3d(spec) {
    let a, b;
    do {
      a = randInt(1001, 8999); b = randInt(101, 899);
      const c1 = (a % 10) + (b % 10) >= 10;
      const c2 = (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 10;
      const c3 = (Math.floor(a / 100) % 10) + Math.floor(b / 100) >= 10;
      const carries = c1 || c2 || c3;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_4d_4d(spec) {
    let a, b;
    do {
      a = randInt(1001, 6999); b = randInt(1001, 2999);
      const c1 = (a % 10) + (b % 10) >= 10;
      const c2 = (Math.floor(a / 10) % 10) + (Math.floor(b / 10) % 10) >= 10;
      const c3 = (Math.floor(a / 100) % 10) + (Math.floor(b / 100) % 10) >= 10;
      const c4 = Math.floor(a / 1000) + Math.floor(b / 1000) >= 10;
      const carries = c1 || c2 || c3 || c4;
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", a + b);
  },
  add_mixed_placevalue() {
    const a = randInt(11, 89) * 10, b = randInt(1, 9) * 10;
    return buildQ(a, b, "+", a + b);
  },
  add_tenths(spec) {
    let a, b;
    do {
      a = round1(randInt(1, 9) / 10); b = round1(randInt(1, 9) / 10);
      const bridges = round1(a + b) >= 1;
      if (spec.bridge === bridges) break;
    } while (true);
    return buildQ(a, b, "+", round1(a + b));
  },
  add_whole_tenths() {
    const a = randInt(1, 9), b = round1(randInt(1, 9) / 10);
    return buildQ(a, b, "+", round1(a + b));
  },
  add_whole_decimal_bridge() {
    const a = randInt(1, 9), b = round1(randInt(1, 9) / 10);
    return buildQ(a, b, "+", round1(a + b));
  },
  add_decimal_mult10_100(spec) {
    const a = round1(randInt(11, 98) / 10);
    const b = spec.small ? randInt(1, 9) * 10 : randInt(1, 9) * 100;
    return buildQ(a, b, "+", round1(a + b));
  },
  add_decimal_decimal_1dp() {
    const a = round1(randInt(11, 98) / 10), b = round1(randInt(11, 98) / 10);
    return buildQ(a, b, "+", round1(a + b));
  },
  add_tenths_carry() {
    let a, b;
    do {
      a = round1(randInt(11, 98) / 10); b = round1(randInt(11, 98) / 10);
    } while (Math.round((a * 10) % 10 + (b * 10) % 10) < 10);
    return buildQ(a, b, "+", round1(a + b));
  },
  add_hundredths(spec) {
    let a, b;
    do {
      a = round2(randInt(101, 989) / 100); b = round2(randInt(101, 989) / 100);
      const centsA = Math.round(a * 100) % 10, centsB = Math.round(b * 100) % 10;
      const tenthsA = Math.floor(Math.round(a * 100) / 10) % 10, tenthsB = Math.floor(Math.round(b * 100) / 10) % 10;
      const bridges = (centsA + centsB >= 10) || (tenthsA + tenthsB >= 10);
      if (spec.bridge === bridges) break;
    } while (true);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_decimal_whole_2dp() {
    const a = round2(randInt(101, 989) / 100), b = randInt(1, 9);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_tenths_hundredths() {
    const a = round1(randInt(11, 98) / 10), b = round2(randInt(101, 989) / 100);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_2dp_2dp(spec) {
    let a, b;
    do {
      a = round2(randInt(101, 899) / 100); b = round2(randInt(101, 899) / 100);
      const centsA = Math.round(a * 100) % 10, centsB = Math.round(b * 100) % 10;
      const tenthsA = Math.floor(Math.round(a * 100) / 10) % 10, tenthsB = Math.floor(Math.round(b * 100) / 10) % 10;
      const carries = (centsA + centsB >= 10) || (tenthsA + tenthsB >= 10);
      if (spec.carry === carries) break;
    } while (true);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_decimal_whole_pv() {
    const a = round2(randInt(1101, 9899) / 100), b = randInt(1, 9);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_2decimals_2dp() {
    const a = round2(randInt(1101, 9899) / 100), b = round2(randInt(1101, 9899) / 100);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_mixed_decimal_lengths() {
    const a = round1(randInt(11, 98) / 10), b = round2(randInt(101, 989) / 100);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_large_whole_decimal() {
    const a = randInt(101, 899), b = round2(randInt(101, 989) / 100);
    return buildQ(a, b, "+", round2(a + b));
  },
  add_large_decimal() {
    const a = round2(randInt(10100, 98900) / 100), b = round2(randInt(10100, 98900) / 100);
    return buildQ(a, b, "+", round2(a + b));
  },

  // ---------------- SUBTRACTION ----------------
  sub_single(spec) {
    let a, b;
    if (spec.close) {
      a = randInt(4, 9); b = a - randInt(1, 2);
    } else {
      a = randInt(3, 9); b = randInt(1, a - 1);
    }
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_teen_single(spec) {
    let a, b;
    do {
      a = randInt(11, 19); b = randInt(1, 9);
      const borrows = (a % 10) < b;
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_mult10_single() {
    const a = randInt(2, 9) * 10, b = randInt(1, 9);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_mult10_mult10() {
    const a = randInt(2, 9) * 10, b = randInt(1, a / 10 - 1) * 10 || 10;
    const bb = Math.min(b, a - 10);
    return buildQ(a, bb, "\u2212", a - bb);
  },
  sub_2d_single(spec) {
    let a, b;
    do {
      a = randInt(12, 98); b = randInt(1, 9);
      const borrows = (a % 10) < b;
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_2d_mult10() {
    const a = randInt(21, 98), b = randInt(1, Math.floor(a / 10)) * 10;
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_2d_2d(spec) {
    let a, b;
    do {
      a = randInt(21, 98); b = randInt(11, a - 1);
      const borrows = (a % 10) < (b % 10);
      if (spec.borrow === null || spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_mult100_mult100() {
    const a = randInt(2, 9) * 100, b = randInt(1, a / 100 - 1) * 100 || 100;
    return buildQ(a, Math.min(b, a - 100), "\u2212", a - Math.min(b, a - 100));
  },
  sub_3d_single(spec) {
    let a, b;
    do {
      a = randInt(102, 989); b = randInt(1, 9);
      const borrows = (a % 10) < b;
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_3d_mult10(spec) {
    let a, b;
    do {
      a = randInt(102, 989); b = randInt(1, 8) * 10;
      const borrows = (a % 100 - (a % 10)) < b; // tens digit comparison
      const tensA = Math.floor(a / 10) % 10;
      const borrows2 = tensA < (b / 10);
      if (spec.borrow === borrows2) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_3d_mult100() {
    const a = randInt(102, 989), hunA = Math.floor(a / 100);
    const b = randInt(1, Math.max(1, hunA)) * 100;
    const bb = Math.min(b, a - 1);
    return buildQ(a, bb, "\u2212", a - bb);
  },
  sub_3d_2d(spec) {
    let a, b;
    do {
      a = randInt(102, 989); b = randInt(11, 89);
      const borrows = (a % 10) < (b % 10);
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_3d_2d_pvfriendly() {
    const a = randInt(11, 98) * 10, b = randInt(11, 89);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_3d_3d(spec) {
    let a, b;
    do {
      a = randInt(200, 989); b = randInt(100, a - 1);
      const borrows = ((a % 10) < (b % 10)) || ((Math.floor(a / 10) % 10) < (Math.floor(b / 10) % 10));
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_3d_3d_pvfriendly() {
    const a = randInt(20, 98) * 10, b = randInt(10, a / 10 - 1) * 10;
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_3d_mult10_100() {
    const a = randInt(200, 989);
    const b = Math.random() < 0.5 ? randInt(1, 8) * 10 : randInt(1, 8) * 100;
    const bb = Math.min(b, a - 1);
    return buildQ(a, bb, "\u2212", a - bb);
  },
  sub_4d_single(spec) {
    let a, b;
    do {
      a = randInt(1002, 8999); b = randInt(1, 9);
      const borrows = (a % 10) < b;
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_4d_mult10(spec) {
    let a, b;
    do {
      a = randInt(1002, 8999); b = randInt(1, 8) * 10;
      const tensA = Math.floor(a / 10) % 10;
      const borrows = tensA < (b / 10);
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_4d_mult100(spec) {
    let a, b;
    do {
      a = randInt(1002, 8999); b = randInt(1, 8) * 100;
      const hundA = Math.floor(a / 100) % 10;
      const borrows = hundA < (b / 100);
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_4d_mult1000() {
    const a = randInt(2000, 8999), thouA = Math.floor(a / 1000);
    const b = randInt(1, Math.max(1, thouA)) * 1000;
    const bb = Math.min(b, a - 1);
    return buildQ(a, bb, "\u2212", a - bb);
  },
  sub_4d_2d(spec) {
    let a, b;
    do {
      a = randInt(1002, 8999); b = randInt(11, 89);
      const borrows = (a % 10) < (b % 10);
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_4d_3d(spec) {
    let a, b;
    do {
      a = randInt(1002, 8999); b = randInt(102, 899);
      const borrows = ((a % 10) < (b % 10)) || ((Math.floor(a / 10) % 10) < (Math.floor(b / 10) % 10));
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_4d_4d(spec) {
    let a, b;
    do {
      a = randInt(2000, 8999); b = randInt(1000, a - 1);
      const borrows = ((a % 10) < (b % 10)) || ((Math.floor(a / 10) % 10) < (Math.floor(b / 10) % 10)) || ((Math.floor(a / 100) % 10) < (Math.floor(b / 100) % 10));
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", a - b);
  },
  sub_tenths() {
    const a = round1(randInt(2, 9) / 10);
    const b = round1(randInt(1, Math.round(a * 10) - 1) / 10);
    return buildQ(a, b, "\u2212", round1(a - b));
  },
  sub_whole_tenths() {
    const a = randInt(1, 9), b = round1(randInt(1, 9) / 10);
    return buildQ(a, b, "\u2212", round1(a - b));
  },
  sub_whole_decimal_cross() {
    const a = randInt(1, 9), b = round1(randInt(1, 9) / 10);
    return buildQ(a, b, "\u2212", round1(a - b));
  },
  sub_decimal_mult10_100(spec) {
    const b = spec.small ? randInt(1, 9) * 10 : randInt(1, 9) * 100;
    const a = round1(b + randInt(1, 90) / 10);
    return buildQ(a, b, "\u2212", round1(a - b));
  },
  sub_decimal_decimal_1dp() {
    const a = round1(randInt(20, 98) / 10), b = round1(randInt(10, Math.round(a * 10) - 1) / 10);
    return buildQ(a, b, "\u2212", round1(a - b));
  },
  sub_tenths_borrow() {
    let a, b;
    do {
      a = round1(randInt(11, 98) / 10); b = round1(randInt(11, Math.round(a * 10) - 1) / 10);
    } while ((Math.round(a * 10) % 10) >= (Math.round(b * 10) % 10));
    return buildQ(a, b, "\u2212", round1(a - b));
  },
  sub_hundredths(spec) {
    let a, b;
    do {
      a = round2(randInt(200, 989) / 100); b = round2(randInt(100, Math.round(a * 100) - 1) / 100);
      const centsA = Math.round(a * 100) % 10, centsB = Math.round(b * 100) % 10;
      const borrows = centsA < centsB;
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_decimal_whole() {
    const a = round2(randInt(200, 989) / 100), b = randInt(1, Math.floor(a));
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_tenths_hundredths() {
    const a = round1(randInt(20, 98) / 10), b = round2(randInt(100, Math.round(a * 100) - 1) / 100);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_2dp_2dp(spec) {
    let a, b;
    do {
      a = round2(randInt(200, 899) / 100); b = round2(randInt(100, Math.round(a * 100) - 1) / 100);
      const centsA = Math.round(a * 100) % 10, centsB = Math.round(b * 100) % 10;
      const tenthsA = Math.floor(Math.round(a * 100) / 10) % 10, tenthsB = Math.floor(Math.round(b * 100) / 10) % 10;
      const borrows = (centsA < centsB) || (tenthsA < tenthsB);
      if (spec.borrow === borrows) break;
    } while (true);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_decimal_whole_pv() {
    const a = round2(randInt(1100, 9899) / 100), b = randInt(1, 9);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_2decimals_2dp() {
    const a = round2(randInt(1100, 9899) / 100), b = round2(randInt(1000, Math.round(a * 100) - 1) / 100);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_mixed_decimal_lengths() {
    const a = round1(randInt(20, 98) / 10), b = round2(randInt(100, Math.round(a * 100) - 1) / 100);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_whole_decimal_large() {
    const a = randInt(101, 899), b = round2(randInt(100, 989) / 100);
    return buildQ(a, b, "\u2212", round2(a - b));
  },
  sub_large_decimal() {
    const a = round2(randInt(20000, 98900) / 100), b = round2(randInt(10000, Math.round(a * 100) - 1) / 100);
    return buildQ(a, b, "\u2212", round2(a - b));
  },

  // ---------------- MULTIPLICATION ----------------
  mul_fact(spec) {
    const table = pick(spec.tables);
    const other = randInt(2, 9);
    const swap = Math.random() < 0.5;
    const a = swap ? other : table, b = swap ? table : other;
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_fact_both(spec) {
    const a = randInt(spec.lo, spec.hi), b = randInt(spec.lo, spec.hi);
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_single_x(spec) {
    const a = randInt(2, 9);
    const b = spec.mult || pick(spec.multSet);
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_single_mult10() {
    const a = randInt(2, 9), b = randInt(1, 9) * 10;
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_mult10_mult10() {
    const a = randInt(1, 9) * 10, b = randInt(1, 9) * 10;
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_single_mult100() {
    const a = randInt(2, 9), b = randInt(1, 9) * 100;
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_mult10_mult100() {
    const a = randInt(1, 9) * 10, b = randInt(1, 9) * 100;
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_mult10_single() {
    const a = randInt(1, 9) * 10, b = randInt(2, 9);
    return buildQ(a, b, "\u00d7", a * b);
  },
  mul_2d_1d(spec) {
    let a, b;
    do {
      a = randInt(spec.twoDigitRange[0], spec.twoDigitRange[1]);
      b = randInt(2, 9);
      const regroups = ((a % 10) * b) >= 10;
      if (spec.regroup === null || spec.regroup === regroups) break;
    } while (true);
    return buildQ(a, b, "\u00d7", a * b);
  },

  // ---------------- DIVISION ----------------
  div_fact(spec) {
    const divisor = pick(spec.tables);
    const quotient = randInt(2, 12);
    return buildQ(divisor * quotient, divisor, "\u00f7", quotient);
  },
  div_fact_full(spec) {
    const divisor = randInt(spec.lo, spec.hi), quotient = randInt(spec.lo, spec.hi);
    return buildQ(divisor * quotient, divisor, "\u00f7", quotient);
  },
  div_mult10_by10() {
    const quotient = randInt(2, 12);
    const dividend = quotient * 10;
    return buildQ(dividend, 10, "\u00f7", quotient);
  },
  div_mult10_single(spec) {
    const divisor = randInt(2, 9);
    let quotient, dividend;
    do {
      quotient = randInt(2, 12);
      dividend = divisor * quotient;
    } while (dividend % 10 !== 0 || dividend > spec.maxDividend);
    return buildQ(dividend, divisor, "\u00f7", quotient);
  },
  div_mult100_single() {
    const divisor = randInt(2, 9);
    let quotient, dividend;
    do {
      quotient = randInt(2, 12);
      dividend = divisor * quotient * 10;
    } while (dividend % 100 !== 0);
    return buildQ(dividend, divisor, "\u00f7", quotient);
  },
  div_mult100_by10() {
    const quotient = randInt(10, 90);
    const dividend = quotient * 10;
    // ensure dividend is a multiple of 100
    const d100 = Math.round(dividend / 100) * 100;
    return buildQ(d100, 10, "\u00f7", d100 / 10);
  },
  div_mult100_mult10() {
    const divisor = randInt(1, 9) * 10;
    const quotient = randInt(2, 9);
    const dividend = divisor * quotient;
    return buildQ(dividend, divisor, "\u00f7", quotient);
  },
  div_mult10_single_over12() {
    const divisor = randInt(2, 9);
    let quotient, dividend;
    do {
      quotient = randInt(13, 20);
      dividend = divisor * quotient;
    } while (dividend % 10 !== 0);
    return buildQ(dividend, divisor, "\u00f7", quotient);
  },
  div_2d_1d_exact_over12(spec) {
    let divisor, quotient, dividend;
    do {
      divisor = randInt(2, 9);
      quotient = randInt(2, 16);
      dividend = divisor * quotient;
    } while (dividend > spec.maxDividend || dividend < 10 || divisor * quotient <= 12);
    return buildQ(dividend, divisor, "\u00f7", quotient);
  }
};
