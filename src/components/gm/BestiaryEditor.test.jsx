import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

let mockMonsters = [];
let mockEncounterOrder = [];

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ monsters: mockMonsters }),
}));

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { order: mockEncounterOrder },
  }),
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
const TROLL_KEY  = 'Compendium.pf2e.bestiary.Actor.trl';

const mkEnemy = (entryId, name, creatureKey, description = '') => ({
  entryId,
  kind: 'enemy',
  name,
  creatureKey: creatureKey || null,
  bestiary: { description },
});

const goblinEntry  = mkEnemy('e1', 'Goblin Warrior',  GOBLIN_KEY, 'A sneaky goblin.');
const goblin2Entry = mkEnemy('e2', 'Goblin Warrior 2', GOBLIN_KEY, 'A sneaky goblin.');
const trollEntry   = mkEnemy('e3', 'Cave Troll',       TROLL_KEY,  'A big troll.');
const nullKeyEntry = mkEnemy('e4', 'Mysterious Figure', null);

function renderEditor() {
  return render(<BestiaryEditor />);
}

beforeEach(() => {
  mockMonsters = [];
  mockEncounterOrder = [];
  mockSaveDocument.mockResolvedValue({ ok: true });
  mockDeleteDocument.mockResolvedValue({ ok: true });
  vi.clearAllMocks();
});

// ── Empty state ───────────────────────────────────────────────────────────────

describe('BestiaryEditor — empty state', () => {
  test('shows empty state when no encounter enemies and no overrides', () => {
    renderEditor();
    expect(screen.getByText(/No creatures yet/i)).toBeInTheDocument();
  });

  test('does not show empty state once enemies are present', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    expect(screen.queryByText(/No creatures yet/i)).not.toBeInTheDocument();
  });
});

// ── List building ─────────────────────────────────────────────────────────────

describe('BestiaryEditor — list', () => {
  test('shows one row per creatureKey from encounter', () => {
    mockEncounterOrder = [goblinEntry, goblin2Entry, trollEntry];
    renderEditor();
    const items = screen.getAllByRole('button', { name: /Goblin Warrior|Cave Troll/ });
    // Two buttons (Goblin, Troll), both deduped
    expect(items).toHaveLength(2);
  });

  test('null-key enemies are excluded from the list', () => {
    mockEncounterOrder = [goblinEntry, nullKeyEntry];
    renderEditor();
    expect(screen.queryByRole('button', { name: /Mysterious Figure/ })).not.toBeInTheDocument();
  });

  test('existing override rows appear even without encounter entries', () => {
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Edited.' }];
    renderEditor();
    expect(screen.getByRole('button', { name: /Goblin Warrior/ })).toBeInTheDocument();
  });

  test('encounter + override union — no duplicates', () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Edited.' }];
    renderEditor();
    const items = screen.getAllByRole('button', { name: /Goblin Warrior/ });
    expect(items).toHaveLength(1);
  });

  test('override badge (●) shown for creatures with an override', () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Edited.' }];
    renderEditor();
    const row = screen.getByRole('button', { name: /Goblin Warrior/ });
    expect(row).toHaveTextContent('●');
  });

  test('no override badge for a creature without an override', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    const row = screen.getByRole('button', { name: /Goblin Warrior/ });
    expect(row).not.toHaveTextContent('●');
  });
});

// ── Detail form ───────────────────────────────────────────────────────────────

describe('BestiaryEditor — detail form', () => {
  test('shows placeholder when no creature selected', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    expect(screen.getByText(/Select a creature/i)).toBeInTheDocument();
  });

  test('clicking a creature shows its form', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    expect(screen.getByLabelText('description-override')).toBeInTheDocument();
  });

  test('form shows imported description as read-only reference', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    expect(screen.getByText('A sneaky goblin.')).toBeInTheDocument();
  });

  test('form pre-fills textarea with existing override', () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Existing override.' }];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    expect(screen.getByLabelText('description-override')).toHaveValue('Existing override.');
  });

  test('save button disabled when form is not dirty', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    expect(screen.getByRole('button', { name: /Save/ })).toBeDisabled();
  });

  test('save button enabled after editing textarea', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.change(screen.getByLabelText('description-override'), {
      target: { value: 'New text.' },
    });
    expect(screen.getByRole('button', { name: /Save/ })).not.toBeDisabled();
  });
});

// ── Save ──────────────────────────────────────────────────────────────────────

describe('BestiaryEditor — save', () => {
  test('save calls saveDocument with monster collection and creatureKey id', async () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.change(screen.getByLabelText('description-override'), {
      target: { value: 'Redacted goblin text.' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(mockSaveDocument).toHaveBeenCalledWith('monster', GOBLIN_KEY, {
      id: GOBLIN_KEY,
      name: 'Goblin Warrior',
      descriptionOverride: 'Redacted goblin text.',
    });
  });

  test('empty-string override is saved (redact entirely)', async () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Prior text.' }];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.change(screen.getByLabelText('description-override'), {
      target: { value: '' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(mockSaveDocument).toHaveBeenCalledWith('monster', GOBLIN_KEY, {
      id: GOBLIN_KEY,
      name: 'Goblin Warrior',
      descriptionOverride: '',
    });
  });

  test('flash message appears after successful save', async () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.change(screen.getByLabelText('description-override'), {
      target: { value: 'x' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(screen.getByTestId('be-flash')).toBeInTheDocument();
  });

  test('error message shown on save failure', async () => {
    mockSaveDocument.mockRejectedValue(new Error('Network error'));
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.change(screen.getByLabelText('description-override'), {
      target: { value: 'x' },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Save/ }));
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Network error');
  });
});

// ── Revert ────────────────────────────────────────────────────────────────────

describe('BestiaryEditor — revert', () => {
  test('Revert button absent when no override exists', () => {
    mockEncounterOrder = [goblinEntry];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    expect(screen.queryByRole('button', { name: /Revert/i })).not.toBeInTheDocument();
  });

  test('Revert button present when override exists', () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Override.' }];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    expect(screen.getByRole('button', { name: /Revert to imported/i })).toBeInTheDocument();
  });

  test('clicking Revert shows confirm dialog', () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Override.' }];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.click(screen.getByRole('button', { name: /Revert to imported/i }));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
  });

  test('confirming revert calls deleteDocument', async () => {
    mockEncounterOrder = [goblinEntry];
    mockMonsters = [{ id: GOBLIN_KEY, name: 'Goblin Warrior', descriptionOverride: 'Override.' }];
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: /Goblin Warrior/ }));
    fireEvent.click(screen.getByRole('button', { name: /Revert to imported/i }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /Confirm/ }));
    });
    expect(mockDeleteDocument).toHaveBeenCalledWith('monster', GOBLIN_KEY);
  });
});
