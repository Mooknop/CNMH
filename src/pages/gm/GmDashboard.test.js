import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import GmDashboard from './GmDashboard';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({
  seedDefaults: jest.fn(),
  seedMissing: jest.fn(),
  repointFocusSpellsToCatalog: jest.fn(),
  syncChainConfig: jest.fn(),
}));
jest.mock('../../utils/gmBackup', () => ({ downloadBackup: jest.fn(), restoreBackup: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { seedDefaults, seedMissing, repointFocusSpellsToCatalog, syncChainConfig } = require('../../utils/gmApi');
const { downloadBackup, restoreBackup } = require('../../utils/gmBackup');

const renderDash = () => render(<MemoryRouter><GmDashboard /></MemoryRouter>);

afterEach(() => jest.restoreAllMocks());

describe('GmDashboard', () => {
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

  it('downloads a backup', async () => {
    useContent.mockReturnValue({ source: 'server' });
    downloadBackup.mockResolvedValue({});
    renderDash();
    fireEvent.click(screen.getByText('Download backup'));
    await waitFor(() => expect(screen.getByText(/Backup downloaded/)).toBeInTheDocument());
    expect(downloadBackup).toHaveBeenCalled();
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
