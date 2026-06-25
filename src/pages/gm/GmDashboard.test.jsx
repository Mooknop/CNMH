import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GmDashboard from './GmDashboard';

// ─── module-level mocks ───────────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/usePlayMode', () => ({ usePlayMode: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useReconciliation', () => ({ useReconciliation: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({
  seedDefaults: vi.fn(),
  seedMissing: vi.fn(),
  repointFocusSpellsToCatalog: vi.fn(),
  syncChainConfig: vi.fn(),
  applyContentDiff: vi.fn(),
}));
vi.mock('../../utils/gmBackup', () => ({ downloadBackup: vi.fn(), restoreBackup: vi.fn() }));

// lightweight stubs so dashboard never needs provider trees
vi.mock('../../components/gm/PlayModeControl', () => ({
  default: () => <div data-testid="play-mode-control" />,
}));
vi.mock('../../components/gm/PartyPanel', () => ({
  default: () => <div data-testid="party-panel" />,
}));
vi.mock('../../components/gm/GmSaveRequest', () => ({
  default: () => <div data-testid="save-request" />,
}));
vi.mock('../../components/encounter/RequestedSaves', () => ({
  default: () => <div data-testid="requested-saves" />,
}));
vi.mock('../../components/character-sheet/EffectsModal', () => ({
  default: ({ isOpen }) => (isOpen ? <div data-testid="effects-modal" /> : null),
}));

// ─── imports after mocks ──────────────────────────────────────────────────────
import { useContent } from '../../contexts/ContentContext';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useEncounter } from '../../hooks/useEncounter';
import { useReconciliation } from '../../hooks/useReconciliation';
import {
  seedDefaults, seedMissing, repointFocusSpellsToCatalog, syncChainConfig, applyContentDiff,
} from '../../utils/gmApi';
import { downloadBackup, restoreBackup } from '../../utils/gmBackup';

// ─── helpers ──────────────────────────────────────────────────────────────────
const renderDash = () => render(<MemoryRouter><GmDashboard /></MemoryRouter>);

const EXPLORATION_MODE = {
  mode: 'exploration',
  gmMode: 'exploration',
  setGmMode: vi.fn(),
  moveEnabled: false,
  setMoveEnabled: vi.fn(),
  moveOverride: null,
  setMoveOverride: vi.fn(),
};
const ENCOUNTER_MODE = { ...EXPLORATION_MODE, mode: 'encounter' };

const IDLE_ENCOUNTER = {
  encounter: { phase: 'idle', order: [], round: 0, currentTurnIndex: 0, foundryCombatId: null },
  actorMap: {},
  setActorMap: vi.fn(),
};

const CHARACTERS = [
  { id: 'thorn-id', name: 'Thorn' },
  { id: 'pellias-id', name: 'Pellias' },
];

afterEach(() => vi.restoreAllMocks());

// ─── safe defaults before every test ─────────────────────────────────────────
beforeEach(() => {
  useContent.mockReturnValue({ source: 'server', rawCharacters: [], spells: [], characters: [] });
  usePlayMode.mockReturnValue(EXPLORATION_MODE);
  useEncounter.mockReturnValue({ encounter: null, actorMap: {}, setActorMap: vi.fn() });
  useReconciliation.mockReturnValue({ pendingByChar: [] });
});

