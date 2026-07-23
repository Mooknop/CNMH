import React from 'react';
import { render, screen } from '@testing-library/react';
import BestiaryEntry from './BestiaryEntry';
import { defaultRecord } from '../../utils/recallKnowledge';

vi.mock('../shared/TraitTag', () => ({
  default: ({ trait }) => <span data-testid="trait-tag">{trait}</span>,
}));

let mockMonsters = [];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ monsters: mockMonsters }),
}));

const enemy = {
  creatureKey: 'goblin-warrior',
  name: 'Goblin Warrior',
  bestiary: { level: 1, rarity: 'common', traits: ['goblin'], perception: 5, speed: 25, hp: { current: 6, max: 6 }, description: 'A nasty goblin.' },
  defenses: { ac: 16, saves: { fortitude: 5, reflex: 7, will: 3 }, immunities: ['fire'], resistances: [], weaknesses: [{ type: 'cold', value: 5 }] },
};

beforeEach(() => { mockMonsters = []; });

describe('BestiaryEntry (#334)', () => {
  test('redacts everything when nothing is learned', () => {
    render(<BestiaryEntry enemy={enemy} record={defaultRecord()} />);
    // Name is redacted → real name not shown.
    expect(screen.queryByText('Goblin Warrior')).not.toBeInTheDocument();
    expect(screen.queryByText('A nasty goblin.')).not.toBeInTheDocument();
    // AC value hidden.
    expect(screen.queryByText('16')).not.toBeInTheDocument();
  });

  test('revealAll shows every field (GM in the browser)', () => {
    render(<BestiaryEntry enemy={enemy} record={defaultRecord()} revealAll />);
    expect(screen.getByText('Goblin Warrior')).toBeInTheDocument();
    expect(screen.getByText('Creature 1')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument(); // AC
    expect(screen.getByText('A nasty goblin.')).toBeInTheDocument();
    expect(screen.getByText('fire')).toBeInTheDocument(); // immunity
    expect(screen.getByText('cold 5')).toBeInTheDocument(); // weakness
  });

  test('per-field record flags reveal individually', () => {
    const record = { ...defaultRecord(), identity: true, ac: true };
    render(<BestiaryEntry enemy={enemy} record={record} />);
    expect(screen.getByText('Goblin Warrior')).toBeInTheDocument();
    expect(screen.getByText('16')).toBeInTheDocument();
    // Description not yet learned.
    expect(screen.queryByText('A nasty goblin.')).not.toBeInTheDocument();
  });

  test('partial weakness reveal renders only the exploited type', () => {
    const two = { ...enemy, defenses: { ...enemy.defenses, weaknesses: [{ type: 'cold', value: 5 }, { type: 'fire', value: 10 }] } };
    const record = { ...defaultRecord(), weaknessesRevealed: { cold: true } };
    render(<BestiaryEntry enemy={two} record={record} />);
    expect(screen.getByText('cold 5')).toBeInTheDocument();
    expect(screen.queryByText('fire 10')).not.toBeInTheDocument();
  });

  test('partial resistance/immunity reveals render only the triggered types (#1014)', () => {
    const foe = {
      ...enemy,
      defenses: {
        ...enemy.defenses,
        immunities: ['fire', 'poison'],
        resistances: [{ type: 'cold', value: 10 }, { type: 'acid', value: 5 }],
      },
    };
    const record = {
      ...defaultRecord(),
      resistancesRevealed: { cold: true },
      immunitiesRevealed: { fire: true },
    };
    render(<BestiaryEntry enemy={foe} record={record} />);
    expect(screen.getByText('cold 10')).toBeInTheDocument();
    expect(screen.queryByText(/acid 5/)).not.toBeInTheDocument();
    expect(screen.getByText('fire')).toBeInTheDocument();
    expect(screen.queryByText(/poison/)).not.toBeInTheDocument();
  });

  test('applies the GM descriptionOverride over the imported description', () => {
    mockMonsters = [{ id: 'goblin-warrior', descriptionOverride: 'A FEARSOME foe.' }];
    const record = { ...defaultRecord(), description: true };
    render(<BestiaryEntry enemy={enemy} record={record} />);
    expect(screen.getByText('A FEARSOME foe.')).toBeInTheDocument();
    expect(screen.queryByText('A nasty goblin.')).not.toBeInTheDocument();
  });
});

describe('witnessed abilities (#1537 S9)', () => {
  test('witnessed chips render even while the creature is unidentified', () => {
    const record = {
      ...defaultRecord(),
      witnessed: {
        Paralysis: { kind: 'ability', ts: 2 },
        Jaws: { kind: 'strike', ts: 1 },
      },
    };
    render(<BestiaryEntry enemy={enemy} record={record} />);

    const section = screen.getByTestId('bestiary-witnessed');
    expect(section).toHaveTextContent('Witnessed');
    // Oldest first: Jaws (ts 1) before Paralysis (ts 2).
    expect(section.textContent.indexOf('Jaws')).toBeLessThan(section.textContent.indexOf('Paralysis'));
  });

  test('no witnessed section on a fresh record', () => {
    render(<BestiaryEntry enemy={enemy} record={defaultRecord()} />);
    expect(screen.queryByTestId('bestiary-witnessed')).not.toBeInTheDocument();
  });
});
