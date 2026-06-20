import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChainedSpellSection from './ChainedSpellSection';
import { resolveActionRoll } from '../../utils/rollResolution';

vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: vi.fn(),
}));
vi.mock('../../utils/defense', () => ({
  DEFENSE_LABELS: { ac: 'AC', fortitude: 'Fortitude', reflex: 'Reflex', will: 'Will' },
  DEFENSE_OPTIONS: [{ value: 'ac', label: 'AC' }],
  defenseDC: vi.fn(() => 15),
}));
vi.mock('./TargetRollResolver', () => {
  const { forwardRef, useImperativeHandle } = require('react');

  return { default: forwardRef(({ enemyTargets, rollBonus, damage }, ref) => {
    useImperativeHandle(ref, () => ({
      getResults: () => enemyTargets.map((e) => ({
        entryId: e.entryId, name: e.name, dc: 15, total: (rollBonus || 0) + 10, degree: 'success',
      })),
    }));
    const React = require('react');
    // Echo the damage prop (#571) so tests can assert the section builds and
    // forwards a profile for damaging attack spells.
    return React.createElement(
      'div',
      { 'data-testid': 'spell-resolver', 'data-damage': damage ? damage.expression : 'none' },
      `bonus=${rollBonus}`
    );
  }) };
});


const FIREBALL = { id: 'fireball', name: 'Fireball', actions: 'Two Actions', range: '500 feet', defense: 'Reflex' };
const LIGHT    = { id: 'light',    name: 'Light',    actions: 'Two Actions', range: '120 feet' };
const HEAL     = { id: 'heal',     name: 'Heal',     actions: 'Two Actions' }; // no range

const character = {
  id: 'Jade',
  name: 'JadeInferno',
  spellcasting: { spells: [LIGHT, FIREBALL, HEAL] },
};

const reachChain = { into: 'spell', cost: 'added', spellFilter: 'has-range', modifier: 'Range increased by 30 feet' };
const harrowChain = { into: 'spell', cost: 'added', spellFilter: 'any', modifier: 'Draw a Harrow card' };

const enemyTargets = [{ entryId: 'e1', name: 'Goblin', defenses: { ac: { value: 15 } } }];

beforeEach(() => {
  resolveActionRoll.mockReturnValue({ mode: 'none', bonus: null, dc: null, defense: null });
});
afterEach(() => vi.clearAllMocks());

describe('ChainedSpellSection', () => {
  it('filters spells to has-range only when spellFilter is has-range', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    const opts = Array.from(screen.getByLabelText('spell picker').options).map((o) => o.text);
    expect(opts.some((t) => t.includes('Light'))).toBe(true);
    expect(opts.some((t) => t.includes('Fireball'))).toBe(true);
    expect(opts.some((t) => t.includes('Heal'))).toBe(false); // no range
  });

  it('shows all spells when spellFilter is any', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    const opts = Array.from(screen.getByLabelText('spell picker').options).map((o) => o.text);
    expect(opts.some((t) => t.includes('Heal'))).toBe(true);
  });

  it('shows the modifier note', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByText(/Range increased by 30 feet/)).toBeInTheDocument();
  });

  it('shows correct additive total cost (parent + spell)', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    // Light is 2 actions, parent is 1 → total 3
    expect(screen.getByText(/Total: 3 action/)).toBeInTheDocument();
    expect(screen.getByText(/\(1 \+ 2\)/)).toBeInTheDocument();
  });

  it('updates total cost when a different spell is selected', () => {
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [
          { id: 's1', name: 'Cantrip', actions: 'One Action', range: '30 feet' },
          { id: 's2', name: 'BigSpell', actions: 'Three Actions', range: '60 feet' },
        ]}}}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByText(/Total: 2 action/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 's2' } });
    expect(screen.getByText(/Total: 4 action/)).toBeInTheDocument();
  });

  it('notifies parent via onTotalCostChange when spell changes', () => {
    const onCostChange = vi.fn();
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [
          { id: 's1', name: 'A', actions: 'One Action', range: '30 feet' },
          { id: 's2', name: 'B', actions: 'Two Actions', range: '60 feet' },
        ]}}}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
        onTotalCostChange={onCostChange}
      />
    );
    expect(onCostChange).toHaveBeenCalledWith(2); // initial: 1+1
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 's2' } });
    expect(onCostChange).toHaveBeenCalledWith(3); // after change: 1+2
  });

  it('shows TargetRollResolver when spell resolves to actor-roll mode', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={enemyTargets}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByTestId('spell-resolver')).toBeInTheDocument();
  });

  it('getResults returns spellId, spellName, totalCost, and roll results', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={enemyTargets}
        conditions={[]}
        effects={[]}
      />
    );
    const res = ref.current.getResults();
    expect(res.spellName).toBe('Light');
    expect(res.totalCost).toBe(3); // 1+2
    expect(res.rollResults).toHaveLength(1);
    expect(res.rollResults[0]).toMatchObject({ name: 'Goblin', degree: 'success' });
  });

  it('getTotalCost returns the current total', () => {
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(ref.current.getTotalCost()).toBe(3); // Light (2) + parent (1)
  });

  it('shows empty-state when no qualifying spells', () => {
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [HEAL] } }}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.getByText(/No qualifying spells/i)).toBeInTheDocument();
  });
});

