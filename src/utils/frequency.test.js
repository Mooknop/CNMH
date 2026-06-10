import {
  WINDOW_SECS,
  freqKeyFor,
  parseFrequency,
  checkFrequency,
  recordUse,
  clearUse,
  pruneLedgerByPer,
  lockMessage,
} from './frequency';

const NOW = 1_000_000; // arbitrary absolute game seconds

const liveEncounter = (round = 2) => ({
  active: true,
  phase: 'in-progress',
  round,
  currentTurnIndex: 0,
  order: [],
});

const rec = (over = {}) => ({ gameSecs: NOW - 60, realTs: 1, per: 'hour', ...over });

describe('freqKeyFor', () => {
  it('prefers ids, falls back to name slugs, and keeps abilities distinct', () => {
    expect(freqKeyFor({ id: 'feat-4', name: 'Battle Medicine' })).toBe('feat-4');
    expect(freqKeyFor({ name: 'Murmured Prayer' })).toBe('murmured-prayer');
    expect(freqKeyFor({ name: 'Guidance' })).toBe('guidance');
    expect(freqKeyFor({ name: 'Murmured Prayer' })).not.toBe(freqKeyFor({ name: 'Guidance' }));
    expect(freqKeyFor({})).toBeNull();
  });
});

describe('parseFrequency', () => {
  it('uses the structured frequencyRule first', () => {
    expect(parseFrequency({ frequencyRule: { per: 'hour', uses: 1 } }))
      .toEqual({ per: 'hour', uses: 1 });
    expect(parseFrequency({ frequencyRule: { per: 'day', uses: '3' } }))
      .toEqual({ per: 'day', uses: 3 });
  });

  it('rejects malformed rules instead of guessing', () => {
    expect(parseFrequency({ frequencyRule: { per: 'fortnight' } })).toBeNull();
  });

  it('derives once per turn from the Flourish trait', () => {
    expect(parseFrequency({ name: 'Flurry of Blows', traits: ['Flourish', 'Monk'] }))
      .toEqual({ per: 'turn', uses: 1 });
  });

  it('falls back to parsing the free-text frequency string', () => {
    expect(parseFrequency({ frequency: 'once per day' })).toEqual({ per: 'day', uses: 1 });
    expect(parseFrequency({ frequency: '3 times per hour' })).toEqual({ per: 'hour', uses: 3 });
    expect(parseFrequency({ frequency: 'at will' })).toBeNull();
  });

  it('returns null when no frequency is declared', () => {
    expect(parseFrequency({ name: 'Strike', traits: ['Attack'] })).toBeNull();
    expect(parseFrequency(null)).toBeNull();
  });
});

describe('checkFrequency — clock windows', () => {
  const rule = { per: 'hour', uses: 1 };

  it('locks inside the window and reports when it reopens', () => {
    const gate = checkFrequency({
      rule,
      records: [rec({ gameSecs: NOW - 600 })],
      nowSecs: NOW,
    });
    expect(gate.available).toBe(false);
    expect(gate.lockKind).toBe('window');
    expect(gate.availableAtSecs).toBe(NOW - 600 + WINDOW_SECS.hour);
  });

  it('unlocks at exactly the window boundary', () => {
    const gate = checkFrequency({
      rule,
      records: [rec({ gameSecs: NOW - WINDOW_SECS.hour })],
      nowSecs: NOW,
    });
    expect(gate.available).toBe(true);
  });

  it('handles day and week windows', () => {
    const day = { per: 'day', uses: 1 };
    const week = { per: 'week', uses: 1 };
    expect(checkFrequency({ rule: day, records: [rec({ per: 'day', gameSecs: NOW - 3600 })], nowSecs: NOW }).available).toBe(false);
    expect(checkFrequency({ rule: day, records: [rec({ per: 'day', gameSecs: NOW - WINDOW_SECS.day })], nowSecs: NOW }).available).toBe(true);
    expect(checkFrequency({ rule: week, records: [rec({ per: 'week', gameSecs: NOW - WINDOW_SECS.day })], nowSecs: NOW }).available).toBe(false);
  });

  it('ignores records stamped in the future (clock moved backwards)', () => {
    const gate = checkFrequency({
      rule,
      records: [rec({ gameSecs: NOW + 500 })],
      nowSecs: NOW,
    });
    expect(gate.available).toBe(true);
  });

  it('allows multiple uses up to the cap', () => {
    const rule3 = { per: 'hour', uses: 3 };
    const two = [rec({ gameSecs: NOW - 300 }), rec({ gameSecs: NOW - 200 })];
    expect(checkFrequency({ rule: rule3, records: two, nowSecs: NOW }).available).toBe(true);
    const three = [...two, rec({ gameSecs: NOW - 100 })];
    const gate = checkFrequency({ rule: rule3, records: three, nowSecs: NOW });
    expect(gate.available).toBe(false);
    // Reopens when the oldest active use ages out.
    expect(gate.availableAtSecs).toBe(NOW - 300 + WINDOW_SECS.hour);
  });

  it('is open with no records or no rule', () => {
    expect(checkFrequency({ rule, records: [], nowSecs: NOW }).available).toBe(true);
    expect(checkFrequency({ rule: null, records: [rec()], nowSecs: NOW }).available).toBe(true);
  });
});

