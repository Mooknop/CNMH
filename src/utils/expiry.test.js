import {
  boundariesCrossedBy,
  boundariesBetween,
  resolveExpireAt,
  isExpired,
  expiryLabel,
  expiryLabelSecs,
} from './expiry';

// Helpers
const entry = (entryId, kind = 'pc', charId) => ({
  entryId,
  kind,
  charId: charId || entryId,
  name: entryId,
  initiative: 20,
});

const encounter = (round, currentTurnIndex, order) => ({
  phase: 'in-progress',
  round,
  currentTurnIndex,
  order,
});

const pellias = entry('p1');
const ashka = entry('p2');
const goblin = entry('g1', 'enemy');

// ── boundariesCrossedBy ───────────────────────────────────────────────────────

describe('boundariesCrossedBy', () => {
  const order = [pellias, ashka, goblin];

  it('includes outgoing turn-end for the current entry', () => {
    const enc = encounter(1, 0, order); // Pellias's turn
    const bs = boundariesCrossedBy(enc, 1, 1); // advance to Ashka
    expect(bs).toContainEqual({ round: 1, entryId: 'p1', boundary: 'turn-end' });
  });

  it('includes incoming turn-start for the next entry', () => {
    const enc = encounter(1, 0, order);
    const bs = boundariesCrossedBy(enc, 1, 1);
    expect(bs).toContainEqual({ round: 1, entryId: 'p2', boundary: 'turn-start' });
  });

  it('does NOT include round-end when round does not change', () => {
    const enc = encounter(1, 0, order);
    const bs = boundariesCrossedBy(enc, 1, 1);
    expect(bs.some((b) => b.boundary === 'round-end')).toBe(false);
  });

  it('includes round-end when round wraps', () => {
    const enc = encounter(1, 2, order); // Goblin's turn (last)
    const bs = boundariesCrossedBy(enc, 0, 2); // wrap to Pellias, round 2
    expect(bs).toContainEqual({ round: 1, boundary: 'round-end' });
  });

  it('incoming turn-start uses nextRound not curRound after wrap', () => {
    const enc = encounter(1, 2, order);
    const bs = boundariesCrossedBy(enc, 0, 2);
    expect(bs).toContainEqual({ round: 2, entryId: 'p1', boundary: 'turn-start' });
  });

  it('handles empty order without throwing', () => {
    const enc = encounter(1, 0, []);
    expect(() => boundariesCrossedBy(enc, 0, 1)).not.toThrow();
  });
});

// ── boundariesBetween (#443 — Foundry-driven transitions) ─────────────────────

describe('boundariesBetween', () => {
  const order = [pellias, ashka, goblin];

  it('reads outgoing from prev.order and incoming from next.order', () => {
    const prev = { order, currentTurnIndex: 0, round: 1 }; // Pellias
    const next = { order, currentTurnIndex: 1, round: 1 }; // Ashka
    const bs = boundariesBetween(prev, next);
    expect(bs).toContainEqual({ round: 1, entryId: 'p1', boundary: 'turn-end' });
    expect(bs).toContainEqual({ round: 1, entryId: 'p2', boundary: 'turn-start' });
    expect(bs.some((b) => b.boundary === 'round-end')).toBe(false);
  });

  it('adds round-end when the round advances', () => {
    const prev = { order, currentTurnIndex: 2, round: 1 }; // Goblin
    const next = { order, currentTurnIndex: 0, round: 2 }; // Pellias, round 2
    const bs = boundariesBetween(prev, next);
    expect(bs).toContainEqual({ round: 1, boundary: 'round-end' });
    expect(bs).toContainEqual({ round: 2, entryId: 'p1', boundary: 'turn-start' });
  });

  it('stays correct when the bridge re-sorts order between turns (entryIds stable)', () => {
    // Outgoing index points at Pellias in the OLD order; the bridge then
    // re-sorts so the same index now holds a different entry — the incoming
    // entry must come from next.order, the outgoing from prev.order.
    const prevOrder = [pellias, ashka, goblin];
    const nextOrder = [goblin, pellias, ashka]; // re-sorted
    const prev = { order: prevOrder, currentTurnIndex: 0, round: 1 }; // Pellias out
    const next = { order: nextOrder, currentTurnIndex: 2, round: 1 }; // Ashka in
    const bs = boundariesBetween(prev, next);
    expect(bs).toContainEqual({ round: 1, entryId: 'p1', boundary: 'turn-end' });   // Pellias from prev
    expect(bs).toContainEqual({ round: 1, entryId: 'p2', boundary: 'turn-start' }); // Ashka from next
  });
});

