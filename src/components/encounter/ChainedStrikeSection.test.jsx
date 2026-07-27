// ChainedStrikeSection — unit tests.
// Mocks useCharacter and resolveActionRoll; renders the real SequentialAttackSteps
// driver (#1691, LOCKED design: sequential — Strike, then Strike 2 for Flurry,
// one d20 tap pad at a time, grouped damage entry once both have rolled).

import React, { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import ChainedStrikeSection from './ChainedStrikeSection';

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: vi.fn(),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: vi.fn(),
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: vi.fn(),
}));

import { useCharacter } from '../../hooks/useCharacter';
import { useContent } from '../../contexts/ContentContext';
import { resolveActionRoll } from '../../utils/rollResolution';

// Conditional ('vs X') effect-modifier catalog (#511) — a melee-attack and a
// ranged-attack conditional, so a strike's type picks the right one.
const EFFECT_CATALOG = [
  { id: 'limned', name: 'Limned', modifiers: [{ stat: 'meleeAttack',  kind: 'circumstance', amount: 1, vs: 'limned target' }] },
  { id: 'marked', name: 'Marked', modifiers: [{ stat: 'rangedAttack', kind: 'status',       amount: 1, vs: 'marked target' }] },
];

const UNARMED = { name: 'Unarmed Strike', type: 'melee', traits: ['Attack', 'Unarmed'], attackMod: 8, damage: '1d6+4' };
const CLAW    = { name: 'Claw',           type: 'melee', traits: ['Attack', 'Unarmed', 'Agile'], attackMod: 6, damage: '1d4+4' };

const character = { id: 'Blu', name: 'Blu-Kakke' };
const conditions = [];
const effects = [];

const enemyTargets = [{ entryId: 'e1', name: 'Goblin', defenses: { ac: 15 } }];

beforeEach(() => {
  useCharacter.mockReturnValue({ strikes: [UNARMED, CLAW] });
  useContent.mockReturnValue({ effects: EFFECT_CATALOG });
  resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8 });
});
afterEach(() => vi.clearAllMocks());

// Sequential tap idiom (#1691): one pad per step, one commit pill per step.
const rollPad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) =>
  fireEvent.click(within(rollPad()).getByRole('button', { name: String(n), exact: true }));
const sasPill = () => document.querySelector('.sas-pill');
const rollStep = (face) => { tapFace(face); fireEvent.click(sasPill()); };
// The current step's own heading — distinguishes from the mode radiogroup's
// "Strike" label, which also renders the word "Strike" once flurry is offered.
const currentStepLabel = () => document.querySelector('.sas-step-label')?.textContent;

const strikeChain = {
  into: 'strike',
  cost: 'included',
  modes: ['strike'],
  strikeTrait: 'Unarmed',
  attackBonus: 1,
  damageBonus: '1d6',
};

describe('ChainedStrikeSection — damage step (#222)', () => {
  it('shows the chain-augmented damage expression once the strike hits', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    rollStep(15); // 15 + 9 = 24 vs AC 15 → hit
    expect(document.querySelector('.de-expression')).toHaveTextContent('1d6+4 + 1d6');
  });

  it("includes the actor's exploit weakness rider for matching targets", () => {
    const exploit = { targetEntryId: 'e1', targetName: 'Goblin', type: 'antithesis', value: 4 };
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
        exploit={exploit}
        order={enemyTargets}
      />
    );
    rollStep(15);
    expect(screen.getByText(/weakness \(Personal Antithesis 4\)/)).toBeInTheDocument();
  });

  it('flurry rolls two sequential steps sharing the same damage profile', () => {
    const flurryChain = { ...strikeChain, modes: ['strike', 'flurry'] };
    render(
      <ChainedStrikeSection
        character={character}
        chain={flurryChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    fireEvent.click(screen.getByLabelText('Flurry of Blows'));
    expect(currentStepLabel()).toBe('Strike');
    rollStep(15); // strike 1 hits
    expect(currentStepLabel()).toMatch(/Strike 2 \(MAP/);
    rollStep(15); // strike 2 hits
    // Both hits → two grouped damage rows, same dice on each.
    const rows = document.querySelectorAll('.de-expression');
    expect(rows).toHaveLength(2);
    rows.forEach((r) => expect(r).toHaveTextContent('1d6+4 + 1d6'));
  });
});

describe('ChainedStrikeSection — conditional attack toggles (#511)', () => {
  const limnedEffects = [{ effectId: 'limned' }, { effectId: 'marked' }];

  it("offers the selected strike's matching vs-modifier as a toggle (melee → meleeAttack only)", () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={limnedEffects}
      />
    );
    // The melee strike sources meleeAttack conditionals — the ranged 'Marked' one
    // must not leak in.
    expect(screen.getByRole('button', { name: /Limned \(vs limned target\)/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marked/ })).not.toBeInTheDocument();
  });

  it('flurry gives each strike independent toggle state', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={{ ...strikeChain, modes: ['strike', 'flurry'] }}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={limnedEffects}
      />
    );
    fireEvent.click(screen.getByLabelText('Flurry of Blows'));
    fireEvent.click(screen.getByRole('button', { name: /Limned \(vs limned target\)/ }));
    expect(screen.getByRole('button', { name: /Limned \(vs limned target\)/ })).toHaveAttribute('aria-pressed', 'true');
    rollStep(15); // strike 1
    // Strike 2's toggle starts fresh (unpressed) — independent per-step state.
    expect(screen.getByRole('button', { name: /Limned \(vs limned target\)/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('passes no toggles when the actor has no conditional modifiers', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={[]}
      />
    );
    expect(screen.queryByRole('group', { name: 'situational bonuses' })).not.toBeInTheDocument();
  });
});

