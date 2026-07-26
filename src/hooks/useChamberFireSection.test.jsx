import { render, renderHook, screen, act } from '@testing-library/react';

// The live chamber overlay is stubbed so the hook's own wording — the strings
// #1639 is about — is what's under test, not the synced-state plumbing.
const mockFire = vi.fn();
const chambersMock = vi.hoisted(() => ({ state: null }));
vi.mock('./useChambers', () => ({
  useChambers: () => ({ stateFor: () => chambersMock.state, fire: mockFire }),
}));

import { useChamberFireSection } from './useChamberFireSection';

const character = { id: 'Pellias', name: 'Pellias' };

// A capacity Strike carrying an inventory uid — the isChamberedFire gate.
const ability = { name: 'Crescent Cross', capacity: 2, weaponUid: 'w1' };

// Storm Arrow-shaped ammo: an on-hit payload with both a save and damage.
const SAVE_AMMO = {
  name: 'Storm Arrow',
  onHit: true,
  save: { stat: 'reflex', dc: 30, basic: true },
  damage: { dice: '3d12', type: 'electricity' },
};

const chamberState = (ref) => ({ chambers: [ref, null], pointer: 0 });

const setup = (ref, extra = {}) => {
  chambersMock.state = chamberState(ref);
  const props = {
    ability,
    character,
    setConsumed: vi.fn(),
    order: [{ entryId: 'e1', name: 'Skeleton', kind: 'enemy', defenses: { saves: { reflex: 8 } } }],
    appendLog: vi.fn(),
    addSaveRequest: vi.fn(),
    sendUpdate: vi.fn(),
    applyEnemyCondition: vi.fn(),
    ...extra,
  };
  const hook = renderHook(() => useChamberFireSection(props));
  return { hook, props };
};

beforeEach(() => {
  vi.clearAllMocks();
  chambersMock.state = null;
});

describe('useChamberFireSection save wording (#1639)', () => {
  it('names the save bare in the on-hit damage label — no doubled DC', () => {
    const { hook } = setup(SAVE_AMMO);
    render(hook.result.current.section);
    const label = screen.getByText(/Storm Arrow on-hit damage/);
    expect(label).toHaveTextContent('basic Reflex DC 30');
    expect(label.textContent).not.toMatch(/DC DC/);
  });

  it('names the save bare in the save-only hint', () => {
    const { hook } = setup({ ...SAVE_AMMO, damage: undefined });
    render(hook.result.current.section);
    const hint = screen.getByText(/On hit:/);
    expect(hint).toHaveTextContent('On hit: Reflex save DC 30 → GM');
    expect(hint.textContent).not.toMatch(/DC DC/);
  });

  it('names the save bare in the pushed-to-GM log line', () => {
    const { hook, props } = setup(SAVE_AMMO);
    act(() => hook.result.current.commit(['e1']));

    const pushed = props.appendLog.mock.calls
      .map(([e]) => e.text)
      .find((t) => t.includes('pushed to the GM'));
    expect(pushed).toContain('Storm Arrow: Reflex save DC 30 pushed to the GM');
    expect(pushed).not.toMatch(/DC DC/);
    // The save request itself is unchanged — wording only.
    expect(props.addSaveRequest).toHaveBeenCalledWith(
      expect.objectContaining({ save: 'reflex', dc: 30, basic: true })
    );
  });
});