// ── resolveExpireAt ───────────────────────────────────────────────────────────

describe('resolveExpireAt', () => {
  const enc = encounter(2, 0, [pellias, ashka]);

  it('caster-turn-end → current round, caster entryId, turn-end boundary', () => {
    const ea = resolveExpireAt({ until: 'caster-turn-end' }, enc, 'p1', 'p2');
    expect(ea).toEqual({ round: 2, entryId: 'p1', boundary: 'turn-end' });
  });

  it('caster-turn-start → round+1, caster entryId, turn-start boundary', () => {
    const ea = resolveExpireAt({ until: 'caster-turn-start' }, enc, 'p1', 'p2');
    expect(ea).toEqual({ round: 3, entryId: 'p1', boundary: 'turn-start' });
  });

  it('target-turn-end → current round, target entryId, turn-end boundary', () => {
    const ea = resolveExpireAt({ until: 'target-turn-end' }, enc, 'p1', 'p2');
    expect(ea).toEqual({ round: 2, entryId: 'p2', boundary: 'turn-end' });
  });

  it('target-turn-start → round+1, target entryId, turn-start boundary', () => {
    const ea = resolveExpireAt({ until: 'target-turn-start' }, enc, 'p1', 'p2');
    expect(ea).toEqual({ round: 3, entryId: 'p2', boundary: 'turn-start' });
  });

  it('round-end → current round, no entryId, round-end boundary', () => {
    const ea = resolveExpireAt({ until: 'round-end' }, enc, 'p1');
    expect(ea).toEqual({ round: 2, boundary: 'round-end' });
  });

  it('rounds: N → round+N, caster entryId, turn-end boundary', () => {
    const ea = resolveExpireAt({ until: 'rounds', rounds: 10 }, enc, 'p1');
    expect(ea).toEqual({ round: 12, entryId: 'p1', boundary: 'turn-end' });
  });

  it('rounds: 1 → round+1', () => {
    const ea = resolveExpireAt({ until: 'rounds', rounds: 1 }, enc, 'p1');
    expect(ea.round).toBe(3);
  });

  it('manual → returns null', () => {
    expect(resolveExpireAt({ until: 'manual' }, enc, 'p1')).toBeNull();
  });

  it('null duration → returns null', () => {
    expect(resolveExpireAt(null, enc, 'p1')).toBeNull();
  });

  it('undefined duration → returns null', () => {
    expect(resolveExpireAt(undefined, enc, 'p1')).toBeNull();
  });

  it('unknown until value → returns null', () => {
    expect(resolveExpireAt({ until: 'forever' }, enc, 'p1')).toBeNull();
  });

  it('target-turn-end falls back to caster when no targetEntryId given', () => {
    const ea = resolveExpireAt({ until: 'target-turn-end' }, enc, 'p1', undefined);
    expect(ea.entryId).toBe('p1');
  });
});

// ── isExpired ─────────────────────────────────────────────────────────────────