describe('ChainedStrikeSection — optional chain (#228)', () => {
  const optionalChain = {
    into: 'strike', optional: true, heading: 'Elemental Blast',
    strikeTrait: 'Unarmed', modes: ['strike'],
  };

  it('renders an include toggle, defaulting to included', () => {
    const ref = createRef();
    render(
      <ChainedStrikeSection
        ref={ref}
        character={character}
        chain={optionalChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.getByLabelText('Include Elemental Blast')).toBeChecked();
    expect(screen.getByText('Strike')).toBeInTheDocument();
    expect(ref.current.getResults()).not.toBeNull();
  });

  it('unticking collapses the section and reports no strike', () => {
    const ref = createRef();
    render(
      <ChainedStrikeSection
        ref={ref}
        character={character}
        chain={optionalChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    fireEvent.click(screen.getByLabelText('Include Elemental Blast'));
    expect(screen.queryByText('Strike')).toBeNull();
    expect(screen.queryByLabelText('strike picker')).toBeNull();
    expect(ref.current.getResults()).toBeNull();
  });

  it('non-optional chains render no toggle', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.queryByLabelText(/^Include /)).toBeNull();
  });
});

describe('ChainedStrikeSection', () => {
  it('filters strikes by trait — only Unarmed strikes shown', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    const picker = screen.getByLabelText('strike picker');
    expect(picker.options.length).toBe(2); // Unarmed Strike + Claw (both have Unarmed trait)
  });

  it('shows only strikes matching the strikeTrait', () => {
    useCharacter.mockReturnValue({
      strikes: [
        UNARMED,
        CLAW,
        { name: 'Sword', type: 'melee', traits: ['Attack', 'Martial'], attackMod: 10, damage: '1d8+4' },
      ],
    });
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    const opts = Array.from(screen.getByLabelText('strike picker').options).map((o) => o.value);
    expect(opts).toContain('Unarmed Strike');
    expect(opts).toContain('Claw');
    expect(opts).not.toContain('Sword');
  });

  it('shows augmented attack = base + chain.attackBonus', () => {
    // resolveActionRoll returns bonus: 8; chain.attackBonus = 1 → display +9
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    // RollEntry's own heading also shows "+9" (the same bonus) — scope to the
    // chain's own attack-stat line.
    expect(document.querySelector('.uam-chain-stat')).toHaveTextContent('+9');
  });

  it('shows augmented damage = strike.damage + chain.damageBonus', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.getByText(/1d6\+4 \+ 1d6/)).toBeInTheDocument();
  });

  it('renders one sequential step for strike mode', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.getByText('Strike')).toBeInTheDocument();
    expect(screen.queryByText(/Strike 2/)).toBeNull();
  });

  it('renders the second step only after entering flurry mode', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={{ ...strikeChain, modes: ['strike', 'flurry'] }}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    fireEvent.click(screen.getByLabelText('Flurry of Blows'));
    expect(currentStepLabel()).toBe('Strike');
    rollStep(15);
    expect(currentStepLabel()).toMatch(/Strike 2 \(MAP/);
  });

  it('shows mode selector only when multiple modes are configured', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}  // single mode
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.queryByLabelText('Strike')).not.toBeInTheDocument();

    render(
      <ChainedStrikeSection
        character={character}
        chain={{ ...strikeChain, modes: ['strike', 'flurry'] }}
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.getByLabelText('Strike')).toBeInTheDocument();
    expect(screen.getByLabelText('Flurry of Blows')).toBeInTheDocument();
  });

  it('getResults returns mode, strikeName, attackBonus, damage, and rolls — once rolled', () => {
    const ref = createRef();
    render(
      <ChainedStrikeSection
        ref={ref}
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(ref.current.getResults().rolls).toHaveLength(0); // nothing committed yet
    rollStep(15);
    const res = ref.current.getResults();
    expect(res.mode).toBe('strike');
    expect(res.strikeName).toBe('Unarmed Strike');
    expect(res.attackBonus).toBe(9); // 8 base + 1 chain bonus
    expect(res.damage).toBe('1d6+4 + 1d6');
    expect(res.rolls).toHaveLength(1);
    expect(res.rolls[0][0]).toMatchObject({ name: 'Goblin', degree: 'success' });
  });

  it('getResults for flurry returns two roll sets, sequentially', () => {
    const ref = createRef();
    render(
      <ChainedStrikeSection
        ref={ref}
        character={character}
        chain={{ ...strikeChain, modes: ['strike', 'flurry'] }}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    fireEvent.click(screen.getByLabelText('Flurry of Blows'));
    rollStep(15);
    expect(ref.current.getResults().rolls).toHaveLength(1);
    rollStep(15);
    const res = ref.current.getResults();
    expect(res.mode).toBe('flurry');
    expect(res.rolls).toHaveLength(2);
  });

  it('shows empty-state message when no qualifying strikes', () => {
    useCharacter.mockReturnValue({ strikes: [] });
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={[]}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.getByText(/No qualifying strikes/i)).toBeInTheDocument();
  });

  describe('Multiple Attack Penalty', () => {
    const flurryChain = { ...strikeChain, modes: ['flurry'] };

    beforeEach(() => {
      // Mirror the real resolver: −5 per MAP step off the base bonus.
      resolveActionRoll.mockImplementation((ability, char, opts = {}) => ({
        mode: 'actor-roll',
        bonus: 8 - (opts.mapStep || 0) * 5,
      }));
    });

    it('flurry strike 2 gets the next MAP step bonus', () => {
      render(
        <ChainedStrikeSection
          character={character}
          chain={flurryChain}
          enemyTargets={enemyTargets}
          conditions={conditions}
          effects={effects}
          mapStep={0}
        />
      );
      // strike 1: 8 + 1 chain bonus = 9; strike 2: (8−5) + 1 = 4
      expect(document.querySelector('.uam-chain-stat')).toHaveTextContent('+9');
      rollStep(15);
      expect(currentStepLabel()).toMatch(/Strike 2 \(MAP -5\)/);
    });

    it('labels strike 2 with the applied penalty (−5 non-agile)', () => {
      render(
        <ChainedStrikeSection
          character={character}
          chain={flurryChain}
          enemyTargets={enemyTargets}
          conditions={conditions}
          effects={effects}
          mapStep={0}
        />
      );
      rollStep(15);
      expect(screen.getByText('Strike 2 (MAP -5)')).toBeInTheDocument();
    });

    it('labels strike 2 with −4 for an agile strike', () => {
      render(
        <ChainedStrikeSection
          character={character}
          chain={flurryChain}
          enemyTargets={enemyTargets}
          conditions={conditions}
          effects={effects}
          mapStep={0}
        />
      );
      fireEvent.change(screen.getByLabelText('strike picker'), { target: { value: 'Claw' } });
      rollStep(15);
      expect(screen.getByText('Strike 2 (MAP -4)')).toBeInTheDocument();
    });

    it('passes the incoming mapStep through and clamps strike 2 at step 2', () => {
      render(
        <ChainedStrikeSection
          character={character}
          chain={flurryChain}
          enemyTargets={enemyTargets}
          conditions={conditions}
          effects={effects}
          mapStep={2}
        />
      );
      const calls = resolveActionRoll.mock.calls;
      expect(calls.some(([, , opts]) => opts.mapStep === 2)).toBe(true);
      expect(calls.every(([, , opts]) => opts.mapStep <= 2)).toBe(true);
    });
  });
});
