// UseAbilityModal — the target-save path on RollSheet (#270 → #1689).
//
// The save flow inverted. It used to ask for the damage total BEFORE the
// commit and ship it with the request, so the GM derived every target's
// per-degree damage. Now the caster commits first, the sheet parks on
// `waiting`, the GM's degrees come back on `encounter.saveResolutions`, and
// the damage total is asked for AFTER them — so the request carries
// `entered: null` and the rider snapshot only.
//
// What did NOT move: the rider checkboxes (a cast-time choice the GM's
// condition ladder reads), the caster effect (#274), the cast rank (#271) and
// every other field of the request payload.
//
// Note the `ui()` factory: React skips reconciliation entirely when a rerender
// is handed the SAME element reference, so a fresh element per rerender is
// what makes the encounter-rail changes below actually reach the component.

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import UseAbilityModal from './UseAbilityModal';

const mockAppendLog = vi.fn();
const mockAddSaveRequest = vi.fn();
const mockClearSaveResolution = vi.fn();
const mockSendUpdate = vi.fn();

// Per-test roll profile and exploit — reassigned before render.
let mockRollProfile = { mode: 'target-save', defense: 'reflex', dc: 22 };
let mockExploit = null;
// The live encounter the modal reads — tests push resolution records onto it.
let mockEncounter = null;

const enemyOrder = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Brimstone' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', creatureKey: 'goblin-warrior', defenses: { ac: 15, saves: { reflex: 8 } } },
];

const makeEncounter = (extra = {}) => ({
  active: true,
  order: enemyOrder,
  log: [],
  saveRequests: [],
  saveResolutions: [],
  ...extra,
});

vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: vi.fn(() => []), sendUpdate: mockSendUpdate, subscribe: () => () => {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'char-a', name: 'Brimstone' }] }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: mockEncounter,
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
    removeSaveRequest: vi.fn(),
    clearSaveResolution: mockClearSaveResolution,
  }),
}));
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: vi.fn(),
    spendReaction: vi.fn(),
    recordAttack: vi.fn(),
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
// Per-test cast options (the cantrip-rank test sets an auto-heightened option).
let mockCastOptions = [];
vi.mock('../../hooks/useCastingResources', () => ({
  useCastingResources: () => ({
    optionsFor: () => mockCastOptions,
    spend: () => ({ label: '' }),
    slots: { remainingFor: () => 0, spend: vi.fn() },
  }),
}));
vi.mock('../../hooks/useExploitVulnerability', () => ({
  useExploitVulnerability: () => ({ exploitFor: () => mockExploit }),
}));
// Aura key reads active so the Impulse-trait fixture (Shard Strike) passes the
// kinetic aura gate (#228); the persistent map captures the #272 writes the
// caster now makes itself; every other key echoes an empty list.
const persistentSetter = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (String(key).startsWith('cnmh_aura_')) return [{ active: true, ts: 1 }, vi.fn()];
    if (String(key) === 'cnmh_persistent_global') return [{}, persistentSetter];
    return [[], vi.fn()];
  },
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: () => mockRollProfile,
  isBasicDefense: (d) => /basic/i.test(String(d || '')),
}));
// The Modal stub keeps its chrome close button (`aria-label="Close"`, exactly
// what Modal.jsx renders): the close guard (#1689) is a chrome-level behaviour
// and cannot be driven without it.
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, onClose, children }) => (isOpen ? (
    <div data-testid="modal">
      <button type="button" aria-label="Close" onClick={onClose}>&times;</button>
      {children}
    </div>
  ) : null),
}));

const shardStrike = {
  name: 'Shard Strike',
  actions: 'Two Actions',
  traits: ['Impulse', 'Kineticist', 'Metal'],
  targetDefense: 'reflex',
  basic: true,
  damageData: {
    base: '1d6',
    type: 'slashing or piercing',
    riders: [{
      id: 'shard-bleed', label: 'Shards: persistent bleed',
      persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
      note: 'Shards form only — untick for Spines',
    }],
  },
};

const character = { id: 'char-a', name: 'Brimstone', abilities: { constitution: 16 } };

const props = { isOpen: true, onClose: vi.fn(), verb: 'Use', character, themeColor: '#a0f' };

// The sheet idiom ───────────────────────────────────────────────────────────
/** The single primary pill of whichever phase is on screen. */
const pill = () => document.querySelector('.rs-pill');
/** Commit — no d20 on a save spell, so the pill is the whole gesture. */
const commit = () => fireEvent.click(pill());
const openEdit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
const chromeClose = () => fireEvent.click(screen.getByRole('button', { name: 'Close' }));
const requestArg = () => mockAddSaveRequest.mock.calls[0][0];
const guardText = () => document.querySelector('.rs-guard')?.textContent ?? null;

