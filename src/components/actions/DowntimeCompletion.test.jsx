import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeCompletion from './DowntimeCompletion';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const PERIOD = 'P1';
const character = { id: 'pellias', name: 'Pellias' };

const mockSetResults = vi.fn();

// Key-aware: benchmark map + results queue; defaults otherwise.
const setup = ({ bench = { pellias: { Retrain: 5, Research: 5 } }, results = null } = {}) => {
  useSyncedState.mockImplementation((key) => {
    if (key === 'cnmh_downtimebench_global') return [bench, vi.fn()];
    if (key === 'cnmh_downtimeresults_global') return [results, mockSetResults];
    return [null, vi.fn()];
  });
};

beforeEach(() => {
  vi.clearAllMocks();
  useCharacter.mockReturnValue({
    feats: [{ name: 'Toughness' }, { name: 'Fleet Reflexes' }],
    skillProficiencies: { athletics: 1, stealth: 0 },
    loreSkills: [{ name: 'Warfare', proficiency: 1 }],
  });
  setup();
});

const renderAt = (activity, hoursBanked) =>
  render(<DowntimeCompletion character={character} activity={activity} startedAt={PERIOD} hoursBanked={hoursBanked} />);

describe('DowntimeCompletion', () => {
  it('renders nothing before the benchmark is reached', () => {
    const { container } = renderAt('Retrain', 32); // 5 days = 40h
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing once a result for that kind was already submitted this period', () => {
    setup({ results: { entries: [{ charId: 'pellias', periodStartedAt: PERIOD, kind: 'retrain' }] } });
    const { container } = renderAt('Retrain', 40);
    expect(container).toBeEmptyDOMElement();
  });

  it('Retrain: from-feat picker, and submitting queues a structured result', () => {
    renderAt('Retrain', 40);
    expect(screen.getByText('Retrain — benchmark reached')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Retrain type'), { target: { value: 'Feat' } });
    // "From" is now a select sourced from the character's feats
    expect(screen.getByRole('option', { name: 'Toughness' })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Retrain from'), { target: { value: 'Toughness' } });
    fireEvent.change(screen.getByLabelText('Retrain to'), { target: { value: 'Fleet' } });
    fireEvent.click(screen.getByRole('button', { name: /submit for gm/i }));

    const next = mockSetResults.mock.calls[0][0]({ entries: [] });
    expect(next.entries[0]).toMatchObject({
      kind: 'retrain', charId: 'pellias', retrainType: 'Feat', fromLabel: 'Toughness', toLabel: 'Fleet', status: 'pending',
    });
  });

  it('Retrain: Skill type sources "from" from trained skills + lores', () => {
    renderAt('Retrain', 40);
    fireEvent.change(screen.getByLabelText('Retrain type'), { target: { value: 'Skill' } });
    expect(screen.getByRole('option', { name: 'Athletics' })).toBeInTheDocument(); // trained
    expect(screen.getByRole('option', { name: 'Warfare Lore' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'Stealth' })).not.toBeInTheDocument(); // untrained
  });

  it('Retrain: Other type uses a free-text "from"', () => {
    renderAt('Retrain', 40);
    fireEvent.change(screen.getByLabelText('Retrain type'), { target: { value: 'Other' } });
    expect(screen.getByLabelText('Retrain from')).toHaveAttribute('placeholder');
  });

  it('Research: captures a topic, hands off to #206, and submits', () => {
    renderAt('Research', 40);
    expect(screen.getByText(/Research Topics, #206/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Research topic'), { target: { value: 'The Sealed Vault' } });
    fireEvent.click(screen.getByRole('button', { name: /submit for gm/i }));
    const next = mockSetResults.mock.calls[0][0]({ entries: [] });
    expect(next.entries[0]).toMatchObject({ kind: 'research', topic: 'The Sealed Vault', status: 'pending' });
  });

  it('Submit is disabled until the form is complete', () => {
    renderAt('Research', 40);
    expect(screen.getByRole('button', { name: /submit for gm/i })).toBeDisabled();
  });
});
