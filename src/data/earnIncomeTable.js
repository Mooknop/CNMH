// PF2e Earn Income table (Core Rulebook p. 236), encoded for downtime
// resolution (#231). Every payout is stored in **copper pieces (cp)** so the
// numbers stay integers and never drift the way fractional gp would
// (1 sp = 10 cp, 1 gp = 100 cp). Convert to gp at credit time via earnIncome's
// cpToGp().
//
// Each row is indexed by task level (0–20):
//   dc        — the flat check DC for a task of that level
//   failed    — cp earned on a Failure (proficiency-independent)
//   trained / expert / master / legendary — cp earned on a Success, by the
//                                            character's proficiency rank
//
// Critical success normally pays the Success amount for a task one level
// higher; the resolver (earnIncome.js) handles that level+1 lookup. Level 20
// has no level 21, so its critical success uses the dedicated CRIT_SUCCESS_20
// row below (the table's "20 (critical success)" line).

export const EARN_INCOME_TABLE = [
  { level: 0,  dc: 14, failed: 1,   trained: 5,    expert: 5,     master: 5,     legendary: 5 },
  { level: 1,  dc: 15, failed: 2,   trained: 20,   expert: 20,    master: 20,    legendary: 20 },
  { level: 2,  dc: 16, failed: 4,   trained: 30,   expert: 30,    master: 30,    legendary: 30 },
  { level: 3,  dc: 18, failed: 8,   trained: 50,   expert: 50,    master: 50,    legendary: 50 },
  { level: 4,  dc: 19, failed: 10,  trained: 70,   expert: 80,    master: 80,    legendary: 80 },
  { level: 5,  dc: 20, failed: 20,  trained: 90,   expert: 100,   master: 100,   legendary: 100 },
  { level: 6,  dc: 22, failed: 30,  trained: 150,  expert: 200,   master: 200,   legendary: 200 },
  { level: 7,  dc: 23, failed: 40,  trained: 200,  expert: 250,   master: 250,   legendary: 250 },
  { level: 8,  dc: 24, failed: 50,  trained: 250,  expert: 300,   master: 300,   legendary: 300 },
  { level: 9,  dc: 26, failed: 60,  trained: 300,  expert: 400,   master: 400,   legendary: 400 },
  { level: 10, dc: 27, failed: 70,  trained: 400,  expert: 500,   master: 600,   legendary: 600 },
  { level: 11, dc: 28, failed: 80,  trained: 500,  expert: 600,   master: 800,   legendary: 800 },
  { level: 12, dc: 30, failed: 90,  trained: 600,  expert: 800,   master: 1000,  legendary: 1000 },
  { level: 13, dc: 31, failed: 100, trained: 700,  expert: 1000,  master: 1500,  legendary: 1500 },
  { level: 14, dc: 32, failed: 150, trained: 800,  expert: 1500,  master: 2000,  legendary: 2000 },
  { level: 15, dc: 34, failed: 200, trained: 1000, expert: 2000,  master: 2800,  legendary: 2800 },
  { level: 16, dc: 35, failed: 250, trained: 1300, expert: 2500,  master: 3600,  legendary: 4000 },
  { level: 17, dc: 36, failed: 300, trained: 1500, expert: 3000,  master: 4500,  legendary: 5500 },
  { level: 18, dc: 38, failed: 400, trained: 2000, expert: 4500,  master: 7000,  legendary: 9000 },
  { level: 19, dc: 39, failed: 600, trained: 3000, expert: 6000,  master: 10000, legendary: 13000 },
  { level: 20, dc: 40, failed: 800, trained: 4000, expert: 7500,  master: 15000, legendary: 20000 },
];

// The table's "20 (critical success)" row — what a level-20 task pays on a
// critical success, since there is no level-21 success column to roll up to.
// No `dc`/`failed`: it is only ever reached as a crit-success payout.
export const CRIT_SUCCESS_20 = {
  trained: 5000, expert: 9000, master: 17500, legendary: 30000,
};

export const MIN_TASK_LEVEL = 0;
export const MAX_TASK_LEVEL = 20;
