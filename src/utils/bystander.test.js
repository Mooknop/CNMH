import { describe, it, expect } from 'vitest';
import {
  BYSTANDER_IMMUNITY_SECS,
  ARMED_SENSE_MOTIVE_BONUS,
  normalizeBystander,
  bystanderImmunityEntry,
  isBystanderImmune,
  pruneBystanderImmunities,
  bystanderObservers,
  immuneObservers,
  fooledObservers,
  suppressesReactionsAgainst,
  bystanderHiding,
  isHostileUse,
  isNonAllyEntry,
  stampBystanderReveal,
  clearBystanderDeclaration,
  declareBystander,
  armedSenseMotiveHint,
} from './bystander';

const NOW = 1_000_000;
const IZZY = 'izzy';

// A bridge-linked enemy carries a stable creatureKey (shared by every same-type
// creature); an unlinked/homebrew one falls back to its entryId.
const ORDER = [
  { entryId: 'e-izzy', kind: 'pc', charId: IZZY, name: 'Izzy' },
  { entryId: 'e-g1', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' },
  { entryId: 'e-g2', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' },
  { entryId: 'e-bandit', kind: 'enemy', name: 'Bandit' },
  { entryId: 'e-sum', kind: 'summon', name: 'Summoned Wolf' },
];

const declared = (extra = {}) => ({ active: true, mod: 'deception', ts: 1, ...extra });

describe('normalizeBystander', () => {
  it('fills in the #465 fields a pre-#465 payload never carried', () => {
    expect(normalizeBystander({ active: true, mod: 'deception', ts: 7 })).toEqual({
      active: true, mod: 'deception', ts: 7, revealed: false, revealedTs: 0, immune: {},
    });
  });

  it('treats null/garbage as idle', () => {
    expect(normalizeBystander(null).active).toBe(false);
    expect(normalizeBystander({ immune: 'nope' }).immune).toEqual({});
  });
});

describe('observers', () => {
  it('are the non-ally combatants, deduped by persistent creature key', () => {
    expect(bystanderObservers(ORDER)).toEqual([
      { key: 'creature:ghoul', name: 'Ghoul' },
      { key: 'e-bandit', name: 'Bandit' },
    ]);
  });

  it('never include PCs or summons', () => {
    const keys = bystanderObservers(ORDER).map((o) => o.key);
    expect(keys).not.toContain('e-izzy');
    expect(keys).not.toContain('e-sum');
  });

  it('never include a FRIENDLY-disposition NPC (#1537 S6 ally pane)', () => {
    const withAlly = [
      ...ORDER,
      { entryId: 'e-ally', kind: 'enemy', name: 'Town Guard', disposition: 1 },
    ];
    expect(bystanderObservers(withAlly).map((o) => o.name)).toEqual(['Ghoul', 'Bandit']);
  });

  // The predicate both halves of the feature must agree on: the observer set
  // and the callers' hostile-target sets are filtered through the same one.
  it('isNonAllyEntry sorts combatants the same way for callers', () => {
    expect(isNonAllyEntry({ kind: 'enemy', name: 'Ghoul' })).toBe(true);
    expect(isNonAllyEntry({ kind: 'enemy', name: 'Town Guard', disposition: 1 })).toBe(false);
    expect(isNonAllyEntry({ kind: 'pc', charId: IZZY })).toBe(false);
    expect(isNonAllyEntry({ kind: 'summon' })).toBe(false);
    expect(isNonAllyEntry(null)).toBe(false);
    expect(isNonAllyEntry(undefined)).toBe(false);
  });
});

describe('per-creature 1-day immunity', () => {
  it('stamps an entry that expires exactly one day out on the game clock', () => {
    const entry = bystanderImmunityEntry({ charId: IZZY, creatureName: 'Ghoul', nowSecs: NOW });
    expect(entry.expireAtSecs).toBe(NOW + BYSTANDER_IMMUNITY_SECS);
    expect(entry.abilityKey).toBe('harmless-bystander');
    expect(entry.appliedBy).toBe(IZZY);
    expect(entry.creatureName).toBe('Ghoul');
  });

  it('reads as immune until the clock passes the expiry', () => {
    const state = stampBystanderReveal(declared(), bystanderObservers(ORDER), {
      charId: IZZY, nowSecs: NOW,
    });
    expect(isBystanderImmune(state, 'creature:ghoul', { charId: IZZY, nowSecs: NOW + 3600 })).toBe(true);
    expect(isBystanderImmune(state, 'creature:ghoul', { charId: IZZY, nowSecs: NOW + 86401 })).toBe(false);
  });

  it('is per-caster: another PC’s declaration is not covered', () => {
    const state = stampBystanderReveal(declared(), [{ key: 'creature:ghoul', name: 'Ghoul' }], {
      charId: IZZY, nowSecs: NOW,
    });
    expect(isBystanderImmune(state, 'creature:ghoul', { charId: 'someone-else', nowSecs: NOW })).toBe(false);
  });

  it('never reports an unknown creature as immune', () => {
    expect(isBystanderImmune(declared(), 'creature:nobody', { charId: IZZY, nowSecs: NOW })).toBe(false);
    expect(isBystanderImmune(declared(), null, { charId: IZZY, nowSecs: NOW })).toBe(false);
  });

  it('prunes only expired entries', () => {
    const immune = {
      live: { expireAtSecs: NOW + 10 },
      dead: { expireAtSecs: NOW - 10 },
      exact: { expireAtSecs: NOW },
    };
    expect(Object.keys(pruneBystanderImmunities(immune, NOW))).toEqual(['live']);
    // No clock in scope → nothing is assumed expired.
    expect(Object.keys(pruneBystanderImmunities(immune, null)).sort()).toEqual(['dead', 'exact', 'live']);
  });
});

describe('reaction suppression', () => {
  it('suppresses reactions for creatures the disguise still fools', () => {
    const state = declared();
    expect(suppressesReactionsAgainst(state, 'creature:ghoul', { charId: IZZY, nowSecs: NOW })).toBe(true);
    expect(bystanderHiding(state)).toBe(true);
  });

  it('does not suppress when nothing was declared', () => {
    expect(suppressesReactionsAgainst({ active: false }, 'creature:ghoul', { charId: IZZY })).toBe(false);
  });

  it('lifts for every creature once she is recognized', () => {
    const state = stampBystanderReveal(declared(), bystanderObservers(ORDER), { charId: IZZY, nowSecs: NOW });
    expect(state.revealed).toBe(true);
    expect(bystanderHiding(state)).toBe(false);
    expect(suppressesReactionsAgainst(state, 'creature:ghoul', { charId: IZZY, nowSecs: NOW })).toBe(false);
    expect(suppressesReactionsAgainst(state, 'e-bandit', { charId: IZZY, nowSecs: NOW })).toBe(false);
  });

  it('never suppresses against a creature already immune from an earlier fight', () => {
    // Last fight's reveal, then the declaration is re-made in a NEW encounter.
    const after = stampBystanderReveal(declared(), [{ key: 'creature:ghoul', name: 'Ghoul' }], {
      charId: IZZY, nowSecs: NOW,
    });
    const redeclared = declareBystander(after, 'deception', NOW + 60);
    expect(redeclared.revealed).toBe(false);
    expect(suppressesReactionsAgainst(redeclared, 'creature:ghoul', { charId: IZZY, nowSecs: NOW + 60 })).toBe(false);
    expect(suppressesReactionsAgainst(redeclared, 'e-bandit', { charId: IZZY, nowSecs: NOW + 60 })).toBe(true);
  });

  it('splits the encounter into immune and still-fooled observers', () => {
    const state = declareBystander(
      stampBystanderReveal(declared(), [{ key: 'creature:ghoul', name: 'Ghoul' }], { charId: IZZY, nowSecs: NOW }),
      'deception',
      NOW,
    );
    const opts = { charId: IZZY, nowSecs: NOW };
    expect(immuneObservers(state, ORDER, opts).map((o) => o.name)).toEqual(['Ghoul']);
    expect(fooledObservers(state, ORDER, opts).map((o) => o.name)).toEqual(['Bandit']);
  });
});

describe('isHostileUse', () => {
  it('is true for an attack even with no app-side target selection', () => {
    expect(isHostileUse({ ability: { name: 'Strike' }, isAttack: true })).toBe(true);
  });

  it('is true when the use resolved against a non-ally', () => {
    expect(isHostileUse({ ability: { name: 'Fear' }, hostileTargets: [{ entryId: 'e-g1' }] })).toBe(true);
  });

  it('is false for a self/ally-facing use', () => {
    expect(isHostileUse({ ability: { name: 'Heal', traits: ['Healing'] }, hostileTargets: [] })).toBe(false);
    expect(isHostileUse({})).toBe(false);
  });

  // Regression: Escape is selfTarget AND carries the Attack trait
  // (src/data/skillActions.test.js). SkillActionModal zeroes both signals for a
  // self-targeted action; reading the trait behind its back used to blow the
  // disguise for squirming out of a grab — and stamp an irreversible day of
  // immunity on the whole encounter.
  it('never reads the Attack trait behind a caller that suppressed both signals', () => {
    expect(isHostileUse({
      ability: { name: 'Escape', selfTarget: true, traits: ['Attack'] },
      hostileTargets: [],
      isAttack: false,
    })).toBe(false);
  });

  it('ignores the ability entirely — the caller owns both signals', () => {
    expect(isHostileUse({ ability: { traits: ['Attack'] } })).toBe(false);
    expect(isHostileUse({ isAttack: true })).toBe(true);
  });
});

describe('clearBystanderDeclaration', () => {
  it('drops the declaration but keeps (and prunes) the immunity ledger', () => {
    const state = stampBystanderReveal(declared(), bystanderObservers(ORDER), { charId: IZZY, nowSecs: NOW });
    state.immune.stale = { expireAtSecs: NOW - 1 };
    const next = clearBystanderDeclaration(state, NOW);
    expect(next).toMatchObject({ active: false, mod: null, revealed: false, revealedTs: 0 });
    expect(Object.keys(next.immune).sort()).toEqual(['creature:ghoul', 'e-bandit']);
  });
});

describe('armedSenseMotiveHint', () => {
  const sword = { uid: 'w1', name: 'Longsword', state: 'held1', hand: 1, strikes: [{ name: 'Longsword' }] };
  const torch = { uid: 't1', name: 'Torch', state: 'held1', hand: 2, usage: 'held in 1 hand' };

  it('reports the +4 and the weapon when one is in hand', () => {
    expect(armedSenseMotiveHint([sword, torch])).toEqual({
      armed: true, bonus: ARMED_SENSE_MOTIVE_BONUS, weapons: ['Longsword'],
    });
  });

  it('is quiet with empty hands or non-weapons', () => {
    expect(armedSenseMotiveHint([torch])).toEqual({ armed: false, bonus: 0, weapons: [] });
    expect(armedSenseMotiveHint([])).toEqual({ armed: false, bonus: 0, weapons: [] });
    expect(armedSenseMotiveHint(undefined).armed).toBe(false);
  });

  it('counts a two-handed grip once', () => {
    const bow = { uid: 'b1', name: 'Longbow', state: 'held2', strikes: [{ name: 'Longbow' }] };
    expect(armedSenseMotiveHint([bow]).weapons).toEqual(['Longbow']);
  });
});
