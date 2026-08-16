// useOpposedReactionResolution (#226-C, extracted #1317 D3) — the reaction
// resolver for abilities that resolve against a GM-called DC (Upstage,
// Disrupting Performance) rather than a target's defense. Had no dedicated
// test file before #1749's hidden-picker sweep; this covers the section's
// `enemyOptions` candidate list, which the sweep filters through
// `visibleOrder` (mirrors useTargeting.selectable).
import React from 'react';
import { render, screen } from '@testing-library/react';
import { useOpposedReactionResolution } from './useOpposedReactionResolution';

const character = { id: 'char-a', name: 'Brimstone', level: 5 };

const upstage = {
  name: 'Upstage',
  roll: { opposed: true, skill: 'performance' },
};

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Brimstone' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin' },
  { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre' },
];

// Harness: mounts only the `section` JSX so the enemy picker's <select> is
// inspectable. OpposedReactionResolver renders a native <select> with
// aria-label "triggering enemy" whenever enemyOptions is non-empty.
const Harness = ({ order: harnessOrder }) => {
  const { section } = useOpposedReactionResolution({
    ability: upstage,
    character,
    order: harnessOrder,
    activeConditions: [],
    activeEffects: [],
    effectCatalog: [],
    mapStep: 0,
  });
  return <div>{section}</div>;
};

describe('useOpposedReactionResolution', () => {
  it('offers every visible enemy as the triggering-enemy candidate', () => {
    render(<Harness order={order} />);
    const select = screen.getByLabelText('triggering enemy');
    expect(screen.getByRole('option', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ogre' })).toBeInTheDocument();
    expect(select).toBeInTheDocument();
  });

  it('excludes a hidden enemy from the triggering-enemy candidate list (#1749 ruling addendum)', () => {
    const withHidden = [...order, { entryId: 'e-skulk', kind: 'enemy', name: 'Skulker', hidden: true }];
    render(<Harness order={withHidden} />);
    expect(screen.getByRole('option', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Skulker' })).not.toBeInTheDocument();
  });

  it('an enemy with no hidden field at all (older bridge) stays offered', () => {
    const noHiddenField = [{ entryId: 'e-gob', kind: 'enemy', name: 'Goblin' }];
    render(<Harness order={noHiddenField} />);
    expect(screen.getByRole('option', { name: 'Goblin' })).toBeInTheDocument();
  });

  it('no picker is offered once every enemy is hidden', () => {
    const allHidden = [{ entryId: 'e-gob', kind: 'enemy', name: 'Goblin', hidden: true }];
    render(<Harness order={allHidden} />);
    expect(screen.queryByLabelText('triggering enemy')).not.toBeInTheDocument();
  });
});
