// UseAbilityModal — the cnmh_action_<charId> write, wired at last (#1749 S1).
//
// `foundry-bridge/targeting.js` has consumed `{ kind, sourceUid, targets, ts }`
// on this channel since Slice 2, and the epic's grep of `origin/main` found
// zero producers: the GM's Foundry canvas has never shown the targets a player
// picked. Wave 1 built the debounced writer (`useActionTargetSync`); this file
// pins the WIRING — that UseAbilityModal, the one flow where `useTargeting`
// owns the target set, actually emits it, with the kind the bridge speaks.
//
// FIXTURE NOTE (#1749 S1): the epic asks for an `action` entry in
// `src/test/relayFixtures.js` + `foundry-bridge/relayContract.test.js`. That
// rail records BRIDGE→APP emissions only — `relayContract.test.js` drives each
// bridge module and `grab()`s what it SENT, and inbound channels (`movereq`,
// `snapreq`, `action`) are driven there as plain inline arguments, with no
// recording mechanism at all. Rather than invent one app-side, the emitted
// payload shape is asserted here, at the producer. See the PR body.

import React from 'react';
import { render, screen, act } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';
import { openEdit } from '../../test/rollSheet';
import { RELAY } from '../../sync/keys';
import { ACTION_SYNC_DEBOUNCE_MS } from '../../hooks/useActionTargetSync';

const mockSendUpdate = vi.fn();
let mockProtocol = 17;
let mockFlanked = {};

const enemyOrder = [
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    getState: vi.fn(() => []),
    sendUpdate: mockSendUpdate,
    subscribe: () => () => {},
    foundryConnected: true,
  }),
}));
vi.mock('../../contexts/ContentContext', () => ({ useContent: () => ({ characters: [] }) }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 5, month: 2, year: 4725 }, time: { hour: 8, minute: 0, second: 0 } }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: enemyOrder, log: [] },
    appendLog: vi.fn(), addSaveRequest: vi.fn(), removeSaveRequest: vi.fn(),
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(), spendReaction: vi.fn(), recordAttack: vi.fn(),
  }),
}));
vi.mock('../../hooks/useEffects', () => ({ useEffects: () => ({ effects: [], removeEffect: vi.fn() }) }));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob'], selectable: enemyOrder, isTargeted: (id) => id === 'e-gob', toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({ optionsFor: () => [], spend: () => ({ label: '' }), slots: { remainingFor: () => 0, spend: vi.fn() } }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({ useExploitVulnerability: () => ({ exploitFor: () => null }) }));
// One synced-state stand-in for every key the modal reads; only the two this
// slice cares about answer with anything.
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key, initial) => {
    if (String(key).includes('bridgehello')) return [{ protocol: mockProtocol }, vi.fn()];
    if (String(key).includes('flanked')) return [mockFlanked, vi.fn()];
    return [initial ?? [], vi.fn()];
  },
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => ({ mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const maceStrike = {
  name: 'Mace Strike', type: 'melee', traits: ['Attack', 'Melee'],
  attackMod: 10, damage: '2d6+4', targetDefense: 'ac',
};
const shockingGrasp = {
  id: 'shocking-grasp', name: 'Shocking Grasp', traits: ['Attack', 'Electricity'],
  attackMod: 10, damage: '2d12', targetDefense: 'ac',
};
const character = { id: 'char-a', name: 'Ashka', abilities: { constitution: 16 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

const actionWrites = () => mockSendUpdate.mock.calls.filter((c) => c[1] === RELAY.ACTION);

beforeEach(() => {
  vi.clearAllMocks();
  mockProtocol = 17;
  mockFlanked = {};
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

describe('UseAbilityModal — cnmh_action_<charId> (#1749 S1)', () => {
  it('emits the target set on the action channel, debounced, in the bridge’s own shape', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    expect(actionWrites()).toHaveLength(0);

    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(actionWrites()).toHaveLength(1);
    const [charId, , payload] = actionWrites()[0];
    expect(charId).toBe('char-a');
    expect(payload).toEqual({
      kind: 'strike',
      sourceUid: 'Mace Strike',
      targets: ['e-gob'],
      ts: expect.any(Number),
    });
  });

  it('reports a cast as kind "spell", with the spell id as the source', () => {
    render(<UseAbilityModal {...props} verb="Cast" ability={shockingGrasp} />);
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS); });
    expect(actionWrites()[0][2]).toMatchObject({ kind: 'spell', sourceUid: 'shocking-grasp' });
  });

  it('writes nothing at all below the bridge floor the channel needs', () => {
    mockProtocol = 16;
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS * 2); });
    expect(actionWrites()).toHaveLength(0);
  });

  it('coalesces the modal’s render churn into a single write', () => {
    const { rerender } = render(<UseAbilityModal {...props} ability={maceStrike} />);
    rerender(<UseAbilityModal {...props} ability={maceStrike} />);
    rerender(<UseAbilityModal {...props} ability={maceStrike} />);
    act(() => { vi.advanceTimersByTime(ACTION_SYNC_DEBOUNCE_MS * 3); });
    expect(actionWrites()).toHaveLength(1);
  });
});

describe('UseAbilityModal — the ⚔ flanked chip badge, finally fed (#1749 S5)', () => {
  it('badges a chip for an enemy this attacker flanks', () => {
    mockFlanked = { 'e-gob': { byCharIds: ['char-a'] } };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    openEdit();
    expect(screen.getByLabelText('Goblin is flanked')).toBeInTheDocument();
  });

  it('does not badge a chip flanked only by somebody else', () => {
    mockFlanked = { 'e-gob': { byCharIds: ['someone-else'] } };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    openEdit();
    expect(screen.queryByLabelText('Goblin is flanked')).not.toBeInTheDocument();
  });
});
