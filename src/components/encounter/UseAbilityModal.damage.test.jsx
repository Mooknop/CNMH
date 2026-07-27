// UseAbilityModal — damage step (#222).
// Drives the single-roll AC attack path end to end: dice hint + rolled-total
// entry after a hit, rider toggles, crit doubling, the exploit-weakness
// auto-add, and the per-target damage breakdown in the combat log.
//
// Since #1687 that path is RollSheet's: tap a face → commit → Roll damage →
// total → Apply damage. The assertions are unchanged; only the gestures moved,
// and anything that used to be a live preview is now asserted after the commit.

import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';
import {
  commitRoll, rollDamage, applyDamage, resolveAttack,
  enterDamage as enterSheetDamage, tapFace,
} from '../../test/rollSheet';

// Direct multi-ray (#1691): each ray gets its own d20 tap pad + commit pill
// (SequentialAttackSteps, mounted via RollSheet's dieSlot); the outer sheet's
// own commit pill (`.rs-pill`) only enables once every ray has rolled.
const rollRay = (face) => { tapFace(face); fireEvent.click(document.querySelector('.sas-pill')); };

const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
const mockRecordAttack = vi.fn();

// Per-test roll profile and exploit — reassigned before render.
let mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };
let mockExploit = null;

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Ashka' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'goblin-warrior', defenses: { ac: 15, saves: { fortitude: 8 } } },
];

// sendUpdate is hoisted so the damage-relay tests (#1016) can assert on the
// cnmh_dmgapply_global payload the confirm pushes to the bridge.
const sessionMock = vi.hoisted(() => ({ sendUpdate: vi.fn() }));
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: sessionMock.sendUpdate, subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [{ id: 'char-a', name: 'Ashka' }],
    // Minimal fxplay catalog (#1416): the melee-bludgeoning family rule the
    // canvas-animation emit test resolves against.
    fxAnimations: [{
      id: 'fx-strike-melee-bludgeoning',
      priority: 100,
      when: { kind: 'strike', rangeType: 'melee', damageType: 'bludgeoning' },
      play: { shape: 'melee', file: 'jb2a.mace.melee.01.white' },
    }],
  }),
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
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: mockSpendActions,
    spendReaction: vi.fn(),
    recordAttack: mockRecordAttack,
  }),
}));
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
// Per-test cast options (heightened-cast tests set a higher-rank slot).
let mockCastOptions = [];
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => mockCastOptions,
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));

// Chained-strike section stub — modal logging tests inject its results here.
const chainStrikeMock = vi.hoisted(() => ({ results: null }));
vi.mock('./ChainedStrikeSection', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
  return { default: forwardRef((props, ref) => {
    useImperativeHandle(ref, () => ({ getResults: () => chainStrikeMock.results }));
    return createElement('div', { 'data-testid': 'chained-strike-section' });
  }) };
});
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({ exploitFor: () => mockExploit }),
}));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [[], vi.fn()],
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => mockRollProfile,
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

const character = {
  id: 'char-a',
  name: 'Ashka',
  abilities: { constitution: 16 },
  damageRiders: [{
    id: 'implements-empowerment',
    label: "Implement's Empowerment",
    appliesTo: 'strikes',
    bonus: { perWeaponDie: 2 },
    defaultOn: true,
  }],
};

const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

// Multi-ray and chained-strike abilities keep the pre-redesign resolvers
// (workstream J / the chain sections), so those tests keep the typed idiom and
// the footer confirm button.
const confirm = () => fireEvent.click(screen.getByLabelText('confirm-cast'));
const loggedLines = () => mockAppendLog.mock.calls.map(([entry]) => entry.text);

beforeEach(() => {
  vi.clearAllMocks();
  mockRollProfile = { mode: 'actor-roll', bonus: 5, defense: 'ac', dc: null };
  mockExploit = null;
  mockCastOptions = [];
  chainStrikeMock.results = null;
});

