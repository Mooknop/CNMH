import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import BestiaryRecallKnowledge from './BestiaryRecallKnowledge';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockCharacters = [
  { id: 'c1', name: 'Vex' },
  { id: 'c2', name: 'Mara' },
];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters }),
}));

// Fixed "today" so day-lock math is deterministic.
vi.mock('../../utils/gameTime', () => ({ totalDaysSince4700: () => 100 }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: { day: 1, month: 0, year: 4725 } }),
}));

let mockRecord = { dayLocked: {} };
vi.mock('../../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({ recordFor: () => mockRecord }),
}));

// Stub the resolver so we only test this component's wiring (picker + open).
vi.mock('../encounter/RecallKnowledgeResolver', () => ({
  default: ({ actingCharId, actingCharName, outOfCombat, currentDay, onDone }) => (
    <div
      data-testid="rkr"
      data-char={actingCharId}
      data-name={actingCharName}
      data-ooc={String(outOfCombat)}
      data-day={String(currentDay)}
    >
      <button type="button" onClick={onDone}>close</button>
    </div>
  ),
}));

const enemy = { creatureKey: 'goblin-warrior', name: 'Goblin Warrior', bestiary: { level: 1 } };

beforeEach(() => {
  vi.clearAllMocks();
  mockCharacters = [
    { id: 'c1', name: 'Vex' },
    { id: 'c2', name: 'Mara' },
  ];
  mockRecord = { dayLocked: {} };
});

test('shows the acting-character picker and a Recall Knowledge trigger', () => {
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  const select = screen.getByLabelText('Acting character');
  expect(select).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Vex' })).toBeInTheDocument();
  expect(screen.getByRole('option', { name: 'Mara' })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recall Knowledge' })).toBeInTheDocument();
});

test('opening the resolver passes the selected character and outOfCombat', () => {
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  fireEvent.change(screen.getByLabelText('Acting character'), { target: { value: 'c2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Recall Knowledge' }));
  const rkr = screen.getByTestId('rkr');
  expect(rkr).toHaveAttribute('data-char', 'c2');
  expect(rkr).toHaveAttribute('data-name', 'Mara');
  expect(rkr).toHaveAttribute('data-ooc', 'true');
});

test('defaults to the first party member', () => {
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  fireEvent.click(screen.getByRole('button', { name: 'Recall Knowledge' }));
  expect(screen.getByTestId('rkr')).toHaveAttribute('data-char', 'c1');
});

test('onDone returns to the trigger', () => {
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  fireEvent.click(screen.getByRole('button', { name: 'Recall Knowledge' }));
  fireEvent.click(screen.getByRole('button', { name: 'close' }));
  expect(screen.queryByTestId('rkr')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Recall Knowledge' })).toBeInTheDocument();
});

test('passes the current in-game day to the resolver (#396)', () => {
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  fireEvent.click(screen.getByRole('button', { name: 'Recall Knowledge' }));
  expect(screen.getByTestId('rkr')).toHaveAttribute('data-day', '100');
});

test('disables the trigger and explains when the acting PC is day-locked (#396)', () => {
  mockRecord = { dayLocked: { c1: 100 } }; // crit-failed today
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  expect(screen.getByRole('button', { name: 'Recall Knowledge' })).toBeDisabled();
  expect(screen.getByTestId('bestiary-rk-locked')).toBeInTheDocument();
});

test('lock clears once the in-game day advances past it (#396)', () => {
  mockRecord = { dayLocked: { c1: 99 } }; // failed yesterday, today is 100
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  expect(screen.getByRole('button', { name: 'Recall Knowledge' })).not.toBeDisabled();
  expect(screen.queryByTestId('bestiary-rk-locked')).not.toBeInTheDocument();
});

test('lock is per-character — switching to an unlocked PC re-enables (#396)', () => {
  mockRecord = { dayLocked: { c1: 100 } };
  render(<BestiaryRecallKnowledge enemy={enemy} />);
  expect(screen.getByRole('button', { name: 'Recall Knowledge' })).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Acting character'), { target: { value: 'c2' } });
  expect(screen.getByRole('button', { name: 'Recall Knowledge' })).not.toBeDisabled();
});

test('renders nothing when there is no party', () => {
  mockCharacters = [];
  const { container } = render(<BestiaryRecallKnowledge enemy={enemy} />);
  expect(container).toBeEmptyDOMElement();
});
