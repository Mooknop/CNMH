import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockMonsters = [];
let mockEncounterOrder = [];

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ monsters: mockMonsters }),
}));

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: { order: mockEncounterOrder } }),
}));

let mockRecord = {
  identity: false, description: false, hp: false, ac: false, perception: false, speed: false,
  saves: { fortitude: false, reflex: false, will: false },
  iwr: { immunities: false, resistances: false, weaknesses: false },
  weaknessesRevealed: {}, lockedOut: {}, history: [],
};
const mockMergeRecord = vi.fn();
vi.mock('../../hooks/useRecallKnowledge', () => ({
  useRecallKnowledge: () => ({ recordFor: () => mockRecord, mergeRecord: mockMergeRecord }),
}));

// Stub the shared preview card — its own behavior is covered by BestiaryEntry.test.
vi.mock('../bestiary/BestiaryEntry', () => ({
  default: ({ revealAll }) => <div data-testid="bestiary-preview">preview revealAll={String(!!revealAll)}</div>,
}));

const mockSaveDocument = vi.fn();
const mockDeleteDocument = vi.fn();
vi.mock('../../utils/gmApi', () => ({
  saveDocument: (...args) => mockSaveDocument(...args),
  deleteDocument: (...args) => mockDeleteDocument(...args),
}));

vi.mock('../shared/ConfirmDialog', () => {
  const ConfirmDialog = ({ isOpen, onConfirm, onCancel, title }) =>
    isOpen ? (
      <div data-testid="confirm-dialog">
        <span>{title}</span>
        <button onClick={onConfirm}>Confirm</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    ) : null;
  return { default: ConfirmDialog };
});

import BestiaryEditor from './BestiaryEditor';

// ── Fixtures ─────────────────────────────────────────────────────────────────

const GOBLIN_KEY = 'Compendium.pf2e.bestiary.Actor.gob';

const mkEnemy = (entryId, name, creatureKey, description = '') => ({
  entryId, kind: 'enemy', name, creatureKey: creatureKey || null,
  bestiary: { description }, defenses: {},
});

const goblinEntry  = mkEnemy('e1', 'Goblin Warrior', GOBLIN_KEY, 'A sneaky goblin.');
const nullKeyEntry = mkEnemy('e4', 'Mysterious Figure', null);

const goblinDoc = (extra = {}) => ({
  id: GOBLIN_KEY, name: 'Goblin Warrior',
  bestiary: { description: 'A sneaky goblin.', level: -1 }, defenses: { ac: 16 },
  capturedAt: 1700000000000, lastSeenAt: 1700100000000,
  locations: { sandpoint: { name: 'Sandpoint', lastSeenAt: 1700100000000 } },
  ...extra,
});

const selectGoblin = () => fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));

beforeEach(() => {
  mockMonsters = [];
  mockEncounterOrder = [];
  mockRecord = {
    identity: false, description: false, hp: false, ac: false, perception: false, speed: false,
    saves: { fortitude: false, reflex: false, will: false },
    iwr: { immunities: false, resistances: false, weaknesses: false },
    weaknessesRevealed: {}, lockedOut: {}, history: [],
  };
  mockSaveDocument.mockResolvedValue({ ok: true });
  mockDeleteDocument.mockResolvedValue({ ok: true });
  vi.clearAllMocks();
});

// ── List ───────────────────────────────────────────────────────────────────

describe('BestiaryEditor — list', () => {
  test('empty state when nothing seen or persisted', () => {
    render(<BestiaryEditor />);
    expect(screen.getByText(/No creatures yet/i)).toBeInTheDocument();
  });

  test('null-key enemies are excluded', () => {
    mockEncounterOrder = [goblinEntry, nullKeyEntry];
    render(<BestiaryEditor />);
    expect(screen.queryByRole('button', { name: /Mysterious Figure/ })).not.toBeInTheDocument();
  });

  test('persisted docs appear without an active encounter', () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    expect(screen.getByRole('button', { name: /Goblin Warrior/ })).toBeInTheDocument();
  });

  test('no ● badge for an encounter-only creature', () => {
    mockEncounterOrder = [goblinEntry];
    render(<BestiaryEditor />);
    expect(screen.getByRole('button', { name: /Goblin Warrior/ })).not.toHaveTextContent('●');
  });

  test('● badge marks a persisted entry', () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    expect(screen.getByRole('button', { name: /Goblin Warrior/ })).toHaveTextContent('●');
  });
});

// ── Detail form ────────────────────────────────────────────────────────────

