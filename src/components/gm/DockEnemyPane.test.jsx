import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pushRelayFixture, relayFixtures } from '../../test/relayFixtures';
import { RELAY, APP } from '../../sync/keys';
import DockEnemyPane from './DockEnemyPane';

beforeEach(() => window.localStorage.clear());

// Mirrors the recorded foekit fixture's combatant (entryId cbt-gob) plus the
// defensive fields the encounter blob carries for an enemy order entry.
const ENTRY = {
  entryId: 'cbt-gob',
  kind: 'enemy',
  name: 'Goblin Warrior',
  foundryActorId: 'actor-gob',
  defenses: {
    ac: 16,
    saves: { fortitude: 5, reflex: 7, will: 3 },
    immunities: ['fire'],
    resistances: [{ type: 'cold', value: 5 }],
    weaknesses: [{ type: 'slashing', value: 3 }],
  },
  bestiary: {
    img: null,
    level: 1,
    rarity: 'common',
    traits: ['small', 'goblin'],
    perception: 5,
    speed: 25,
    hp: { current: 9, max: 12 },
    description: 'A scrappy goblin.',
  },
};

describe('DockEnemyPane (#1531 S2)', () => {
  it('renders identity, vitals, and unredacted defenses from the order entry', () => {
    renderWithProviders(<DockEnemyPane entry={ENTRY} />);

    expect(screen.getByText('Enemy turn')).toBeInTheDocument();
    expect(screen.getByLabelText('Enemy turn: Goblin Warrior')).toBeInTheDocument();
    expect(screen.getByText('Small · Goblin · Level 1')).toBeInTheDocument();
    // Vitals: no reveal gating on the GM pane.
    expect(screen.getByTestId('dock-enemy-hp')).toHaveTextContent('9/12');
    const defenses = screen.getByTestId('dock-enemy-defenses');
    expect(defenses).toHaveTextContent('16');   // AC
    expect(defenses).toHaveTextContent('+7');   // Reflex modifier
    expect(defenses).toHaveTextContent('25 ft');
    expect(screen.getByTestId('dock-enemy-weak')).toHaveTextContent('slashing 3');
    expect(screen.getByTestId('dock-enemy-resist')).toHaveTextContent('cold 5');
    expect(screen.getByTestId('dock-enemy-immune')).toHaveTextContent('fire');
  });

  it('shows the waiting note until a kit for THIS entry arrives', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    expect(screen.getByTestId('dock-enemy-waiting')).toBeInTheDocument();

    // A stale kit keyed to a different combatant must not render.
    act(() => { pushRelayFixture(session, RELAY.FOEKIT, { entryId: 'cbt-other' }); });
    expect(screen.getByTestId('dock-enemy-waiting')).toBeInTheDocument();
    expect(screen.queryByTestId('dock-enemy-strike')).not.toBeInTheDocument();
  });

  it('renders the recorded kit: strikes, spells with slots/uses, abilities, skills', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    act(() => { pushRelayFixture(session, RELAY.FOEKIT); });

    expect(screen.queryByTestId('dock-enemy-waiting')).not.toBeInTheDocument();

    // Strike row: label, MAP ladder, typed damage, attack effect.
    const strike = screen.getByTestId('dock-enemy-strike');
    expect(strike).toHaveTextContent('Jaws');
    expect(strike).toHaveTextContent('+9 / +4 / -1');
    expect(strike).toHaveTextContent('1d8+4 piercing');
    expect(strike).toHaveTextContent('+ grab');

    // Spellcasting entry: meta line, rank slot state, spell with uses + save.
    const entry = screen.getByTestId('dock-enemy-spellentry');
    expect(entry).toHaveTextContent('Arcane Spells');
    expect(entry).toHaveTextContent('DC 19');
    expect(entry).toHaveTextContent('2/2 slots');
    const spell = screen.getByTestId('dock-enemy-spell');
    expect(spell).toHaveTextContent('Fear');
    expect(spell).toHaveTextContent('1/1');
    expect(spell).toHaveTextContent('Will');

    // Ability + skills off the same recorded payload.
    expect(screen.getByTestId('dock-enemy-ability')).toHaveTextContent('Goblin Scuttle');
    expect(screen.getByText(/Acrobatics \+5/)).toBeInTheDocument();

    // Typed asserts against the fixture the assertions above rode on, so a
    // bridge re-record that renames a field fails here, not silently.
    const kit = relayFixtures.foekit.value.kit;
    expect(kit.strikes[0]).toMatchObject({ index: expect.any(Number), variantLabels: expect.any(Array) });
    expect(kit.spellcasting[0].spells[0]).toMatchObject({ rank: expect.any(Number) });
  });

  it('surfaces flanked, applied conditions, and persistent damage as chips', () => {
    const { session } = renderWithProviders(<DockEnemyPane entry={ENTRY} />);
    act(() => {
      session.push('global', RELAY.FLANKED, { 'cbt-gob': { byCharIds: ['Pellias'] } });
      session.push('global', APP.ENEMYFX, {
        'cbt-gob': { conditions: [{ id: 'frightened', value: 2, source: 'Ashka' }], effects: [] },
      });
      session.push('global', APP.PERSISTENT, {
        'cbt-gob': [{ id: 'p1', dice: '1d6', type: 'fire', half: false }],
      });
    });

    expect(screen.getByText('⚔ flanked')).toBeInTheDocument();
    expect(screen.getByText('Frightened 2')).toBeInTheDocument();
    expect(screen.getByText(/1d6 persistent fire/)).toBeInTheDocument();
  });
});