describe('isExpired', () => {
  it('null expireAt → never expired', () => {
    const boundaries = [{ round: 5, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(null, boundaries)).toBe(false);
  });

  it('turn-end: expired when matching entryId + same round', () => {
    const expireAt = { round: 2, entryId: 'p1', boundary: 'turn-end' };
    const bs = [{ round: 2, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(true);
  });

  it('turn-end: expired when matching entryId + later round', () => {
    const expireAt = { round: 2, entryId: 'p1', boundary: 'turn-end' };
    const bs = [{ round: 3, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(true);
  });

  it('turn-end: NOT expired when different entryId', () => {
    const expireAt = { round: 2, entryId: 'p1', boundary: 'turn-end' };
    const bs = [{ round: 2, entryId: 'p2', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(false);
  });

  it('turn-end: NOT expired when earlier round', () => {
    const expireAt = { round: 3, entryId: 'p1', boundary: 'turn-end' };
    const bs = [{ round: 2, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(false);
  });

  it('turn-start: expired when matching entryId + same round', () => {
    const expireAt = { round: 3, entryId: 'p2', boundary: 'turn-start' };
    const bs = [{ round: 3, entryId: 'p2', boundary: 'turn-start' }];
    expect(isExpired(expireAt, bs)).toBe(true);
  });

  it('turn-start: NOT expired when boundary type differs (turn-end vs turn-start)', () => {
    const expireAt = { round: 2, entryId: 'p1', boundary: 'turn-start' };
    const bs = [{ round: 2, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(false);
  });

  it('round-end: expired when same round', () => {
    const expireAt = { round: 2, boundary: 'round-end' };
    const bs = [{ round: 2, boundary: 'round-end' }];
    expect(isExpired(expireAt, bs)).toBe(true);
  });

  it('round-end: expired when later round', () => {
    const expireAt = { round: 2, boundary: 'round-end' };
    const bs = [{ round: 4, boundary: 'round-end' }];
    expect(isExpired(expireAt, bs)).toBe(true);
  });

  it('round-end: NOT expired when earlier round', () => {
    const expireAt = { round: 3, boundary: 'round-end' };
    const bs = [{ round: 2, boundary: 'round-end' }];
    expect(isExpired(expireAt, bs)).toBe(false);
  });

  it('empty boundaries → not expired', () => {
    const expireAt = { round: 1, entryId: 'p1', boundary: 'turn-end' };
    expect(isExpired(expireAt, [])).toBe(false);
  });

  it('multiple boundaries — expires if ANY match', () => {
    const expireAt = { round: 1, boundary: 'round-end' };
    const bs = [
      { round: 1, entryId: 'p1', boundary: 'turn-end' },
      { round: 1, boundary: 'round-end' },
    ];
    expect(isExpired(expireAt, bs)).toBe(true);
  });

  it('rounds-based expiry (turn-end, future round) — not yet expired', () => {
    const expireAt = { round: 12, entryId: 'p1', boundary: 'turn-end' };
    const bs = [{ round: 3, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(false);
  });

  it('rounds-based expiry — expires when round matches', () => {
    const expireAt = { round: 12, entryId: 'p1', boundary: 'turn-end' };
    const bs = [{ round: 12, entryId: 'p1', boundary: 'turn-end' }];
    expect(isExpired(expireAt, bs)).toBe(true);
  });
});

// ── expiryLabel ───────────────────────────────────────────────────────────────

describe('expiryLabel', () => {
  it('returns null for no expireAt', () => {
    expect(expiryLabel(null)).toBeNull();
    expect(expiryLabel(undefined)).toBeNull();
  });

  it('round-end label', () => {
    expect(expiryLabel({ round: 3, boundary: 'round-end' })).toBe('Round 3 end');
  });

  it('turn-end label', () => {
    expect(expiryLabel({ round: 2, entryId: 'p1', boundary: 'turn-end' })).toBe('R2 turn-end');
  });

  it('turn-start label', () => {
    expect(expiryLabel({ round: 4, entryId: 'p2', boundary: 'turn-start' })).toBe('R4 turn-start');
  });
});

// ── expiryLabelSecs (clock-based immunity timers) ─────────────────────────────

describe('expiryLabelSecs', () => {
  // 5 Pharast 4725 08:00 in absolute game seconds (see gameTime).
  const now = (25 * 365 + 3 + 31 + 28) * 86400 + 8 * 3600;

  it('returns null when no expiry given', () => {
    expect(expiryLabelSecs(null, now)).toBeNull();
    expect(expiryLabelSecs(undefined, now)).toBeNull();
  });

  it('labels a same-day expiry as a bare time', () => {
    expect(expiryLabelSecs(now + 3600, now)).toBe('09:00');
  });

  it('labels a next-day expiry as tomorrow', () => {
    expect(expiryLabelSecs(now + 86400, now)).toBe('tomorrow 08:00');
  });
});