describe('UseAbilityModal — damage step (#222)', () => {
  it('hit → damage entry with the dice hint; the total lands in the log with the rider', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(10); // 10 + 5 = 15 vs AC 15 → Hit
    expect(screen.getByText('Hit')).toBeInTheDocument();
    rollDamage();
    expect(screen.getByText('2d6+4 bludgeoning')).toBeInTheDocument();
    enterSheetDamage(9);
    applyDamage();
    // 9 + 4 (Implement's Empowerment, 2 × 2 weapon dice)
    expect(loggedLines()).toContainEqual(
      expect.stringContaining("damage 13 (9 +4 Implement's Empowerment)")
    );
  });

  it('miss → no damage step and no damage in the log', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(5); // 10 < AC 15 → Miss
    expect(screen.getByText('Miss')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Roll damage' })).toBeNull();
    expect(loggedLines().join('\n')).not.toContain('damage');
  });

  it('crit doubles base + riders before the log', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    resolveAttack(20, 9); // nat 20 → Critical Hit
    // (9 + 4) × 2 = 26
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 26 (9 +4'));
    expect(loggedLines()).toContainEqual(expect.stringContaining('×2'));
  });

  it('unticking the rider drops it from the logged total', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(10);
    rollDamage();
    enterSheetDamage(9);
    fireEvent.click(screen.getByRole('checkbox', { name: /Implement's Empowerment/i }));
    applyDamage();
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 9'));
  });

  it("the actor's active exploit weakness auto-adds for the matching target", () => {
    mockExploit = {
      targetEntryId: 'e-gob', targetName: 'Goblin',
      type: 'mortal', weaknessType: 'fire', value: 5, magical: true,
    };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(10);
    rollDamage();
    expect(screen.getByRole('checkbox', { name: /weakness \(fire 5\)/i })).toBeChecked();
    enterSheetDamage(9);
    applyDamage();
    // 9 + 4 rider + 5 weakness = 18
    expect(loggedLines()).toContainEqual(
      expect.stringContaining('damage 18 (9 +4 Implement\'s Empowerment +5 weakness (fire 5))')
    );
  });

  it('an exploit on a different combatant adds no weakness to this hit', () => {
    mockExploit = {
      targetEntryId: 'e-elsewhere', targetName: 'Other',
      type: 'antithesis', value: 4,
    };
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(10);
    rollDamage();
    expect(screen.queryByRole('checkbox', { name: /weakness/i })).toBeNull();
    enterSheetDamage(9);
    applyDamage();
    expect(loggedLines()).toContainEqual(expect.stringContaining('damage 13'));
  });

  it('persistent riders show in the log with the flat-check note', () => {
    const shardStrike = {
      ...maceStrike,
      name: 'Shard Strike',
      riders: [{
        id: 'shard-bleed', label: 'Shard bleed',
        persistent: { dice: '1d6', type: 'bleed' }, defaultOn: true,
      }],
    };
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    resolveAttack(10, 9);
    expect(loggedLines()).toContainEqual(
      expect.stringContaining('1d6 persistent bleed (DC 15 flat to end)')
    );
  });

  it('heightened cast scales the dice hint and persistent rider (#222 slice 2)', () => {
    mockCastOptions = [{ type: 'slot', rank: 3, enabled: true, label: 'Rank 3 slot' }];
    const shockingGrasp = {
      name: 'Shocking Grasp',
      level: 1,
      actions: 'Two Actions',
      traits: ['Attack', 'Electricity'],
      targetDefense: 'ac',
      damageData: {
        base: '2d12',
        type: 'electricity',
        heightened: { '+1': { base: '1d12', persistent: 1 } },
        riders: [{
          id: 'sg-metal', label: 'Persistent electricity (metal armor)',
          persistent: { dice: '1d4', type: 'electricity' }, defaultOn: true,
        }],
      },
    };
    render(<UseAbilityModal {...props} ability={shockingGrasp} verb="Cast" />);
    commitRoll(10); // hit
    rollDamage();
    // 2 steps above native: 2d12 + 2×1d12 = 4d12; persistent 1d4 + 2
    expect(screen.getByText(/4d12 electricity/)).toBeInTheDocument();
    enterSheetDamage(20);
    applyDamage();
    expect(loggedLines()).toContainEqual(
      expect.stringContaining('1d4+2 persistent electricity (DC 15 flat to end)')
    );
  });

  it('multi-ray attack spells get a damage entry per ray', () => {
    const scorchingRays = {
      name: 'Twin Rays',
      level: 2,
      actions: 'Two Actions',
      traits: ['Attack', 'Fire'],
      targetDefense: 'ac',
      rollCount: 2,
      damageData: { base: '2d6', type: 'fire' },
    };
    render(<UseAbilityModal {...props} ability={scorchingRays} verb="Cast" />);
    rollRay(10); // hit
    rollRay(20); // crit
    const dmgInputs = screen.getAllByLabelText(/rolled damage total/i);
    expect(dmgInputs).toHaveLength(2);
    fireEvent.change(dmgInputs[0], { target: { value: '7' } });
    fireEvent.change(dmgInputs[1], { target: { value: '9' } });
    fireEvent.click(document.querySelector('.rs-pill'));
    expect(loggedLines()).toContainEqual(
      expect.stringMatching(/ray 1 .*damage 7/)
    );
    expect(loggedLines()).toContainEqual(
      expect.stringMatching(/ray 2 .*damage 18 \(9 ×2\)/)
    );
  });

  it('chained strikes log real per-target totals; flurry adds a combined line', () => {
    const dmg = (final, base) => ({
      entered: base, final,
      parts: { base, riders: [], crit: false, weaknesses: [] },
      persistent: [],
    });
    chainStrikeMock.results = {
      mode: 'flurry',
      strikeName: 'Unarmed Strike',
      attackBonus: 9,
      damage: '1d6+4',
      rolls: [
        [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 19, degree: 'success', damage: dmg(10, 10) }],
        [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 16, degree: 'success', damage: dmg(13, 13) }],
      ],
    };
    const flurryAbility = {
      name: 'Inner Upheaval',
      actions: 'Two Actions',
      chain: { into: 'strike', modes: ['flurry'] },
    };
    render(<UseAbilityModal {...props} ability={flurryAbility} />);
    confirm();
    expect(loggedLines()).toContainEqual(expect.stringContaining('Flurry of Blows (1) vs Goblin (AC 15): 19 → Hit · damage 10'));
    expect(loggedLines()).toContainEqual(expect.stringContaining('Flurry of Blows (2) vs Goblin (AC 15): 16 → Hit · damage 13'));
    expect(loggedLines()).toContainEqual(
      'Flurry of Blows combined vs Goblin: 23 damage (apply resistance/weakness once)'
    );
  });

  it('chained strikes without an entered total keep the dice-string fallback', () => {
    chainStrikeMock.results = {
      mode: 'strike',
      strikeName: 'Unarmed Strike',
      attackBonus: 9,
      damage: '1d6+4 + 1d6',
      rolls: [
        [{ entryId: 'e-gob', name: 'Goblin', dc: 15, total: 19, degree: 'success', damage: null }],
      ],
    };
    const chainAbility = {
      name: 'Inner Upheaval',
      actions: 'Two Actions',
      chain: { into: 'strike', modes: ['strike'] },
    };
    render(<UseAbilityModal {...props} ability={chainAbility} />);
    confirm();
    expect(loggedLines()).toContainEqual(expect.stringContaining('· dmg 1d6+4 + 1d6'));
  });

  it('notes an applied conditional circumstance on the chained-strike hit line (#511)', () => {
    chainStrikeMock.results = {
      mode: 'strike',
      strikeName: 'Unarmed Strike',
      attackBonus: 9,
      damage: '1d6+4',
      rolls: [
        [{
          entryId: 'e-gob', name: 'Goblin', dc: 15, total: 20, degree: 'success', damage: null,
          adjust: 1, adjustSources: ['Limned (vs limned target)'],
        }],
      ],
    };
    const chainAbility = {
      name: 'Inner Upheaval',
      actions: 'Two Actions',
      chain: { into: 'strike', modes: ['strike'] },
    };
    render(<UseAbilityModal {...props} ability={chainAbility} />);
    confirm();
    expect(loggedLines()).toContainEqual(
      expect.stringContaining('20 → Hit (incl. +1: Limned (vs limned target))')
    );
  });

  it('the chosen action-count variant overrides the dice hint (#268, Blazing Bolt)', () => {
    mockCastOptions = [{ type: 'slot', rank: 3, enabled: true, label: 'Rank 3 slot' }];
    const blazingBolt = {
      name: 'Blazing Bolt',
      level: 2,
      actions: 'One to Three Actions',
      rolls: 'per-action',
      traits: ['Attack', 'Fire'],
      targetDefense: 'ac',
      variants: [
        { actions: 1, note: '1 ray, 2d6 fire', damage: { base: '2d6', type: 'fire', heightened: { '+1': { base: '1d6' } } } },
        { actions: 2, note: '2 rays, 4d6 fire each', damage: { base: '4d6', type: 'fire', heightened: { '+1': { base: '2d6' } } } },
        { actions: 3, note: '3 rays, 4d6 fire each', damage: { base: '4d6', type: 'fire', heightened: { '+1': { base: '2d6' } } } },
      ],
    };
    render(<UseAbilityModal {...props} ability={blazingBolt} verb="Cast" />);
    // The action-count picker lives in the sheet's collapsed edit panel now
    // (#1687/#1691); the ray sequence itself is the sheet's `dieSlot`.
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // 1 action at rank 3 (native 2): 2d6 + 1d6 = 3d6 per ray.
    let picker = screen.getByRole('radiogroup', { name: 'Number of actions' });
    fireEvent.click(within(picker).getByText('1'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    rollRay(10); // hit
    expect(screen.getByText(/3d6 fire/)).toBeInTheDocument();
    // 3 actions: 4d6 + 2d6 = 6d6 per ray — changing the count mid-edit resets
    // the ray sequence (a fresh MultiRayResolver mount, #1691).
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    picker = screen.getByRole('radiogroup', { name: 'Number of actions' });
    fireEvent.click(within(picker).getByText('3'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('Ray 1 of 3')).toBeInTheDocument();
    // The grouped damage entry (and its dice hint) only appears once every
    // ray has rolled (#1691 — "the amount step, once, after the last ray").
    rollRay(10);
    rollRay(10);
    rollRay(10);
    expect(screen.getAllByText(/6d6 fire/).length).toBeGreaterThan(0);
  });

  it('degree text from the ability data renders inline with the result', () => {
    const fear = {
      name: 'Fearsome Strike',
      traits: ['Attack'],
      attackMod: 10,
      damage: '1d6',
      targetDefense: 'ac',
      degrees: {
        'Success': 'The target is frightened 1.',
        'Failure': 'The target resists.',
      },
    };
    render(<UseAbilityModal {...props} ability={fear} />);
    // The authored degree text is a RESULT, so it only exists after the commit.
    expect(screen.queryByText(/frightened 1/)).toBeNull();
    commitRoll(10);
    expect(screen.getByText(/The target is frightened 1\./)).toBeInTheDocument();
  });

  // ── typed damage relay to Foundry (#1016) ─────────────────────────────────

  it('confirm relays the per-target total (typed by the profile) to the bridge', () => {
    const fireStrike = {
      ...maceStrike,
      name: 'Flame Strike',
      damageData: { base: '2d6+4', type: 'fire' },
    };
    render(<UseAbilityModal {...props} ability={fireStrike} />);
    // 15 vs AC 15 → hit; 9 + 4 Implement's Empowerment (2 dice × 2) = 13
    resolveAttack(10, 9);

    expect(sessionMock.sendUpdate).toHaveBeenCalledWith('global', 'dmgapply', expect.objectContaining({
      sourceName: 'Flame Strike',
      hits: [{ entryId: 'e-gob', name: 'Goblin', amount: 13, type: 'fire' }],
    }));
  });

  it('confirm relays nothing on a miss / when no total was entered', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(2); // 7 vs AC 15 → miss

    expect(sessionMock.sendUpdate).not.toHaveBeenCalledWith('global', 'dmgapply', expect.anything());
  });

  // ── canvas animation relay to Foundry (#1416, epic #1414) ──────────────────

  it('confirm relays the catalog-resolved fxplay recipe for a hit', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    resolveAttack(10, 9); // 15 vs AC 15 → hit

    expect(sessionMock.sendUpdate).toHaveBeenCalledWith('global', 'fxplay', expect.objectContaining({
      shape: 'melee',
      file: 'jb2a.mace.melee.01.white',
      source: 'e-caster',
      targets: ['e-gob'],
    }));
  });

  it('confirm relays no fxplay on a miss', () => {
    render(<UseAbilityModal {...props} ability={maceStrike} />);
    commitRoll(2); // 7 vs AC 15 → miss

    expect(sessionMock.sendUpdate).not.toHaveBeenCalledWith('global', 'fxplay', expect.anything());
  });

  // ── monster IWR in the outgoing damage step (#1014) ────────────────────────

  it('a fired monster weakness nets into the log, keeps the relay raw, and announces the reveal', () => {
    const gob = enemyOrder[1];
    const savedDefenses = gob.defenses;
    gob.defenses = { ...savedDefenses, weaknesses: [{ type: 'fire', value: 5 }] };
    try {
      const fireStrike = {
        ...maceStrike,
        name: 'Flame Strike',
        damageData: { base: '2d6+4', type: 'fire' },
      };
      render(<UseAbilityModal {...props} ability={fireStrike} />);
      // 15 vs AC 15 → hit; 9 + 4 rider = 13 raw; + weakness 5 = 18 netted
      resolveAttack(10, 9);

      expect(loggedLines()).toContainEqual(
        expect.stringContaining("damage 18 (9 +4 Implement's Empowerment +5 weakness (fire))")
      );
      // The relay stays pre-IWR — Foundry nets the weakness itself.
      expect(sessionMock.sendUpdate).toHaveBeenCalledWith('global', 'dmgapply', expect.objectContaining({
        hits: [{ entryId: 'e-gob', name: 'Goblin', amount: 13, type: 'fire' }],
      }));
      // First reveal announced (reveal-on-trigger).
      expect(loggedLines()).toContain("Goblin's weakness to fire is revealed!");
    } finally {
      gob.defenses = savedDefenses;
    }
  });
});
