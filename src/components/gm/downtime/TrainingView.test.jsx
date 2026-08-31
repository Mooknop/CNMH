import React from 'react';
import { screen, within, waitFor, fireEvent } from '@testing-library/react';
import TrainingView from './TrainingView';
import { renderWithProviders, makeCharacter } from '../../../test/renderWithProviders';
import { saveDocument } from '../../../utils/gmApi';

vi.mock('../../../utils/gmApi', async (importOriginal) => ({
  ...(await importOriginal()),
  saveDocument: vi.fn(() => Promise.resolve()),
}));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
});

const track = (over = {}) => ({
  id: 't1',
  vendorId: 'house-of-blue-stones',
  offeringId: 'tiger-stance',
  hours: 48,
  benchmarkHours: 160,
  status: 'in-progress',
  startedAt: 0,
  ...over,
});

describe('TrainingView', () => {
  it('shows an empty state when nobody is training', () => {
    renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: { state: { a: { training: { tracks: [] } } } },
    });
    expect(screen.getByText(/No one is currently training/)).toBeInTheDocument();
  });

  it('renders one card per PC with an in-progress track, with the roster-order color dot, and skips PCs with none', () => {
    renderWithProviders(<TrainingView />, {
      content: {
        character: [
          makeCharacter({ id: 'a', name: 'Ashka' }),
          makeCharacter({ id: 'b', name: 'Blu' }),
        ],
      },
      session: {
        state: {
          a: { training: { tracks: [] } },
          b: { training: { tracks: [track({ hours: 48 })] } },
        },
      },
    });

    expect(screen.queryByTestId('dock-dt-train-a')).not.toBeInTheDocument();
    const card = screen.getByTestId('dock-dt-train-b');
    expect(within(card).getByText('Blu')).toBeInTheDocument();
    expect(within(card).getByText('Tiger Stance')).toBeInTheDocument();
    expect(within(card).getByText('48h / 160h')).toBeInTheDocument();
    // Blu is roster index 1 → CHARACTER_COLORS[1] ('#64b5f6').
    const dot = card.querySelector('.dock-dt-train-dot');
    expect(dot.style.getPropertyValue('--x-theme')).toBe('#64b5f6');
  });

  it('flags a completed track as ready and enables Confirm completion', () => {
    renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: { state: { a: { training: { tracks: [track({ hours: 160 })] } } } },
    });
    const card = screen.getByTestId('dock-dt-train-a');
    expect(within(card).getByText('✓ ready')).toBeInTheDocument();
    expect(within(card).getByRole('button', { name: /confirm completion for ashka/i })).toBeEnabled();
  });

  it('disables the confirm button and shows "No track ready" when nothing has hit its benchmark', () => {
    renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: { state: { a: { training: { tracks: [track({ hours: 48 })] } } } },
    });
    const card = screen.getByTestId('dock-dt-train-a');
    const btn = within(card).getByRole('button', { name: /no track ready for ashka/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('No track ready');
  });

  it('+8 h writes the target PC\'s training doc, adding hours to the first incomplete track', async () => {
    const { session } = renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: { state: { a: { training: { tracks: [track({ hours: 48 })] } } } },
    });
    const card = screen.getByTestId('dock-dt-train-a');
    fireEvent.click(within(card).getByRole('button', { name: /add 8 hours for ashka/i }));

    expect(within(card).getByText('56h / 160h')).toBeInTheDocument();
    const write = session.sent.find((s) => s.characterId === 'a' && s.stateType === 'training');
    expect(write).toBeTruthy();
    expect(write.value.tracks[0].hours).toBe(56);
    expect(write.options).toEqual({ force: true });
  });

  it('does not touch another PC\'s doc when bumping hours', async () => {
    const { session } = renderWithProviders(<TrainingView />, {
      content: {
        character: [makeCharacter({ id: 'a', name: 'Ashka' }), makeCharacter({ id: 'b', name: 'Blu' })],
      },
      session: {
        state: {
          a: { training: { tracks: [track({ hours: 48 })] } },
          b: { training: { tracks: [track({ id: 't2', hours: 8 })] } },
        },
      },
    });
    const cardA = screen.getByTestId('dock-dt-train-a');
    fireEvent.click(within(cardA).getByRole('button', { name: /add 8 hours for ashka/i }));

    expect(session.sent.some((s) => s.characterId === 'b')).toBe(false);
    expect(session.getState('b', 'training').tracks[0].hours).toBe(8);
  });

  it('+8 h is a no-op once every track on the card is already ready', async () => {
    const { session } = renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: { state: { a: { training: { tracks: [track({ hours: 160 })] } } } },
    });
    const card = screen.getByTestId('dock-dt-train-a');
    fireEvent.click(within(card).getByRole('button', { name: /add 8 hours for ashka/i }));
    expect(session.sent.some((s) => s.stateType === 'training')).toBe(false);
  });

  it('Confirm completion grants the ability, removes the track, and logs it — without the results queue', async () => {
    const { session } = renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: { state: { a: { training: { tracks: [track({ hours: 160 })] } } } },
    });
    const card = screen.getByTestId('dock-dt-train-a');
    fireEvent.click(within(card).getByRole('button', { name: /confirm completion for ashka/i }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [collection, id, doc] = saveDocument.mock.calls[0];
    expect(collection).toBe('character');
    expect(id).toBe('a');
    expect(doc.trained).toHaveLength(1);
    expect(doc.trained[0]).toMatchObject({ vendorId: 'house-of-blue-stones', offeringId: 'tiger-stance' });

    // Never touches cnmh_downtimeresults_global — this is a direct grant.
    expect(session.sent.some((s) => s.stateType === 'downtimeresults')).toBe(false);

    await waitFor(() => {
      const write = session.sent.find((s) => s.characterId === 'a' && s.stateType === 'training');
      expect(write).toBeTruthy();
      expect(write.value.tracks).toEqual([]);
      expect(write.options).toEqual({ force: true });
    });

    // grantTrainedAbility's own appendLog call lands on the shared encounter log.
    await waitFor(() => {
      const log = session.getState('global', 'encounter')?.log || [];
      expect(log.some((l) => l.text?.includes('completed training at House of Blue Stones'))).toBe(true);
    });

    await waitFor(() => {
      expect(screen.queryByTestId('dock-dt-train-a')).not.toBeInTheDocument();
    });
  });

  it('Confirm completion grants each ready track once when a card carries more than one', async () => {
    renderWithProviders(<TrainingView />, {
      content: { character: [makeCharacter({ id: 'a', name: 'Ashka' })] },
      session: {
        state: {
          a: {
            training: {
              tracks: [
                track({ id: 't1', offeringId: 'tiger-stance', hours: 160 }),
                track({ id: 't2', offeringId: 'crane-stance', hours: 160 }),
                track({ id: 't3', offeringId: 'gorilla-stance', hours: 40 }), // not ready
              ],
            },
          },
        },
      },
    });
    const card = screen.getByTestId('dock-dt-train-a');
    fireEvent.click(within(card).getByRole('button', { name: /confirm completion for ashka/i }));

    await waitFor(() => expect(saveDocument).toHaveBeenCalledTimes(2));
    // Second save must include BOTH grants — proves the sequential
    // rawCharacters snapshot isn't stale on the second write.
    const secondDoc = saveDocument.mock.calls[1][2];
    expect(secondDoc.trained).toHaveLength(2);

    // The not-yet-ready track survives.
    await waitFor(() => {
      const remaining = screen.getByTestId('dock-dt-train-a');
      expect(within(remaining).getByText('40h / 160h')).toBeInTheDocument();
    });
  });
});
