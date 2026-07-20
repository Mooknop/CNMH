// useSecondaryProfiles (#987) — a spell whose damage lands in more than one
// zone, against a different target set than the primary save. Each zone emits
// its own save request; the GM resolver already handles a list of them.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useSecondaryProfiles } from './useSecondaryProfiles';

vi.mock('../components/encounter/DamagePanel', () => ({
  default: ({ profile, entered, onEntered }) => (
    <div>
      <span data-testid="dmg-hint">{profile?.expression}</span>
      <input
        aria-label="secondary damage"
        value={entered}
        onChange={(e) => onEntered(e.target.value)}
      />
    </div>
  ),
}));

const order = [
  { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Brimstone' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { saves: { reflex: 8 } } },
  { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre', defenses: { saves: { reflex: 11 } } },
];
const character = { id: 'char-a', name: 'Brimstone', level: 5 };

const arc = {
  name: 'Propagating Arc',
  level: 2,
  secondaryProfiles: [{
    id: 'splash',
    label: 'Splash — within 10 feet',
    note: 'only if the target failed',
    defense: 'basic Reflex',
    damageData: { base: '2d6', type: 'electricity', heightened: { '+1': { base: '1d6' } } },
  }],
};

// Test harness: renders the section and exposes buildRequests via a button.
let captured = null;
const Harness = ({ ability, castRank = 2, saveDc = 20 }) => {
  const { section, buildRequests, hasProfiles } = useSecondaryProfiles({
    ability, character, order, castRank, casterEntryId: 'e-caster',
  });
  return (
    <div>
      <span data-testid="has">{String(hasProfiles)}</span>
      {section}
      <button onClick={() => { captured = buildRequests(saveDc); }}>build</button>
    </div>
  );
};

const build = () => fireEvent.click(screen.getByRole('button', { name: 'build' }));

beforeEach(() => { captured = null; });

describe('useSecondaryProfiles', () => {
  it('is inert for an ability with no secondary profiles', () => {
    render(<Harness ability={{ name: 'Fireball' }} />);
    expect(screen.getByTestId('has')).toHaveTextContent('false');
    build();
    expect(captured).toEqual([]);
  });

  it('lists every enemy as a pickable target for the zone, and no PCs', () => {
    render(<Harness ability={arc} />);
    expect(screen.getByLabelText('Goblin')).toBeInTheDocument();
    expect(screen.getByLabelText('Ogre')).toBeInTheDocument();
    expect(screen.queryByLabelText('Brimstone')).not.toBeInTheDocument();
  });

  it('emits no request while the zone has no picked targets', () => {
    render(<Harness ability={arc} />);
    build();
    expect(captured).toEqual([]);
  });

  it('emits one save request for the zone, carrying its own targets, defense and damage', () => {
    render(<Harness ability={arc} />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    fireEvent.change(screen.getByLabelText('secondary damage'), { target: { value: '7' } });
    build();
    expect(captured).toHaveLength(1);
    const req = captured[0];
    expect(req).toMatchObject({
      abilityName: 'Propagating Arc — Splash — within 10 feet',
      save: 'reflex',
      basic: true,
      dc: 20,
    });
    expect(req.targets).toEqual([{ entryId: 'e-gob', name: 'Goblin', saveMod: 8 }]);
    expect(req.damage).toMatchObject({ entered: 7, typeLabel: 'electricity' });
  });

  it('scales the zone independently at a heightened rank', () => {
    render(<Harness ability={arc} castRank={4} />);
    // 2d6 base +1d6 per rank over 2 → cast at 4 = 4d6
    expect(screen.getByTestId('has')).toHaveTextContent('true');
    fireEvent.click(screen.getByLabelText('Goblin'));
    expect(screen.getByTestId('dmg-hint')).toHaveTextContent('4d6');
  });

  it('carries every picked target into the single zone request', () => {
    render(<Harness ability={arc} />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    fireEvent.click(screen.getByLabelText('Ogre'));
    build();
    expect(captured).toHaveLength(1);
    expect(captured[0].targets.map((t) => t.name)).toEqual(['Goblin', 'Ogre']);
  });

  it('does not inherit the primary save ladder onto the zone', () => {
    const withLadder = {
      ...arc,
      saveConditions: { failure: [{ id: 'off-guard' }] },
    };
    render(<Harness ability={withLadder} />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    build();
    expect(captured[0]).not.toHaveProperty('conditions');
  });

  it('emits nothing when the DC is unknown', () => {
    render(<Harness ability={arc} saveDc={null} />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    build();
    expect(captured).toEqual([]);
  });
});
