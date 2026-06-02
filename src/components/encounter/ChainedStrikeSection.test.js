// ChainedStrikeSection — unit tests.
// Mocks useCharacter and resolveActionRoll; stubs TargetRollResolver.

import React, { createRef } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ChainedStrikeSection from './ChainedStrikeSection';

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: jest.fn(),
}));
jest.mock('../../utils/rollResolution', () => ({
  resolveActionRoll: jest.fn(),
}));
jest.mock('./TargetRollResolver', () => {
  const { forwardRef, useImperativeHandle } = require('react');
  // eslint-disable-next-line react/display-name
  return forwardRef(({ enemyTargets, rollBonus }, ref) => {
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
    return React.createElement('div', { 'data-testid': `resolver-${enemyTargets.length}` }, `bonus=${rollBonus}`);
  });
});

const { useCharacter } = require('../../hooks/useCharacter');
const { resolveActionRoll } = require('../../utils/rollResolution');

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
afterEach(() => jest.clearAllMocks());

const strikeChain = {
  into: 'strike',
  cost: 'included',
  modes: ['strike'],
  strikeTrait: 'Unarmed',
  attackBonus: 1,
  damageBonus: '1d6',
};

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
});