describe('checkFrequency — per turn / per round', () => {
  const turnRule = { per: 'turn', uses: 1 };
  const roundRule = { per: 'round', uses: 1 };
  const used = rec({ per: 'turn', round: 2, entryId: 'e1' });

  it('locks per-turn on the same round and entry', () => {
    const gate = checkFrequency({
      rule: turnRule,
      records: [used],
      nowSecs: NOW,
      encounter: liveEncounter(2),
      casterEntryId: 'e1',
    });
    expect(gate).toMatchObject({ available: false, lockKind: 'turn' });
  });

  it('unlocks on the next round', () => {
    const gate = checkFrequency({
      rule: turnRule,
      records: [used],
      nowSecs: NOW,
      encounter: liveEncounter(3),
      casterEntryId: 'e1',
    });
    expect(gate.available).toBe(true);
  });

  it('does not lock a different combatant entry', () => {
    const gate = checkFrequency({
      rule: turnRule,
      records: [used],
      nowSecs: NOW,
      encounter: liveEncounter(2),
      casterEntryId: 'e2',
    });
    expect(gate.available).toBe(true);
  });

  it('per-round locks the whole round regardless of entry', () => {
    const gate = checkFrequency({
      rule: roundRule,
      records: [rec({ per: 'round', round: 2, entryId: 'e1' })],
      nowSecs: NOW,
      encounter: liveEncounter(2),
      casterEntryId: 'e2',
    });
    expect(gate).toMatchObject({ available: false, lockKind: 'round' });
  });

  it('is open outside an encounter and after the encounter ends', () => {
    expect(checkFrequency({ rule: turnRule, records: [used], nowSecs: NOW, encounter: null, casterEntryId: 'e1' }).available).toBe(true);
    const ended = { ...liveEncounter(2), active: false, phase: 'ended' };
    expect(checkFrequency({ rule: turnRule, records: [used], nowSecs: NOW, encounter: ended, casterEntryId: 'e1' }).available).toBe(true);
  });
});

describe('recordUse / clearUse / pruneLedgerByPer', () => {
  it('appends a record with the game time and per, pruning stale ones', () => {
    const rule = { per: 'hour', uses: 1 };
    const ledger = { 'eld-blast': [rec({ gameSecs: NOW - WINDOW_SECS.hour - 5 })] };
    const next = recordUse({ ledger, abilityKey: 'eld-blast', rule, nowSecs: NOW });
    expect(next['eld-blast']).toHaveLength(1); // stale record pruned
    expect(next['eld-blast'][0]).toMatchObject({ gameSecs: NOW, per: 'hour' });
    expect(next['eld-blast'][0].round).toBeUndefined();
    expect(ledger['eld-blast']).toHaveLength(1); // input untouched
  });

  it('stamps round and entryId during an active encounter', () => {
    const next = recordUse({
      ledger: {},
      abilityKey: 'flurry-of-blows',
      rule: { per: 'turn', uses: 1 },
      nowSecs: NOW,
      encounter: liveEncounter(4),
      casterEntryId: 'e9',
    });
    expect(next['flurry-of-blows'][0]).toMatchObject({ round: 4, entryId: 'e9' });
  });

  it('clearUse drops the key', () => {
    const ledger = { guidance: [rec()] };
    expect(clearUse(ledger, 'guidance')).toEqual({});
    expect(clearUse(ledger, 'missing')).toEqual(ledger);
    expect(ledger.guidance).toHaveLength(1);
  });

  it('pruneLedgerByPer removes only matching records (daily prep)', () => {
    const ledger = {
      'murmured-prayer': [rec({ per: 'day' })],
      'tell-fortune': [rec({ per: 'week' })],
      mixed: [rec({ per: 'day' }), rec({ per: 'hour' })],
    };
    const next = pruneLedgerByPer(ledger, 'day');
    expect(next['murmured-prayer']).toBeUndefined();
    expect(next['tell-fortune']).toHaveLength(1);
    expect(next.mixed).toHaveLength(1);
    expect(next.mixed[0].per).toBe('hour');
  });
});

describe('lockMessage', () => {
  it('describes window locks with elapsed and reopen times', () => {
    const rule = { per: 'hour', uses: 1 };
    const gate = checkFrequency({
      rule,
      records: [rec({ gameSecs: NOW - 23 * 60 })],
      nowSecs: NOW,
    });
    const msg = lockMessage(gate, rule, NOW);
    expect(msg).toContain('Once per hour');
    expect(msg).toContain('used 23m ago');
    expect(msg).toContain('available at');
  });

  it('mentions daily preparations for per-day locks', () => {
    const rule = { per: 'day', uses: 1 };
    const gate = checkFrequency({
      rule,
      records: [rec({ per: 'day', gameSecs: NOW - 100 })],
      nowSecs: NOW,
    });
    expect(lockMessage(gate, rule, NOW)).toContain('after daily preparations');
  });

  it('uses turn/round phrasing for encounter locks', () => {
    const rule = { per: 'turn', uses: 1 };
    const gate = { available: false, lockKind: 'turn', lastUsedSecs: null, availableAtSecs: null };
    expect(lockMessage(gate, rule, NOW)).toBe('Once per turn — already used this turn');
  });

  it('returns null when open', () => {
    expect(lockMessage({ available: true }, { per: 'hour', uses: 1 }, NOW)).toBeNull();
  });
});
