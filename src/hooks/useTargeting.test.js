import { renderHook, act } from '@testing-library/react';
import { useTargeting } from './useTargeting';

const order = [
  { entryId: 'e1', kind: 'pc', name: 'Pellias', charId: 'Pellias' },
  { entryId: 'e2', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e3', kind: 'pc', name: 'Ashka', charId: 'Ashka' },
];

describe('useTargeting', () => {
  it('selectable excludes self by default', () => {
    const { result } = renderHook(() => useTargeting('Pellias', order));
    expect(result.current.selectable.map((e) => e.entryId)).toEqual(['e2', 'e3']);
  });

  it('includeSelf keeps the acting character selectable', () => {
    const { result } = renderHook(() => useTargeting('Pellias', order, { includeSelf: true }));
    expect(result.current.selectable.map((e) => e.entryId)).toEqual(['e1', 'e2', 'e3']);
  });

  it('toggleTarget selects and deselects', () => {
    const { result } = renderHook(() => useTargeting('Pellias', order));
    act(() => result.current.toggleTarget('e2'));
    expect(result.current.targets).toEqual(['e2']);
    expect(result.current.isTargeted('e2')).toBe(true);
    act(() => result.current.toggleTarget('e2'));
    expect(result.current.targets).toEqual([]);
  });

  it('supports multiple targets and exposes their names', () => {
    const { result } = renderHook(() => useTargeting('Pellias', order));
    act(() => result.current.toggleTarget('e2'));
    act(() => result.current.toggleTarget('e3'));
    expect(result.current.targets).toEqual(['e2', 'e3']);
    expect(result.current.targetNames).toEqual(['Goblin', 'Ashka']);
  });

  it('clearTargets empties the selection', () => {
    const { result } = renderHook(() => useTargeting('Pellias', order));
    act(() => result.current.toggleTarget('e2'));
    act(() => result.current.clearTargets());
    expect(result.current.targets).toEqual([]);
  });

  it('defaultTargetId pre-selects one entry on mount (#412)', () => {
    const { result } = renderHook(() =>
      useTargeting('Pellias', order, { defaultTargetId: 'e2' })
    );
    expect(result.current.targets).toEqual(['e2']);
    expect(result.current.isTargeted('e2')).toBe(true);
    // Still toggleable afterwards.
    act(() => result.current.toggleTarget('e2'));
    expect(result.current.targets).toEqual([]);
  });

  it('defaultTargetId not in the order is dropped (no stale target)', () => {
    const { result } = renderHook(() =>
      useTargeting('Pellias', order, { defaultTargetId: 'ghost' })
    );
    expect(result.current.targets).toEqual([]);
  });

  it('drops a selected entry that leaves the order', () => {
    const { result, rerender } = renderHook(({ o }) => useTargeting('Pellias', o), {
      initialProps: { o: order },
    });
    act(() => result.current.toggleTarget('e2'));
    expect(result.current.targets).toEqual(['e2']);
    // Goblin defeated → removed from the order.
    rerender({ o: order.filter((e) => e.entryId !== 'e2') });
    expect(result.current.targets).toEqual([]);
  });

  it('selectable drops hidden entries (#1749 OQ-5 — the chip list must not leak them)', () => {
    const withHidden = [...order, { entryId: 'e4', kind: 'enemy', name: 'Skulker', hidden: true }];
    const { result } = renderHook(() => useTargeting('Pellias', withHidden));
    expect(result.current.selectable.map((e) => e.entryId)).toEqual(['e2', 'e3']);
  });

  it('an older bridge with no hidden field at all leaves everything selectable', () => {
    const { result } = renderHook(() => useTargeting('Pellias', order));
    expect(result.current.selectable.map((e) => e.entryId)).toEqual(['e2', 'e3']);
  });

  it('a targeted entry that BECOMES hidden mid-turn drops from the selection', () => {
    const { result, rerender } = renderHook(({ o }) => useTargeting('Pellias', o), {
      initialProps: { o: order },
    });
    act(() => result.current.toggleTarget('e2'));
    expect(result.current.targets).toEqual(['e2']);

    const nowHidden = order.map((e) => (e.entryId === 'e2' ? { ...e, hidden: true } : e));
    rerender({ o: nowHidden });
    expect(result.current.targets).toEqual([]);
    expect(result.current.selectable.map((e) => e.entryId)).toEqual(['e3']);
  });
});