// Rank picking + heightening for chained casts (#235). The resources prop is
// the parent's useCastingResources instance; stubbed here.
describe('ChainedSpellSection rank picker', () => {
  const SIGNATURE = {
    id: 'fear', name: 'Fear', actions: 'Two Actions', range: '30 feet',
    level: 1, signature: true,
    heightened: { '3rd': 'You can target up to five creatures.' },
  };
  const NATIVE_ONLY = {
    id: 'mage-armor', name: 'Mage Armor', actions: 'Two Actions', range: '30 feet', level: 1,
  };
  const CANTRIP = {
    id: 'detect-magic', name: 'Detect Magic', actions: 'Two Actions', range: '30 feet', level: 0,
  };

  const signatureOptions = [
    { type: 'slot', rank: 1, label: 'Rank 1 slot (2 left)', enabled: true },
    { type: 'slot', rank: 2, label: 'Rank 2 slot (1 left)', enabled: true },
    { type: 'slot', rank: 3, label: 'Rank 3 slot (0 left)', enabled: false, reason: 'No rank-3 slots remaining' },
  ];

  const makeResources = (optionsBySpellId) => ({
    optionsFor: vi.fn((spell) => optionsBySpellId[spell.id] || []),
    spend: vi.fn(() => ({ ok: true, label: 'rank 1 slot' })),
  });

  const renderWithResources = (spells, resources, ref) =>
    render(
      <ChainedSpellSection
        ref={ref}
        character={{ ...character, spellcasting: { spells } }}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
        resources={resources}
      />
    );

  it('renders one radio per rank option for a signature spell', () => {
    renderWithResources([SIGNATURE], makeResources({ fear: signatureOptions }));
    const group = screen.getByRole('radiogroup', { name: /chained casting source/i });
    expect(group).toBeInTheDocument();
    expect(screen.getByText('Rank 1 slot (2 left)')).toBeInTheDocument();
    expect(screen.getByText('Rank 2 slot (1 left)')).toBeInTheDocument();
    expect(screen.getByText('Rank 3 slot (0 left)')).toBeInTheDocument();
  });

  it('getResults carries the chosen option and rank; spellRank stays native', () => {
    const ref = createRef();
    renderWithResources([SIGNATURE], makeResources({ fear: signatureOptions }), ref);
    fireEvent.click(screen.getByRole('radio', { name: /rank 2 slot/i }));
    const res = ref.current.getResults();
    expect(res.castOption).toMatchObject({ type: 'slot', rank: 2 });
    expect(res.castRank).toBe(2);
    expect(res.spellRank).toBe(1);
  });

  it('shows heightened text only above native rank', () => {
    renderWithResources([SIGNATURE], makeResources({ fear: signatureOptions }));
    // default = rank 1 (native) → no heightened block
    expect(screen.queryByText(/target up to five creatures/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /rank 3 slot/i }));
    expect(screen.getByText(/target up to five creatures/)).toBeInTheDocument();
  });

  it('non-signature spell shows a single cost line, no radio group', () => {
    const ref = createRef();
    const resources = makeResources({
      'mage-armor': [{ type: 'slot', rank: 1, label: 'Rank 1 slot (2 left)', enabled: true }],
    });
    renderWithResources([NATIVE_ONLY], resources, ref);
    expect(screen.queryByRole('radiogroup', { name: /chained casting source/i })).not.toBeInTheDocument();
    expect(screen.getByText('Rank 1 slot (2 left)')).toBeInTheDocument();
    expect(ref.current.getResults().castRank).toBe(1);
  });

  it('cantrip shows the free label and no rank in results', () => {
    const ref = createRef();
    const resources = makeResources({
      'detect-magic': [{ type: 'cantrip', label: 'Cantrip — no cost', enabled: true }],
    });
    renderWithResources([CANTRIP], resources, ref);
    expect(screen.getByText('Cantrip — no cost')).toBeInTheDocument();
    const res = ref.current.getResults();
    expect(res.castOption).toMatchObject({ type: 'cantrip' });
    expect(res.castRank).toBe(0);
  });

  it('without the resources prop getResults reports no cast option', () => {
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={{ ...character, spellcasting: { spells: [SIGNATURE] } }}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.queryByRole('radiogroup', { name: /chained casting source/i })).not.toBeInTheDocument();
    const res = ref.current.getResults();
    expect(res.castOption).toBeNull();
    expect(res.castRank).toBe(1);
  });

  it('switching spells resets the rank choice to the default option', () => {
    const ref = createRef();
    const resources = makeResources({
      fear: signatureOptions,
      'mage-armor': [{ type: 'slot', rank: 1, label: 'Rank 1 slot (2 left)', enabled: true }],
    });
    renderWithResources([SIGNATURE, NATIVE_ONLY], resources, ref);
    fireEvent.click(screen.getByRole('radio', { name: /rank 2 slot/i }));
    expect(ref.current.getResults().castRank).toBe(2);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'mage-armor' } });
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'fear' } });
    expect(ref.current.getResults().castRank).toBe(1); // back to first enabled
  });
});