// ─────────────────────────────────────────────────────────────────────────────
// Control Center — mode composition
// ─────────────────────────────────────────────────────────────────────────────
describe('GmDashboard — Control Center', () => {
  it('always renders PlayModeControl', () => {
    renderDash();
    expect(screen.getByTestId('play-mode-control')).toBeInTheDocument();
  });

  it('does not show the initiative panel in exploration mode', () => {
    renderDash();
    expect(screen.queryByRole('region', { name: 'Initiative' })).not.toBeInTheDocument();
  });

  it('shows the initiative panel in encounter mode', () => {
    usePlayMode.mockReturnValue(ENCOUNTER_MODE);
    useEncounter.mockReturnValue(IDLE_ENCOUNTER);
    renderDash();
    expect(screen.getByRole('region', { name: 'Initiative' })).toBeInTheDocument();
  });

  it('shows a "Waiting for Foundry" message when no combat is linked', () => {
    usePlayMode.mockReturnValue(ENCOUNTER_MODE);
    useEncounter.mockReturnValue(IDLE_ENCOUNTER);
    renderDash();
    expect(screen.getByText(/Waiting for combat to start in Foundry/i)).toBeInTheDocument();
  });

  it('shows a "Live" message when Foundry combat is linked', () => {
    usePlayMode.mockReturnValue(ENCOUNTER_MODE);
    useEncounter.mockReturnValue({
      ...IDLE_ENCOUNTER,
      encounter: { ...IDLE_ENCOUNTER.encounter, foundryCombatId: 'combat-abc' },
    });
    renderDash();
    expect(screen.getByText(/Live.*Foundry/i)).toBeInTheDocument();
  });

  it('renders round number and current actor name in an in-progress encounter', () => {
    usePlayMode.mockReturnValue(ENCOUNTER_MODE);
    useEncounter.mockReturnValue({
      encounter: {
        phase: 'in-progress',
        round: 3,
        currentTurnIndex: 0,
        foundryCombatId: 'combat-xyz',
        order: [
          { entryId: 'e1', name: 'Thorn', kind: 'pc', charId: 'thorn-id', foundryActorId: 'f1', initiative: 22 },
          { entryId: 'e2', name: 'Goblin', kind: 'enemy', initiative: 18 },
        ],
      },
      actorMap: {},
      setActorMap: vi.fn(),
    });
    renderDash();
    // "Round 3" and "current: Thorn" span multiple elements — check section textContent
    const panel = screen.getByRole('region', { name: 'Initiative' });
    expect(panel.textContent).toMatch(/Round 3/);
    expect(panel.textContent).toMatch(/current:.*Thorn/i);
  });

  it('renders initiative order rows with testids', () => {
    usePlayMode.mockReturnValue(ENCOUNTER_MODE);
    useEncounter.mockReturnValue({
      encounter: {
        phase: 'in-progress',
        round: 1,
        currentTurnIndex: 0,
        foundryCombatId: 'combat-xyz',
        order: [
          { entryId: 'e1', name: 'Thorn', kind: 'pc', charId: 'thorn-id', foundryActorId: 'f1', initiative: 20 },
          { entryId: 'e2', name: 'Goblin', kind: 'enemy', initiative: 14 },
        ],
      },
      actorMap: {},
      setActorMap: vi.fn(),
    });
    renderDash();
    expect(screen.getByTestId('order-row-e1')).toBeInTheDocument();
    expect(screen.getByTestId('order-row-e2')).toBeInTheDocument();
  });

  it('actor assignment fires setActorMap with the correct next map', () => {
    const setActorMap = vi.fn();
    usePlayMode.mockReturnValue(ENCOUNTER_MODE);
    useContent.mockReturnValue({ source: 'server', rawCharacters: [], spells: [], characters: CHARACTERS });
    useEncounter.mockReturnValue({
      encounter: {
        phase: 'in-progress',
        round: 1,
        currentTurnIndex: 0,
        foundryCombatId: 'combat-xyz',
        order: [
          { entryId: 'e1', name: 'Thorn', kind: 'pc', charId: null, foundryActorId: 'f-actor-1', initiative: 20 },
        ],
      },
      actorMap: {},
      setActorMap,
    });
    renderDash();
    fireEvent.change(screen.getByRole('combobox', { name: 'assign-e1' }), {
      target: { value: 'pellias-id' },
    });
    expect(setActorMap).toHaveBeenCalledTimes(1);
    // invoke the updater function to verify the next map
    const [updater] = setActorMap.mock.calls[0];
    expect(updater({})).toEqual({ 'f-actor-1': 'pellias-id' });
  });

  it('always renders PartyPanel', () => {
    renderDash();
    expect(screen.getByTestId('party-panel')).toBeInTheDocument();
  });

  it('renders the Quick Actions section in all play modes', () => {
    renderDash();
    expect(screen.getByRole('region', { name: 'Quick Actions' })).toBeInTheDocument();
  });

  it('clicking Apply Effect opens the effects modal', () => {
    renderDash();
    expect(screen.queryByTestId('effects-modal')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apply Effect to character' }));
    expect(screen.getByTestId('effects-modal')).toBeInTheDocument();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Maintenance panel (preserved from pre-refresh suite)
// ─────────────────────────────────────────────────────────────────────────────
describe('GmDashboard — Maintenance', () => {
  it('warns and offers import when content is on the bundled fallback', () => {
    useContent.mockReturnValue({ source: 'fallback' });
    renderDash();
    expect(screen.getByText(/store is empty/i)).toBeInTheDocument();
    expect(screen.getByText(/Content source:/).textContent).toMatch(/fallback/);
  });

  it('imports defaults and shows the result', async () => {
    useContent.mockReturnValue({ source: 'fallback' });
    seedDefaults.mockResolvedValue({ ok: true, seeded: { quest: 'seeded 5' } });
    renderDash();
    fireEvent.click(screen.getByText(/Import defaults/i));
    await waitFor(() => expect(screen.getByText(/seeded 5/)).toBeInTheDocument());
    expect(seedDefaults).toHaveBeenCalledWith(false);
  });

  it('force reseed requires typing RESEED to confirm', async () => {
    useContent.mockReturnValue({ source: 'server' });
    seedDefaults.mockResolvedValue({ ok: true, seeded: {} });
    renderDash();
    fireEvent.click(screen.getByText(/Force reseed/i));
    const confirmBtn = screen.getByText('Reseed');
    expect(confirmBtn).toBeDisabled();
    fireEvent.click(confirmBtn);
    expect(seedDefaults).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'RESEED' } });
    fireEvent.click(screen.getByText('Reseed'));
    await waitFor(() => expect(seedDefaults).toHaveBeenCalledWith(true));
  });

  it('cancels a force reseed without calling the API', () => {
    useContent.mockReturnValue({ source: 'server' });
    renderDash();
    fireEvent.click(screen.getByText(/Force reseed/i));
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByLabelText('confirm-input')).not.toBeInTheDocument();
    expect(seedDefaults).not.toHaveBeenCalled();
  });

  it('surfaces a failure message', async () => {
    useContent.mockReturnValue({ source: 'fallback' });
    seedDefaults.mockRejectedValue(new Error('boom'));
    renderDash();
    fireEvent.click(screen.getByText(/Import defaults/i));
    await waitFor(() => expect(screen.getByText(/Failed: boom/)).toBeInTheDocument());
  });

  it('force reseed downloads a backup before overwriting', async () => {
    useContent.mockReturnValue({ source: 'server' });
    downloadBackup.mockResolvedValue({});
    seedDefaults.mockResolvedValue({ ok: true, seeded: { quest: 'seeded 5 (archived 5)' } });
    renderDash();
    fireEvent.click(screen.getByText(/Force reseed/i));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'RESEED' } });
    fireEvent.click(screen.getByText('Reseed'));
    await waitFor(() => expect(seedDefaults).toHaveBeenCalledWith(true));
    expect(downloadBackup).toHaveBeenCalled();
    // backup must precede the destructive seed
    expect(downloadBackup.mock.invocationCallOrder[0])
      .toBeLessThan(seedDefaults.mock.invocationCallOrder[0]);
    await waitFor(() => expect(screen.getByText(/Backup downloaded, then reseeded/)).toBeInTheDocument());
  });

  it('aborts the reseed (no overwrite) when the pre-reseed backup fails', async () => {
    useContent.mockReturnValue({ source: 'server' });
    downloadBackup.mockRejectedValue(new Error('R2 down'));
    renderDash();
    fireEvent.click(screen.getByText(/Force reseed/i));
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'RESEED' } });
    fireEvent.click(screen.getByText('Reseed'));
    await waitFor(() => expect(screen.getByText(/Reseed aborted — backup failed/)).toBeInTheDocument());
    expect(seedDefaults).not.toHaveBeenCalled();
  });

  it('warns about unsynced player changes before a reseed', () => {
    useContent.mockReturnValue({ source: 'server' });
    useReconciliation.mockReturnValue({
      pendingByChar: [
        { char: { id: 'Pellias' }, changes: [{ id: 'a' }, { id: 'b' }] },
        { char: { id: 'Jade' }, changes: [{ id: 'c' }] },
      ],
    });
    renderDash();
    // inline warning before opening the dialog
    expect(screen.getByTestId('reseed-pending-warning')).toHaveTextContent(/3 pending player changes/);
    // and inside the confirm dialog
    fireEvent.click(screen.getByText(/Force reseed/i));
    expect(screen.getByText(/3 pending player changes have NOT been synced/)).toBeInTheDocument();
  });

  it('downloads a backup', async () => {
    useContent.mockReturnValue({ source: 'server' });
    downloadBackup.mockResolvedValue({});
    renderDash();
    fireEvent.click(screen.getByText('Download backup'));
    await waitFor(() => expect(screen.getByText(/Backup downloaded/)).toBeInTheDocument());
    expect(downloadBackup).toHaveBeenCalled();
  });

  it('"Apply content update" runs the diff and summarizes the per-collection report', async () => {
    useContent.mockReturnValue({ source: 'server' });
    applyContentDiff.mockResolvedValue({
      quest: { added: ['q2'], changed: [], unchanged: 3, liveOnly: ['old-quest'] },
      item: { added: [], changed: ['i1'], unchanged: 0, liveOnly: [] },
    });
    renderDash();
    fireEvent.click(screen.getByText(/Apply content update/i));
    await waitFor(() => expect(applyContentDiff).toHaveBeenCalled());
    expect(screen.getByText(/quest: \+1 added, 3 unchanged, 1 live-only/)).toBeInTheDocument();
    expect(screen.getByText(/item: 1 changed/)).toBeInTheDocument();
    expect(screen.getByText(/live-only .*: old-quest/)).toBeInTheDocument();
  });

  it('"Apply content update" reports nothing to apply when already up to date', async () => {
    useContent.mockReturnValue({ source: 'server' });
    applyContentDiff.mockResolvedValue({});
    renderDash();
    fireEvent.click(screen.getByText(/Apply content update/i));
    await waitFor(() => expect(screen.getByText(/nothing to apply/i)).toBeInTheDocument());
  });

  it('"Apply content update" surfaces a failure', async () => {
    useContent.mockReturnValue({ source: 'server' });
    applyContentDiff.mockRejectedValue(new Error('read failed'));
    renderDash();
    fireEvent.click(screen.getByText(/Apply content update/i));
    await waitFor(() => expect(screen.getByText(/Failed: read failed/)).toBeInTheDocument());
  });

  it('"Apply new defaults" runs all three migrations and shows combined result', async () => {
    useContent.mockReturnValue({ source: 'server', rawCharacters: [{ id: 'Pellias' }], spells: [] });
    seedMissing.mockResolvedValue({ ok: true, seeded: { spell: 'added 8 (skipped 10 existing)' } });
    repointFocusSpellsToCatalog.mockResolvedValue({ repointed: ['Pellias'] });
    syncChainConfig.mockResolvedValue({ patched: ['spell:inner-upheaval', 'character:JadeInferno'] });
    renderDash();
    fireEvent.click(screen.getByText(/Apply new defaults/i));
    await waitFor(() => expect(screen.getByText(/added 8/)).toBeInTheDocument());
    expect(seedMissing).toHaveBeenCalled();
    expect(repointFocusSpellsToCatalog).toHaveBeenCalledWith([{ id: 'Pellias' }]);
    expect(syncChainConfig).toHaveBeenCalledWith([], [{ id: 'Pellias' }]);
    expect(screen.getByText(/repointed focus spells: Pellias/)).toBeInTheDocument();
    expect(screen.getByText(/synced chain config: spell:inner-upheaval/)).toBeInTheDocument();
  });

  it('"Apply new defaults" reports all up to date when nothing to migrate', async () => {
    useContent.mockReturnValue({ source: 'server', rawCharacters: [], spells: [] });
    seedMissing.mockResolvedValue({ ok: true, seeded: {} });
    repointFocusSpellsToCatalog.mockResolvedValue({ repointed: [] });
    syncChainConfig.mockResolvedValue({ patched: [] });
    renderDash();
    fireEvent.click(screen.getByText(/Apply new defaults/i));
    await waitFor(() => expect(screen.getByText(/already up to date/)).toBeInTheDocument());
    expect(screen.getByText(/chain config already up to date/)).toBeInTheDocument();
  });

  it('restores from a backup file only after typing RESTORE', async () => {
    useContent.mockReturnValue({ source: 'server' });
    restoreBackup.mockResolvedValue({ ok: true, seeded: { lore: 'seeded 3' } });
    renderDash();
    const file = new File(['{"lore":[]}'], 'backup.json', { type: 'application/json' });
    fireEvent.change(screen.getByLabelText('restore-file'), { target: { files: [file] } });

    const confirmBtn = screen.getByText('Restore');
    expect(confirmBtn).toBeDisabled();
    expect(screen.getByText(/backup\.json/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: 'RESTORE' } });
    fireEvent.click(screen.getByText('Restore'));
    await waitFor(() => expect(restoreBackup).toHaveBeenCalledWith(file));
    expect(await screen.findByText(/seeded 3/)).toBeInTheDocument();
  });
});
