import { describe, it, expect } from 'vitest';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useFlanking } from './useFlanking';
import { RELAY } from '../sync/keys';

const mount = (charId, flanked) => renderHookWithProviders(
  () => useFlanking(charId),
  { session: { state: { global: { [RELAY.FLANKED]: flanked } } } }
);

describe('useFlanking (#1749 S5)', () => {
  it('answers true only for an enemy this character flanks', () => {
    const { result } = mount('Pellias', {
      'e-goblin': { byCharIds: ['Pellias', 'Jade'] },
      'e-orc': { byCharIds: ['Jade'] },
    });
    expect(result.current.isFlanking('e-goblin')).toBe(true);
    expect(result.current.isFlanking('e-orc')).toBe(false);
    expect(result.current.isFlanking('e-nobody')).toBe(false);
  });

  it('lists the same answer as a set of entryIds', () => {
    const { result } = mount('Pellias', {
      'e-goblin': { byCharIds: ['Pellias'] },
      'e-orc': { byCharIds: ['Jade'] },
      'e-ogre': { byCharIds: ['Jade', 'Pellias'] },
    });
    expect(result.current.flankedIds.sort()).toEqual(['e-goblin', 'e-ogre']);
  });

  it('fails closed and silent with no relay data at all', () => {
    const { result } = mount('Pellias', undefined);
    expect(result.current.flankedIds).toEqual([]);
    expect(result.current.isFlanking('e-goblin')).toBe(false);
  });

  it('never claims a flank for a viewer with no charId', () => {
    const { result } = mount('', { 'e-goblin': { byCharIds: ['Pellias'] } });
    expect(result.current.isFlanking('e-goblin')).toBe(false);
    expect(result.current.flankedIds).toEqual([]);
  });
});
