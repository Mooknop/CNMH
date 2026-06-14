import { renderHook, act } from '@testing-library/react';

vi.mock('./useSyncedState', () => {
  const ReactLib = require('react');
  return {
    __esModule: true,
    useSyncedState: (key, init) =>
      ReactLib.useState(typeof init === 'function' ? init() : init),
  };
});

import { useSummons } from './useSummons';

const setup = () => renderHook(() => useSummons());

const add = (result, over = {}) =>
  act(() =>
    result.current.addSummon({
      name: 'Skeletal Champion',
      level: 5,
      casterId: 'Izzy',
      casterName: 'Izzy',
      sustainId: 'sus-1',
      spellName: 'Summon Undead',
      defenses: { ac: 21, saves: { fortitude: 10, reflex: 8, will: 6 } },
      maxHp: 60,
      ...over,
    })
  );

describe('useSummons', () => {
  it('addSummon stamps an entryId, kind summon, and full HP', () => {
    const { result } = setup();
    add(result);
    expect(result.current.summons).toHaveLength(1);
    const s = result.current.summons[0];
    expect(s).toMatchObject({ kind: 'summon', name: 'Skeletal Champion', level: 5, casterId: 'Izzy', sustainId: 'sus-1' });
    expect(s.entryId).toBeTruthy();
    expect(s.bestiary.hp).toEqual({ current: 60, max: 60 });
    expect(s.defenses.ac).toBe(21);
  });

  it('removeSummon drops by entryId; setHp updates current HP', () => {
    const { result } = setup();
    add(result);
    const id = result.current.summons[0].entryId;
    act(() => result.current.setHp(id, { current: 45, max: 60 }));
    expect(result.current.getHp(id)).toEqual({ current: 45, max: 60 });
    act(() => result.current.removeSummon(id));
    expect(result.current.summons).toHaveLength(0);
  });

  it('pruneOrphans removes only the matching caster summons whose sustain is gone', () => {
    const { result } = setup();
    add(result, { casterId: 'Izzy', sustainId: 'sus-1' });
    add(result, { casterId: 'Izzy', sustainId: 'sus-2' });
    add(result, { casterId: 'Ashka', sustainId: 'sus-9' });

    // Izzy still sustains sus-2 only; Ashka's ledger is untouched here.
    act(() => result.current.pruneOrphans('Izzy', ['sus-2']));

    const left = result.current.summons.map((s) => s.sustainId).sort();
    expect(left).toEqual(['sus-2', 'sus-9']); // sus-1 (Izzy, orphaned) pruned; Ashka's kept
  });

  it('pruneOrphans is a no-op when nothing is orphaned', () => {
    const { result } = setup();
    add(result, { sustainId: 'sus-1' });
    const before = result.current.summons;
    act(() => result.current.pruneOrphans('Izzy', ['sus-1']));
    expect(result.current.summons).toBe(before); // same reference — no rewrite
  });
});