describe('ChainedSpellSection — Harrow Cast (#227)', () => {
  const harrowCastChain = { into: 'spell', cost: 'added', spellFilter: 'any', harrow: true };

  const renderHarrow = (ref) => render(
    <ChainedSpellSection
      ref={ref}
      character={character}
      chain={harrowCastChain}
      parentCost={1}
      enemyTargets={[]}
      conditions={[]}
      effects={[]}
    />
  );

  beforeEach(() => localStorage.clear());

  it('non-harrow chains render no Harrow Cast group', () => {
    render(
      <ChainedSpellSection
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(screen.queryByRole('group', { name: 'Harrow Cast' })).toBeNull();
  });

  it('renders the suit picker and reports the drawn suit + effect via getResults', () => {
    const ref = createRef();
    renderHarrow(ref);
    expect(screen.getByRole('group', { name: 'Harrow Cast' })).toBeInTheDocument();
    expect(ref.current.getResults().harrow).toMatchObject({ drawnSuit: null, omenSuit: null });

    fireEvent.click(screen.getByLabelText('drawn-Keys'));
    const harrow = ref.current.getResults().harrow;
    expect(harrow.drawnSuit).toBe('Keys');
    expect(harrow.match).toBe(false);
    expect(harrow.effect).toMatchObject({ kind: 'self-effect', effectId: 'harrow-key-ward' });
  });

  it('detects an omen match and upgrades the suit effect', () => {
    localStorage.setItem('cnmh_omen_Jade', JSON.stringify({ suit: 'Keys', ts: 1 }));
    const ref = createRef();
    renderHarrow(ref);

    fireEvent.click(screen.getByLabelText('drawn-Keys'));
    const harrow = ref.current.getResults().harrow;
    expect(harrow.match).toBe(true);
    expect(harrow.effect.effectId).toBe('harrow-key-ward-2');
    expect(screen.getByText(/omen match/)).toBeInTheDocument();
  });

  it('computes the DC 11 flat check from the entered d20', () => {
    const ref = createRef();
    renderHarrow(ref);
    const input = screen.getByLabelText('harrow flat check d20');

    fireEvent.change(input, { target: { value: '10' } });
    expect(screen.getByText(/failed — omen lost at end of turn/)).toBeInTheDocument();
    expect(ref.current.getResults().harrow.flatPassed).toBe(false);

    fireEvent.change(input, { target: { value: '11' } });
    expect(screen.getByText('passed')).toBeInTheDocument();
    expect(ref.current.getResults().harrow).toMatchObject({ flatD20: 11, flatPassed: true });
  });

  it('shows the healing input for Shields and carries the entered total', () => {
    const ref = createRef();
    renderHarrow(ref);
    expect(screen.queryByLabelText('harrow healing rolled')).toBeNull();

    fireEvent.click(screen.getByLabelText('drawn-Shields'));
    fireEvent.change(screen.getByLabelText('harrow healing rolled'), { target: { value: '9' } });
    const harrow = ref.current.getResults().harrow;
    expect(harrow.effect.kind).toBe('self-heal');
    expect(harrow.healEntered).toBe(9);
  });
});

// Blood magic trigger surface (#227): the section reports the live spell pick
// and whether the chosen spell carries the bloodline flag.
describe('ChainedSpellSection — bloodline surface (#227)', () => {
  const FORCE = { id: 'force', name: 'Force Barrage', actions: 'Two Actions', range: '120 feet', bloodline: true };

  it('notifies the parent of the selected spell via onSpellChange', () => {
    const onSpellChange = vi.fn();
    render(
      <ChainedSpellSection
        character={{ ...character, spellcasting: { spells: [LIGHT, FORCE] } }}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
        onSpellChange={onSpellChange}
      />
    );
    expect(onSpellChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Light' }));
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'force' } });
    expect(onSpellChange).toHaveBeenCalledWith(expect.objectContaining({ name: 'Force Barrage' }));
  });

  it('getResults reports spellBloodline for flagged spells only', () => {
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={{ ...character, spellcasting: { spells: [LIGHT, FORCE] } }}
        chain={harrowChain}
        parentCost={1}
        enemyTargets={[]}
        conditions={[]}
        effects={[]}
      />
    );
    expect(ref.current.getResults().spellBloodline).toBe(false);
    fireEvent.change(screen.getByLabelText('spell picker'), { target: { value: 'force' } });
    expect(ref.current.getResults().spellBloodline).toBe(true);
  });
});