/**
 * The GM's answer: a resolution record shaped exactly like `makeSaveResolution`
 * lands on the encounter rail, and the sheet is re-rendered with it.
 */
const gmResolves = (rerender, ui, results, overrides = {}) => {
  mockEncounter = makeEncounter({
    saveResolutions: [{
      id: 'savereq-1',
      ts: Date.now(),
      casterId: 'char-a',
      casterEntryId: 'e-caster',
      casterName: 'Brimstone',
      abilityName: 'Shard Strike',
      rank: null,
      save: 'reflex',
      dc: 22,
      basic: true,
      results,
      damage: requestArg().damage ?? null,
      ...overrides,
    }],
  });
  act(() => { rerender(ui()); });
};

beforeEach(() => {
  vi.clearAllMocks();
  // `mockReset: true` (vite.config) wipes implementations, and the id
  // addSaveRequest returns is the join key the sheet watches for.
  mockAddSaveRequest.mockReturnValue('savereq-1');
  mockRollProfile = { mode: 'target-save', defense: 'reflex', dc: 22 };
  mockExploit = null;
  mockCastOptions = [];
  mockEncounter = makeEncounter();
});

describe('UseAbilityModal — the save round trip (#1689)', () => {
  it('shows the dice and the riders pre-commit, but NO total input', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    // The strip names the save outright; the note says who rolls next.
    expect(screen.getByText(/Goblin · Two Actions · Reflex DC 22/)).toBeInTheDocument();
    expect(screen.getByText(/The targets roll their saves — you commit first/)).toBeInTheDocument();

    openEdit();
    expect(screen.getByText('1d6 slashing or piercing')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Shards: persistent bleed/i })).toBeChecked();
    // The pre-commit damage entry is GONE from this flow.
    expect(screen.queryByLabelText(/rolled damage total/i)).toBeNull();
  });

  it('commit sends the rider snapshot with entered: null and parks on waiting', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    commit();
    expect(requestArg()).toMatchObject({
      abilityName: 'Shard Strike',
      save: 'reflex',
      dc: 22,
      basic: true,
      targets: [{ entryId: 'e-gob', name: 'Goblin', saveMod: 8 }],
      damage: {
        // The caster rolls this AFTER the degrees — and this null is what
        // stops RequestedSaves applying damage itself.
        entered: null,
        expression: '1d6',
        typeLabel: 'slashing or piercing',
        riders: [{
          id: 'shard-bleed', label: 'Shards: persistent bleed',
          persistent: { dice: '1d6', type: 'bleed' }, on: ['criticalFailure'],
        }],
      },
    });
    // The payload crosses the WebSocket — it must round-trip as plain JSON.
    const { damage } = requestArg();
    expect(JSON.parse(JSON.stringify(damage))).toEqual(damage);

    // Waiting on the GM, with no degrees invented locally.
    expect(screen.getByText('Waiting on the GM to roll saves…')).toBeInTheDocument();
    expect(document.querySelector('.rs-row-degree')).toBeNull();
  });

  it('an unticked rider is omitted from the snapshot', () => {
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    openEdit();
    fireEvent.click(screen.getByRole('checkbox', { name: /Shards: persistent bleed/i }));
    commit();
    expect(requestArg().damage.riders).toEqual([]);
  });

  it('a damage-free save carries no damage key and guards nothing', () => {
    const plainSave = {
      name: 'Addling Blast', actions: 'Two Actions',
      traits: ['Mental'], targetDefense: 'will', basic: true,
    };
    const onClose = vi.fn();
    render(<UseAbilityModal {...props} onClose={onClose} ability={plainSave} />);
    commit();
    expect(mockAddSaveRequest).toHaveBeenCalled();
    expect(requestArg().damage).toBeUndefined();
    // Nothing owed → closing mid-wait costs only the result card.
    chromeClose();
    expect(onClose).toHaveBeenCalled();
  });

  it('the GM degrees arrive → result card → damage → apply + relay', () => {
    const ui = () => <UseAbilityModal {...props} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();

    gmResolves(rerender, ui, [
      { entryId: 'e-gob', name: 'Goblin', d20: 4, total: 12, degree: 'failure' },
    ]);

    // Frozen degrees from the GM, with the roll that produced them.
    expect(screen.getByText('Failure')).toBeInTheDocument();
    // The headline carries the DC the caster set (there is no caster die);
    // the row repeats it as the target's own DC label.
    expect(document.querySelector('.rs-headline-math').textContent).toBe('Reflex DC 22');
    expect(document.querySelector('.rs-row-dc').textContent).toBe('Reflex DC 22');
    expect(screen.getByText(/rolled 12/)).toBeInTheDocument();
    expect(screen.getByText('Degrees in from the GM.')).toBeInTheDocument();
    // Consumed and dropped so the bounded rail can't evict somebody else's.
    expect(mockClearSaveResolution).toHaveBeenCalledWith('savereq-1');

    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '11' } });
    // A plain failure takes the total full.
    expect(document.querySelector('.rs-breakdown').textContent).toContain('Goblin 11');

    fireEvent.click(screen.getByRole('button', { name: 'Send damage to GM' }));
    // The relay carries the RAW typed total to the bridge (#1016).
    const relay = mockSendUpdate.mock.calls.find((c) => c[1] === 'dmgapply');
    expect(relay[2].hits).toEqual([
      { entryId: 'e-gob', name: 'Goblin', amount: 11, type: 'slashing or piercing' },
    ]);
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Goblin takes 11 from Shard Strike'),
    }));
  });

  it('a basic-save success halves the caster-rolled total', () => {
    const ui = () => <UseAbilityModal {...props} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();
    gmResolves(rerender, ui, [
      { entryId: 'e-gob', name: 'Goblin', d20: 18, total: 26, degree: 'success' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '11' } });
    expect(document.querySelector('.rs-breakdown').textContent).toContain('Goblin 5');
  });

  it('every target critically succeeding skips the amount step entirely', () => {
    const ui = () => <UseAbilityModal {...props} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();
    gmResolves(rerender, ui, [
      { entryId: 'e-gob', name: 'Goblin', d20: 20, total: 40, degree: 'criticalSuccess' },
    ]);
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
    // Nothing to roll — the CTA is the Close pill.
    expect(screen.queryByRole('button', { name: 'Roll damage' })).toBeNull();
    expect(pill().textContent).toBe('Close');
  });

  it('a persistent-only profile applies on arrival — it has no amount step to wait for', () => {
    const polarize = {
      name: 'Polarize', actions: 'Two Actions',
      traits: ['Electricity'], targetDefense: 'fortitude', basic: true,
      damageData: {
        riders: [{
          id: 'polarize-persistent', label: 'Persistent electricity',
          persistent: { dice: '2d4', type: 'electricity' },
          on: ['success', 'failure', 'criticalFailure'],
        }],
      },
    };
    const ui = () => <UseAbilityModal {...props} ability={polarize} />;
    const { rerender } = render(ui());
    commit();
    expect(requestArg().damage).toMatchObject({
      entered: null,
      riders: [{ id: 'polarize-persistent', persistent: { dice: '2d4', type: 'electricity' } }],
    });

    gmResolves(rerender, ui, [
      { entryId: 'e-gob', name: 'Goblin', d20: 4, total: 12, degree: 'failure' },
    ], { abilityName: 'Polarize', save: 'fortitude' });

    // No total to enter, so RollSheet never reaches an amount phase — the
    // appliers fire the moment the degrees land instead, or the bleed is lost.
    expect(screen.queryByRole('button', { name: 'Roll damage' })).toBeNull();
    expect(persistentSetter).toHaveBeenCalled();
  });

  it('the GM dismissing the request bails out of waiting with a gold notice', () => {
    const ui = () => <UseAbilityModal {...props} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();

    // Seen pending once…
    mockEncounter = makeEncounter({
      saveRequests: [{ id: 'savereq-1', casterId: 'char-a', abilityName: 'Shard Strike', status: 'pending' }],
    });
    act(() => { rerender(ui()); });
    expect(guardText()).toBeNull();

    // …then gone, with no resolution behind it.
    mockEncounter = makeEncounter();
    act(() => { rerender(ui()); });
    expect(guardText()).toContain('the GM dismissed this save');
  });

  it('the encounter ending under a waiting sheet bails too', () => {
    const ui = () => <UseAbilityModal {...props} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();
    mockEncounter = makeEncounter({ active: false });
    act(() => { rerender(ui()); });
    expect(guardText()).toContain('The encounter ended');
  });

  it('closing while waiting takes two taps and records the abandoned damage', () => {
    const onClose = vi.fn();
    render(<UseAbilityModal {...props} onClose={onClose} ability={shardStrike} />);
    commit();

    chromeClose();
    // Refused, and it says why. The action is already spent; a silent bail
    // would strand the targets with nobody applying the damage.
    expect(onClose).not.toHaveBeenCalled();
    expect(guardText()).toContain('tap Close again');

    chromeClose();
    expect(onClose).toHaveBeenCalled();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      type: 'system',
      text: expect.stringContaining('left before the saves came back'),
    }));
  });

  it('closing at the amount step takes two taps and leaves the damage unapplied', () => {
    const onClose = vi.fn();
    const ui = () => <UseAbilityModal {...props} onClose={onClose} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();
    gmResolves(rerender, ui, [
      { entryId: 'e-gob', name: 'Goblin', d20: 4, total: 12, degree: 'failure' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));

    chromeClose();
    expect(onClose).not.toHaveBeenCalled();
    expect(guardText()).toContain('not been applied');

    chromeClose();
    expect(onClose).toHaveBeenCalled();
    expect(mockSendUpdate.mock.calls.some((c) => c[1] === 'dmgapply')).toBe(false);
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      type: 'system',
      text: expect.stringContaining('closed without applying damage'),
    }));
  });

  it('the settled receipt lists the degree and what each target took', () => {
    const ui = () => <UseAbilityModal {...props} ability={shardStrike} />;
    const { rerender } = render(ui());
    commit();
    gmResolves(rerender, ui, [
      { entryId: 'e-gob', name: 'Goblin', d20: 4, total: 12, degree: 'failure' },
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
    fireEvent.change(screen.getByLabelText(/rolled damage total/i), { target: { value: '11' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send damage to GM' }));

    const receipt = document.querySelector('.rs-receipt').textContent;
    expect(receipt).toContain('Reflex DC 22');
    expect(receipt).toContain('Goblin — Failure · 11');
  });

  it('attaches casterEffect with resolved allies when the ability has a saveOutcomeEffect (#274)', () => {
    const shiningGuidance = {
      name: 'Shining Guidance', actions: 'Two Actions', defense: 'basic Fortitude', basic: true,
      saveOutcomeEffect: {
        effectId: 'shining-guidance', applyTo: 'all-allies',
        onDegrees: ['success', 'failure', 'criticalFailure'],
        duration: { until: 'caster-turn-end' },
      },
    };
    render(<UseAbilityModal {...props} ability={shiningGuidance} />);
    commit();
    expect(requestArg().casterEffect).toMatchObject({
      casterId: 'char-a',
      def: { effectId: 'shining-guidance', onDegrees: ['success', 'failure', 'criticalFailure'] },
      // 'all-allies' resolves to the only PC in the order
      targets: [{ charId: 'char-a', entryId: 'e-caster' }],
    });
  });

  it('omits casterEffect for a plain save request', () => {
    const plainSave = { name: 'Addling Blast', actions: 'Two Actions', targetDefense: 'will', basic: true };
    render(<UseAbilityModal {...props} ability={plainSave} />);
    commit();
    expect(requestArg().casterEffect).toBeUndefined();
  });

  it("the actor's exploit weakness is serialized with the save target's entryId", () => {
    mockExploit = { targetEntryId: 'e-gob', targetName: 'Goblin', type: 'antithesis', value: 4 };
    render(<UseAbilityModal {...props} ability={shardStrike} />);
    commit();
    expect(requestArg().damage.riders).toContainEqual(
      expect.objectContaining({
        id: 'exploit-weakness', weakness: 4, appliesToEntryIds: ['e-gob'],
      })
    );
  });

  it('cantrip save spells carry the auto-heightened rank and scale the hint (#271)', () => {
    mockCastOptions = [{ type: 'cantrip', label: 'Cantrip — no cost', enabled: true, rank: 2 }];
    const daze = {
      name: 'Daze', level: 0, actions: 'Two Actions',
      traits: ['Cantrip', 'Mental'], targetDefense: 'will', basic: true,
      damageData: { base: '1d6', type: 'mental', heightened: { '+1': { base: '1d6' } } },
    };
    render(<UseAbilityModal {...props} ability={daze} verb="Cast" />);
    // Native rank 1, cast at rank 2 → one '+1' step.
    openEdit();
    expect(screen.getByText('2d6 mental')).toBeInTheDocument();
    commit();
    expect(requestArg().rank).toBe(2);
    expect(requestArg().damage.expression).toBe('2d6');
  });
});
