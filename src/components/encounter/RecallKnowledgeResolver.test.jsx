import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecallKnowledgeResolver from './RecallKnowledgeResolver';
import { useCharacter } from '../../hooks/useCharacter';
import { SessionContext } from '../../contexts/SessionContext';
import { makeSessionBus } from '../../test/sessionBus';

// ── Mock hooks ────────────────────────────────────────────────────────────────

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: 'c1', name: 'Vex', skills: {}, abilities: {}, level: 5 },
    ],
  }),
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const CHAR_MODEL = {
  skillModifiers: {
    arcana:    5,
    nature:    3,
    occultism: 2,
    religion:  1,
    society:   4,
  },
  skillProficiencies: {
    arcana: 2,
  },
};

const mockResolve = vi.fn();
vi.mock('../../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({
    recordFor:  () => ({ all: false, description: false, hp: false, saves: {}, iwr: {}, lockedOut: {}, history: [] }),
    resolve:    mockResolve,
    clearLock:  vi.fn(),
  }),
}));

// ── Fixtures ──────────────────────────────────────────────────────────────────

const dragon = {
  entryId: 'e1',
  name: 'Young Red Dragon',
  bestiary: {
    level: 10,
    rarity: 'common',
    traits: ['dragon', 'fire'],
    hp: { current: 175, max: 175 },
  },
  defenses: {
    ac: 30,
    saves: { fortitude: 20, reflex: 16, will: 18 },
  },
};

function renderResolver(props = {}) {
  return render(
    <RecallKnowledgeResolver
      enemy={dragon}
      actingCharId="c1"
      actingCharName="Vex"
      onDone={vi.fn()}
      {...props}
    />
  );
}

beforeEach(() => {
  mockResolve.mockClear();
  useCharacter.mockReturnValue(CHAR_MODEL);
});

// ── Rendering ─────────────────────────────────────────────────────────────────

test('renders the resolver', () => {
  renderResolver();
  expect(screen.getByTestId('rkr-resolver')).toBeInTheDocument();
});

test('shows DC for the enemy (level 10 common → 27)', () => {
  renderResolver();
  expect(screen.getByText('27')).toBeInTheDocument();
});

test('shows skill buttons for all five knowledge skills', () => {
  renderResolver();
  ['Arcana', 'Nature', 'Occultism', 'Religion', 'Society'].forEach((s) => {
    expect(screen.getByRole('button', { name: new RegExp(s, 'i') })).toBeInTheDocument();
  });
});

test('arcana is pre-selected for dragon (trait match)', () => {
  renderResolver();
  const arcanaBtn = screen.getByRole('button', { name: /Arcana/i });
  expect(arcanaBtn).toHaveAttribute('aria-pressed', 'true');
});

test('Confirm is disabled before entering a d20', () => {
  renderResolver();
  expect(screen.getByRole('button', { name: /Apply/i })).toBeDisabled();
});

// ── Roll entry ────────────────────────────────────────────────────────────────

test('entering d20=18 with arcana mod +5 shows total 23 and degree', () => {
  renderResolver();
  const input = screen.getByLabelText(/raw d20/i);
  fireEvent.change(input, { target: { value: '18' } });
  // total 23 vs DC 27 → failure
  expect(screen.getByText('23', { exact: false })).toBeInTheDocument();
  expect(screen.getByText('Failure')).toBeInTheDocument();
});

test('entering d20=20 shows Critical Success', () => {
  renderResolver();
  const input = screen.getByLabelText(/raw d20/i);
  fireEvent.change(input, { target: { value: '20' } });
  // total 25 vs DC 27 would be failure, but nat-20 shifts up → success
  expect(screen.getByText('Success')).toBeInTheDocument();
});

test('success shows the choice picker', () => {
  renderResolver();
  const input = screen.getByLabelText(/raw d20/i);
  fireEvent.change(input, { target: { value: '20' } });
  // Confirm still disabled (no choice yet on success)
  expect(screen.getByTestId('rkr-choice-section')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Apply/i })).toBeDisabled();
});

test('choice picker has all expected options including AC/Perception/Speed', () => {
  renderResolver();
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } });
  ['Armor Class', 'Perception', 'Speed',
   'Fortitude save', 'Reflex save', 'Will save', 'Lowest save', 'Highest save',
   'Immunities', 'Resistances', 'Weaknesses'].forEach((label) => {
    expect(screen.getByLabelText(label)).toBeInTheDocument();
  });
});

test('selecting choice + valid d20 enables Confirm on success', () => {
  renderResolver();
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } });
  fireEvent.click(screen.getByLabelText('Reflex save'));
  expect(screen.getByRole('button', { name: /Apply/i })).not.toBeDisabled();
});

