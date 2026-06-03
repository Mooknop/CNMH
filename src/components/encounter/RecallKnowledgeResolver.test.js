import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RecallKnowledgeResolver from './RecallKnowledgeResolver';

// ── Mock hooks ────────────────────────────────────────────────────────────────

jest.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: 'c1', name: 'Vex', skills: {}, abilities: {}, level: 5 },
    ],
  }),
}));

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({
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
  }),
}));

const mockResolve = jest.fn();
jest.mock('../../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({
    recordFor:  () => ({ all: false, description: false, hp: false, saves: {}, iwr: {}, lockedOut: {}, history: [] }),
    resolve:    mockResolve,
    clearLock:  jest.fn(),
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
      onDone={jest.fn()}
      {...props}
    />
  );
}

beforeEach(() => mockResolve.mockClear());

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

test('choice picker has all expected options', () => {
  renderResolver();
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } });
  ['Fortitude save', 'Reflex save', 'Will save', 'Lowest save', 'Highest save',
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
  const onDone = jest.fn();
  renderResolver({ onDone });
  fireEvent.change(screen.getByLabelText(/raw d20/i), { target: { value: '20' } });
  fireEvent.click(screen.getByLabelText('Reflex save'));
  fireEvent.click(screen.getByRole('button', { name: /Apply/i }));
  expect(mockResolve).toHaveBeenCalledWith('e1', expect.objectContaining({
    degree:    'success',
    choice:    'reflex',
    by:        'c1',
    byName:    'Vex',
    skill:     'Arcana',
    d20:       20,
  }));
  expect(onDone).toHaveBeenCalled();
});

test('Cancel calls onDone without resolving', () => {
  const onDone = jest.fn();
  renderResolver({ onDone });
  fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
  expect(mockResolve).not.toHaveBeenCalled();
  expect(onDone).toHaveBeenCalled();
});