// Damage payload for a chained basic-save spell (#281): the section builds a
// save-mode damage panel at its own cast rank and surfaces the entered total +
// serialized rider snapshot through getResults(), so the parent's chained
// addSaveRequest attaches `damage` the same way the direct path does.
describe('ChainedSpellSection — save damage payload (#281)', () => {
  const FIREBALL_SAVE = {
    id: 'fireball', name: 'Fireball', actions: 'Two Actions', range: '500 feet',
    level: 3, defense: 'Reflex', basic: true,
    damageData: { base: '6d6', type: 'fire' },
  };
  const PLAIN_SAVE = {
    id: 'fear', name: 'Fear', actions: 'Two Actions', range: '30 feet',
    level: 1, defense: 'Will', basic: true, // no damageData → no panel
  };
  const VAR_SAVE = {
    id: 'vsave', name: 'Variable Blast', actions: 'One to Three Actions', range: '60 feet',
    level: 1, defense: 'Reflex', basic: true,
    damageData: { base: '2d6', type: 'fire' }, // variable-action → deferred to #572
  };
  const saveEnemies = [{ entryId: 'e1', name: 'Goblin', defenses: { saves: { reflex: 8 } } }];

  const renderSave = (spells, ref) => render(
    <ChainedSpellSection
      ref={ref}
      character={{ ...character, spellcasting: { spells } }}
      chain={harrowChain}
      parentCost={1}
      enemyTargets={saveEnemies}
      conditions={[]}
      effects={[]}
    />
  );

  beforeEach(() => {
    resolveActionRoll.mockReturnValue({ mode: 'target-save', bonus: null, dc: 22, defense: 'reflex' });
  });

  it('renders the save-mode damage panel for a damaging basic-save spell', () => {
    renderSave([FIREBALL_SAVE]);
    expect(screen.getByLabelText('rolled damage total')).toBeInTheDocument();
    expect(screen.getByText(/6d6/)).toBeInTheDocument(); // hint expression at cast rank
  });

  it('getResults carries the entered total, expression, type, and basic flag', () => {
    const ref = createRef();
    renderSave([FIREBALL_SAVE], ref);
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '21' } });
    const res = ref.current.getResults();
    expect(res.spellBasic).toBe(true);
    expect(res.damage).toMatchObject({ entered: 21, expression: '6d6', typeLabel: 'fire', riders: [] });
  });

  it('reports no damage payload until the caster enters a total', () => {
    const ref = createRef();
    renderSave([FIREBALL_SAVE], ref);
    expect(ref.current.getResults().damage).toBeNull();
  });

  it('non-damaging save spell renders no panel and carries no damage', () => {
    const ref = createRef();
    renderSave([PLAIN_SAVE], ref);
    expect(screen.queryByLabelText('rolled damage total')).toBeNull();
    const res = ref.current.getResults();
    expect(res.damage).toBeNull();
    expect(res.spellBasic).toBe(true);
  });

  it('variable-action save spell is deferred (no panel, no payload) — #572', () => {
    const ref = createRef();
    renderSave([VAR_SAVE], ref);
    expect(screen.queryByLabelText('rolled damage total')).toBeNull();
    expect(ref.current.getResults().damage).toBeNull();
  });
});

