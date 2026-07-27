// UseAbilityModal — MAP drift at the deferred finish (Roll Resolution
// redesign E regression). runConfirm's recordAttack bumps attacksMade at
// COMMIT time, which used to shift useAbilityCastPlan's auto MAP step while
// RollSheet still showed the frozen result card — so `runFinish`'s re-resolve
// (attackSheet.resolveWithAmounts) computed degrees from a MAP-lowered bonus
// and the deferred log line + damage appliers could drop a degree (Hit →
// Miss) below the committed card. The commitMapRef pin freezes the committed
// step; this suite drives the exact repro the other suites can't: a STATEFUL
// turn-state mock whose recordAttack really bumps attacksMade, a roll profile
// that really loses 5 per MAP step, and a commit that hits by less than 5.

import React from 'react';
import { render, screen } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';
import { commitRoll, rollDamage, applyDamage, enterDamage } from '../../test/rollSheet';

const mockAppendLog = vi.fn();

// Proof the drift pressure was real: the commit must have recorded an attack,
// otherwise a kept degree proves nothing about the pin.
const turnMock = vi.hoisted(() => ({ recorded: [] }));

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Ashka' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'goblin-warrior', defenses: { ac: 15 } },
];

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: vi.fn(), subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Ashka' }], fxAnimations: [] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { active: true, order: enemyOrder, log: [] },
    appendLog: mockAppendLog,
    addSaveRequest: vi.fn(),
    removeSaveRequest: vi.fn(),
  }),
}));
// STATEFUL turn state — the point of this suite. recordAttack really bumps
// attacksMade (and re-renders), exactly like the live hook; the static mocks
// the other UseAbilityModal suites use can never reproduce the drift.
vi.mock('../../hooks/useTurnState', () => {
  const { useState } = require('react');
  return {
    useTurnState: () => {
      const [attacksMade, setAttacksMade] = useState(0);
      return {
        turnState: { actionsSpent: 0, attacksMade, reactionAvailable: true },
        spendActions: vi.fn(),
        spendReaction: vi.fn(),
        recordAttack: (n = 1) => {
          turnMock.recorded.push(n);
          setAttacksMade((c) => c + n);
        },
      };
    },
  };
});
vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));
vi.mock('../../hooks/useTargeting', () => ({
  useTargeting: () => ({
    targets: ['e-gob'],
    selectable: enemyOrder,
    isTargeted: (id) => id === 'e-gob',
    toggleTarget: vi.fn(),
  }),
}));
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => [],
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({ exploitFor: () => null }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
// The roll profile really loses 5 per MAP step, like a live Strike — this is
// the coupling the frozen commit must be immune to.
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: (ability, actor, { mapStep = 0 } = {}) => ({
    mode: 'actor-roll',
    bonus: 5 - 5 * mapStep,
    defense: 'ac',
    dc: null,
  }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children }) => (isOpen ? <div data-testid="modal">{children}</div> : null),
}));

const maceStrike = {
  name: 'Mace Strike',
  type: 'melee',
  traits: ['Attack', 'Melee'],
  attackMod: 10,
  damage: '2d6+4',
  damageType: 'bludgeoning',
  targetDefense: 'ac',
};

const character = { id: 'char-a', name: 'Ashka', abilities: { constitution: 16 } };
const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };
const loggedLines = () => mockAppendLog.mock.calls.map(([entry]) => entry.text);

beforeEach(() => {
  vi.clearAllMocks();
  turnMock.recorded = [];
});

describe('UseAbilityModal — MAP pin across the deferred finish', () => {
  it('the finish-time log keeps the committed degree after recordAttack bumps MAP', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    // 10 + 5 = 15 vs AC 15 → Hit by exactly 0 — inside the drift window (< 5).
    commitRoll(10);
    expect(screen.getByText('Hit')).toBeInTheDocument();
    expect(turnMock.recorded).toEqual([1]); // the drift pressure really landed

    rollDamage();
    enterDamage(9);
    applyDamage();

    // The deferred log line must match the frozen card. Pre-pin, the commit's
    // recordAttack had already dropped the live bonus to 0 (MAP step 1), so
    // the re-resolve logged 10 vs AC 15 → Miss and applied no damage.
    expect(loggedLines()).toContainEqual(expect.stringContaining('15 → Hit'));
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 9'));
    expect(loggedLines().join('\n')).not.toContain('Miss');
  });
});