// ── Confirm calls resolve ─────────────────────────────────────────────────────

test('Confirm calls resolve with correct args on success', () => {
  const onDone = vi.fn();
  renderResolver({ onDone });
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } });
  fireEvent.click(screen.getByLabelText('Reflex save'));
  fireEvent.click(screen.getByRole('button', { name: /Apply/i }));
  expect(mockResolve).toHaveBeenCalledWith('e1', expect.objectContaining({
    degree:  'success',
    choices: ['reflex'],
    by:      'c1',
    byName:  'Vex',
    skill:   'Arcana',
    d20:     20,
  }));
  expect(onDone).toHaveBeenCalled();
});

test('passes outOfCombat to resolve when set (#396)', () => {
  renderResolver({ outOfCombat: true });
  // d20=10 → failure (no choice needed), keeps the assertion degree-agnostic.
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: /Apply/i }));
  expect(mockResolve).toHaveBeenCalledWith('e1', expect.objectContaining({ outOfCombat: true }));
});

test('out-of-combat lowers the DC by 2 (level 10 common: 27 → 25) (#396)', () => {
  renderResolver({ outOfCombat: true });
  expect(screen.getByText('25')).toBeInTheDocument();
});

test('passes currentDay through to resolve out of combat (#396)', () => {
  renderResolver({ outOfCombat: true, currentDay: 99 });
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: /Apply/i }));
  expect(mockResolve).toHaveBeenCalledWith('e1', expect.objectContaining({ currentDay: 99, outOfCombat: true }));
});

test('defaults outOfCombat to false (in-combat)', () => {
  renderResolver();
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } });
  fireEvent.click(screen.getByLabelText('Reflex save'));
  fireEvent.click(screen.getByRole('button', { name: /Apply/i }));
  expect(mockResolve).toHaveBeenCalledWith('e1', expect.objectContaining({ outOfCombat: false }));
});

// ── Knowing shield rune (#1196 G3) ──────────────────────────────────────────────

const knowingShield = {
  uid: 's1', name: 'Kite Shield', shield: { bonus: 2 }, state: 'held1',
  runes: { property: [{ id: 'knowing', type: 'property', name: 'Knowing' }] },
};

test('no Knowing toggle without a held Knowing shield', () => {
  renderResolver();
  expect(screen.queryByTestId('rkr-knowing-section')).toBeNull();
});

test('a held Knowing shield offers a +1 toggle that raises the RK total', () => {
  useCharacter.mockReturnValue({ ...CHAR_MODEL, inventory: [knowingShield] });
  renderResolver();
  expect(screen.getByTestId('rkr-knowing-section')).toBeInTheDocument();
  // arcana +5, d20 18 → 23
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '18' } });
  expect(screen.getByText('= 23')).toBeInTheDocument();
  // Opt in to Knowing → +1 → 24.
  fireEvent.click(screen.getByRole('button', { name: /Knowing \(shield\)/ }));
  expect(screen.getByText('= 24')).toBeInTheDocument();
});

test('the Knowing bonus is threaded into the resolved total', () => {
  useCharacter.mockReturnValue({ ...CHAR_MODEL, inventory: [knowingShield] });
  renderResolver();
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '10' } }); // 10+5=15 failure
  fireEvent.click(screen.getByRole('button', { name: /Knowing \(shield\)/ }));      // → 16
  fireEvent.click(screen.getByRole('button', { name: /Apply/i }));
  expect(mockResolve).toHaveBeenCalledWith('e1', expect.objectContaining({ total: 16 }));
});

test('Cancel calls onDone without resolving', () => {
  const onDone = vi.fn();
  renderResolver({ onDone });
  fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  expect(mockResolve).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});

// ── dice-tower rail (#1490 S4) ────────────────────────────────────────────────
// Full delegated-roll behavior lives in FoundryDiceInput.test.jsx; this pins
// the host wiring — a rail-capable bridge surfaces the Roll button here (the
// bare renders above run session-less and never grow one).
test('rail-capable bridge surfaces Roll in Foundry on the RK d20 entry', () => {
  const bus = makeSessionBus({ state: { global: { bridgehello: { protocol: 3 } } } });
  render(
    <SessionContext.Provider value={bus}>
      <RecallKnowledgeResolver enemy={dragon} actingCharId="c1" actingCharName="Vex" onDone={vi.fn()} />
    </SessionContext.Provider>
  );
  expect(screen.getByRole('button', { name: /roll in foundry/i })).toBeInTheDocument();
});