// Damage panel for a chained attack spell (#571): the section builds an
// attack-mode profile at its own cast rank and forwards it to the resolver,
// which owns the panel + per-target math. Variable-action spells are deferred
// to #572 (no action-count picker → no pinned tier).
describe('ChainedSpellSection — attack damage panel (#571)', () => {
  const SCORCH = {
    id: 'scorch', name: 'Scorching Ray', actions: 'Two Actions', range: '120 feet',
    level: 3, traits: ['Attack', 'Fire'], targetDefense: 'ac',
    damageData: { base: '6d6', type: 'fire' },
  };
  const PLAIN_ATTACK = {
    id: 'ray', name: 'Telekinetic Bolt', actions: 'Two Actions', range: '60 feet',
    level: 1, traits: ['Attack'], targetDefense: 'ac', // no damageData → no profile
  };
  const VAR_ATTACK = {
    id: 'vbolt', name: 'Variable Bolt', actions: 'One to Three Actions', range: '60 feet',
    level: 1, traits: ['Attack'], targetDefense: 'ac',
    damageData: { base: '2d6', type: 'fire' }, // variable-action → deferred to #572
  };
  const attackEnemies = [{ entryId: 'e1', name: 'Goblin', defenses: { ac: { value: 15 } } }];

  const renderAttack = (spells) => render(
    <ChainedSpellSection
      character={{ ...character, spellcasting: { spells } }}
      chain={reachChain}
      parentCost={1}
      enemyTargets={attackEnemies}
      conditions={[]}
      effects={[]}
    />
  );

  beforeEach(() => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, dc: null, defense: 'ac' });
  });

  it('forwards a damage profile to the resolver for a damaging attack spell', () => {
    renderAttack([SCORCH]);
    expect(screen.getByTestId('spell-resolver')).toHaveAttribute('data-damage', '6d6');
  });

  it('forwards no profile for a non-damaging attack spell', () => {
    renderAttack([PLAIN_ATTACK]);
    expect(screen.getByTestId('spell-resolver')).toHaveAttribute('data-damage', 'none');
  });

  it('defers variable-action attack spells (no profile) — #572', () => {
    renderAttack([VAR_ATTACK]);
    expect(screen.getByTestId('spell-resolver')).toHaveAttribute('data-damage', 'none');
  });
});