describe('BestiaryEditor — detail form', () => {
  test('shows display name, stats preview, provenance', () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    expect(screen.getByLabelText('display-name')).toHaveValue('Goblin Warrior');
    expect(screen.getByTestId('bestiary-preview')).toHaveTextContent('revealAll=true');
    expect(screen.getByTestId('be-provenance')).toHaveTextContent(/Captured/);
    expect(screen.getByTestId('be-provenance')).toHaveTextContent(/Sandpoint/);
  });

  test('description mode defaults to imported when no override, custom textarea hidden', () => {
    mockEncounterOrder = [goblinEntry];
    render(<BestiaryEditor />);
    selectGoblin();
    expect(screen.getByLabelText('description-mode')).toHaveValue('imported');
    expect(screen.queryByLabelText('description-override')).not.toBeInTheDocument();
  });

  test('existing custom override pre-selects custom + fills textarea', () => {
    mockMonsters = [goblinDoc({ descriptionOverride: 'Custom text.' })];
    render(<BestiaryEditor />);
    selectGoblin();
    expect(screen.getByLabelText('description-mode')).toHaveValue('custom');
    expect(screen.getByLabelText('description-override')).toHaveValue('Custom text.');
  });

  test('save disabled until something changes', () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    expect(screen.getByRole('button', { name: /^Save$/ })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('display-name'), { target: { value: 'Renamed Goblin' } });
    expect(screen.getByRole('button', { name: /^Save$/ })).not.toBeDisabled();
  });
});

// ── Save (name + description tri-state) ──────────────────────────────────────

describe('BestiaryEditor — save', () => {
  test('saves edited name, spreading the existing doc to preserve stats', async () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.change(screen.getByLabelText('display-name'), { target: { value: 'Renamed Goblin' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ })));
    const [, key, doc] = mockSaveDocument.mock.calls[0];
    expect(key).toBe(GOBLIN_KEY);
    expect(doc.name).toBe('Renamed Goblin');
    expect(doc.bestiary).toEqual({ description: 'A sneaky goblin.', level: -1 }); // preserved
    expect(doc.capturedAt).toBe(1700000000000);
  });

  test('imported mode omits the descriptionOverride key', async () => {
    mockMonsters = [goblinDoc({ descriptionOverride: 'Custom text.' })];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.change(screen.getByLabelText('description-mode'), { target: { value: 'imported' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ })));
    const doc = mockSaveDocument.mock.calls[0][2];
    expect('descriptionOverride' in doc).toBe(false);
  });

  test('custom mode saves the entered text', async () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.change(screen.getByLabelText('description-mode'), { target: { value: 'custom' } });
    fireEvent.change(screen.getByLabelText('description-override'), { target: { value: 'Rewritten.' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ })));
    expect(mockSaveDocument.mock.calls[0][2].descriptionOverride).toBe('Rewritten.');
  });

  test('redacted mode saves an empty string', async () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.change(screen.getByLabelText('description-mode'), { target: { value: 'redacted' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ })));
    expect(mockSaveDocument.mock.calls[0][2].descriptionOverride).toBe('');
  });

  test('flash on success, error on failure', async () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.change(screen.getByLabelText('display-name'), { target: { value: 'X' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ })));
    expect(screen.getByTestId('be-flash')).toBeInTheDocument();

    mockSaveDocument.mockRejectedValueOnce(new Error('Network error'));
    fireEvent.change(screen.getByLabelText('display-name'), { target: { value: 'Y' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /^Save$/ })));
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });
});

// ── Per-field visibility ─────────────────────────────────────────────────────

describe('BestiaryEditor — visibility', () => {
  test('toggling a field calls mergeRecord with an updater', () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.click(screen.getByLabelText('reveal-ac'));
    expect(mockMergeRecord).toHaveBeenCalledWith(GOBLIN_KEY, expect.any(Function));
  });

  test('checkbox reflects the current record', () => {
    mockMonsters = [goblinDoc()];
    mockRecord = { ...mockRecord, ac: true };
    render(<BestiaryEditor />);
    selectGoblin();
    expect(screen.getByLabelText('reveal-ac')).toBeChecked();
    expect(screen.getByLabelText('reveal-identity')).not.toBeChecked();
  });

  test('Reveal all and Re-fog call mergeRecord', () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.click(screen.getByRole('button', { name: /Reveal all/ }));
    fireEvent.click(screen.getByRole('button', { name: /Re-fog/ }));
    expect(mockMergeRecord).toHaveBeenCalledTimes(2);
  });
});

// ── Delete ───────────────────────────────────────────────────────────────────

describe('BestiaryEditor — delete', () => {
  test('Delete entry shown only for persisted docs', () => {
    mockEncounterOrder = [goblinEntry];
    render(<BestiaryEditor />);
    selectGoblin();
    expect(screen.queryByRole('button', { name: /Delete entry/ })).not.toBeInTheDocument();
  });

  test('confirming delete calls deleteDocument and re-fogs', async () => {
    mockMonsters = [goblinDoc()];
    render(<BestiaryEditor />);
    selectGoblin();
    fireEvent.click(screen.getByRole('button', { name: /Delete entry/ }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Confirm/ })));
    expect(mockDeleteDocument).toHaveBeenCalledWith('monster', GOBLIN_KEY);
    expect(mockMergeRecord).toHaveBeenCalled(); // re-fog
  });
});
