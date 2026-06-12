// ChainedStrikeSection — unit tests.
// Mocks useCharacter and resolveActionRoll; stubs TargetRollResolver.

import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChainedStrikeSection from './ChainedStrikeSection';

vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: vi.fn(),
}));
vi.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: vi.fn(),
}));
vi.mock('./TargetRollResolver', () => {
  const { forwardRef, useImperativeHandle } = require('react');
   
  return { default: forwardRef(({ enemyTargets, rollBonus, damage }, ref) => {
    useImperativeHandle(ref, () => ({
      getResults: () => enemyTargets.map((e) => ({
        entryId: e.entryId,
        name: e.name,
        dc: 15,
        total: (rollBonus || 0) + 10,
        degree: 'success',
      })),
    }));
    const React = require('react');
    return React.createElement('div', {
      'data-testid': `resolver-${enemyTargets.length}`,
      'data-damage-expression': damage ? damage.expression : '',
      'data-damage-riders': damage ? damage.riders.map((r) => r.id).join(',') : '',
    }, `bonus=${rollBonus}`);
  }) };
});

import { useCharacter } from '../../hooks/useCharacter';
import { resolveActionRoll } from '../../utils/rollResolution';

const UNARMED = { name: 'Unarmed Strike', type: 'melee', traits: ['Attack', 'Unarmed'], attackMod: 8, damage: '1d6+4' };
const CLAW    = { name: 'Claw',           type: 'melee', traits: ['Attack', 'Unarmed', 'Agile'], attackMod: 6, damage: '1d4+4' };

const character = { id: 'Blu', name: 'Blu-Kakke' };
const conditions = [];
const effects = [];

const enemyTargets = [{ entryId: 'e1', name: 'Goblin', defenses: { ac: { value: 15 } } }];

beforeEach(() => {
  useCharacter.mockReturnValue({ strikes: [UNARMED, CLAW] });
  resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 8 });
});
afterEach(() => vi.clearAllMocks());

const strikeChain = {
  into: 'strike',
  cost: 'included',
  modes: ['strike'],
  strikeTrait: 'Unarmed',
  attackBonus: 1,
  damageBonus: '1d6',
};

describe('ChainedStrikeSection — damage step (#222)', () => {
  it('passes a damage profile with the chain-augmented expression to the resolver', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    expect(screen.getByTestId('resolver-1'))
      .toHaveAttribute('data-damage-expression', '1d6+4 + 1d6');
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
    expect(screen.getByTestId('resolver-1'))
      .toHaveAttribute('data-damage-riders', 'exploit-weakness');
  });

  it('flurry passes the same profile to both resolvers', () => {
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
    const resolvers = screen.getAllByTestId('resolver-1');
    expect(resolvers).toHaveLength(2);
    for (const r of resolvers) {
      expect(r).toHaveAttribute('data-damage-expression', '1d6+4 + 1d6');
    }
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
    // No "Claw" without Unarmed — here both pass; check no weapon without the trait
    // Add a weapon strike WITHOUT the trait to verify filtering
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
    expect(screen.getByText(/\+9/)).toBeInTheDocument();
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

  it('renders one TargetRollResolver for strike mode', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={strikeChain}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    // resolvers are named by enemy count
    expect(screen.getAllByTestId('resolver-1')).toHaveLength(1);
  });

  it('renders two TargetRollResolvers for flurry mode', () => {
    render(
      <ChainedStrikeSection
        character={character}
        chain={{ ...strikeChain, modes: ['strike', 'flurry'] }}
        enemyTargets={enemyTargets}
        conditions={conditions}
        effects={effects}
      />
    );
    // Click Flurry radio
    fireEvent.click(screen.getByLabelText('Flurry of Blows'));
    expect(screen.getAllByTestId('resolver-1')).toHaveLength(2);
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

  it('getResults returns mode, strikeName, attackBonus, damage, and rolls', () => {
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
    const res = ref.current.getResults();
    expect(res.mode).toBe('strike');
    expect(res.strikeName).toBe('Unarmed Strike');
    expect(res.attackBonus).toBe(9); // 8 base + 1 chain bonus
    expect(res.damage).toBe('1d6+4 + 1d6');
    expect(res.rolls).toHaveLength(1);
    expect(res.rolls[0][0]).toMatchObject({ name: 'Goblin', degree: 'success' });
  });

  it('getResults for flurry returns two roll sets', () => {
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

    it('flurry strike 2 resolver gets the next MAP step bonus', () => {
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
      const resolvers = screen.getAllByTestId('resolver-1');
      expect(resolvers[0]).toHaveTextContent('bonus=9');
      expect(resolvers[1]).toHaveTextContent('bonus=4');
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
      expect(screen.getByText('Strike 2 (MAP -5):')).toBeInTheDocument();
      expect(screen.queryByText(/MAP not applied/)).not.toBeInTheDocument();
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
      expect(screen.getByText('Strike 2 (MAP -4):')).toBeInTheDocument();
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