describe('ChainedSpellSection — Split Shot (#227)', () => {
  const splitChain = { into: 'spell', cost: 'added', spellFilter: 'single-target-attack', splitShot: true };

  const TKP   = { id: 'tkp',   name: 'Telekinetic Projectile', actions: 'Two Actions', range: '30 feet',  targets: '1 creature',         traits: ['Attack', 'Cantrip'] };
  const GRASP = { id: 'grasp', name: 'Shocking Grasp',         actions: 'Two Actions', range: 'Touch',    targets: '1 creature',         traits: ['Attack'] };
  const BOLT  = { id: 'bolt',  name: 'Blazing Bolt',           actions: 'Two Actions', range: '60 feet',  targets: '1 or more creature', traits: ['Attack'] };
  const SAVE  = { id: 'sb',    name: 'Sudden Bolt',            actions: 'Two Actions', range: '600 feet', targets: '1 creature',         traits: ['Electricity'] };
  const SUSTAINED = { id: 'sus', name: 'Sustained Ray', actions: 'Two Actions', range: '60 feet', targets: '1 creature', traits: ['Attack'], duration: 'sustained up to 1 minute' };

  const splitCharacter = { ...character, spellcasting: { spells: [TKP, GRASP, BOLT, SAVE, SUSTAINED] } };
  const twoTargets = [
    { entryId: 'g1', name: 'Goblin', defenses: { ac: 15 } },
    { entryId: 'g2', name: 'Orc',    defenses: { ac: 17 } },
  ];

  const renderSplit = (ref, targets = twoTargets) => render(
    <ChainedSpellSection
      ref={ref}
      character={splitCharacter}
      chain={splitChain}
      parentCost={1}
      enemyTargets={targets}
      conditions={[]}
      effects={[]}
    />
  );

  it('filters to ranged single-target attack spells without a duration', () => {
    renderSplit(createRef(), []);
    const opts = Array.from(screen.getByLabelText('spell picker').options).map((o) => o.text);
    expect(opts.some((t) => t.includes('Telekinetic Projectile'))).toBe(true);
    expect(opts.some((t) => t.includes('Shocking Grasp'))).toBe(false);  // touch
    expect(opts.some((t) => t.includes('Blazing Bolt'))).toBe(false);    // multi-target
    expect(opts.some((t) => t.includes('Sudden Bolt'))).toBe(false);     // no attack roll
    expect(opts.some((t) => t.includes('Sustained Ray'))).toBe(false);   // has a duration
  });

  it('prompts for two targets while fewer are selected', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    renderSplit(createRef(), [twoTargets[0]]);
    expect(screen.getByText(/Select two enemy targets/)).toBeInTheDocument();
    expect(screen.queryByRole('radiogroup', { name: 'Second target' })).toBeNull();
  });

  it('defaults the second target to the second selected enemy', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    const ref = createRef();
    renderSplit(ref);
    expect(screen.getByRole('radiogroup', { name: 'Second target' })).toBeInTheDocument();
    expect(screen.getByText(/Orc takes half damage/)).toBeInTheDocument();
    expect(ref.current.getResults().splitShot).toMatchObject({
      secondaryEntryId: 'g2',
      secondaryName: 'Orc',
    });
  });

  it('lets the caster re-designate the second target', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    const ref = createRef();
    renderSplit(ref);
    fireEvent.click(screen.getByLabelText('second-target-Goblin'));
    expect(ref.current.getResults().splitShot).toMatchObject({
      secondaryEntryId: 'g1',
      secondaryName: 'Goblin',
    });
    expect(screen.getByText(/Goblin takes half damage/)).toBeInTheDocument();
  });

  it('warns when more than two targets are selected', () => {
    resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8, defense: 'ac', dc: null });
    renderSplit(createRef(), [...twoTargets, { entryId: 'g3', name: 'Bugbear', defenses: { ac: 18 } }]);
    expect(screen.getByText(/exactly two targets — deselect 1/)).toBeInTheDocument();
  });

  it('non-split chains report no splitShot in getResults', () => {
    const ref = createRef();
    render(
      <ChainedSpellSection
        ref={ref}
        character={character}
        chain={reachChain}
        parentCost={1}
        enemyTargets={twoTargets}
        conditions={[]}
        effects={[]}
      />
    );
    expect(ref.current.getResults().splitShot).toBeNull();
  });
});
