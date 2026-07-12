import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PartyTrainingBoard from './PartyTrainingBoard';
import { usePartyActivity } from '../../hooks/usePartyActivity';

vi.mock('../../hooks/usePartyActivity', () => ({ usePartyActivity: vi.fn() }));

const party = (entries) => usePartyActivity.mockReturnValue({ party: entries, readyCount: 0, total: entries.length });

const track = (over = {}) => ({
  id: 't1', vendorId: 'house-of-blue-stones', offeringId: 'tiger-stance',
  hours: 48, benchmarkHours: 160, status: 'in-progress', startedAt: 0, ...over,
});

beforeEach(() => vi.clearAllMocks());

describe('PartyTrainingBoard', () => {
  it('renders nothing when nobody is training', () => {
    party([
      { char: { id: 'a', name: 'Ashka' }, state: null },
      { char: { id: 'b', name: 'Blu' }, state: { tracks: [] } },
    ]);
    const { container } = render(<PartyTrainingBoard />);
    expect(container).toBeEmptyDOMElement();
  });

  it('lists each PC with an in-progress track and its banked progress', () => {
    party([
      { char: { id: 'b', name: 'Blu' }, state: { tracks: [track({ hours: 48 })] } },
    ]);
    render(<PartyTrainingBoard />);
    expect(screen.getByText('In Training')).toBeInTheDocument();
    const row = screen.getByTestId('training-pc-b');
    expect(within(row).getByText('Blu')).toBeInTheDocument();
    expect(within(row).getByText('Tiger Stance')).toBeInTheDocument();
    expect(within(row).getByText('48h / 160h')).toBeInTheDocument();
  });

  it('labels a picked-choice track and flags a completed one as ready', () => {
    party([
      { char: { id: 'p', name: 'Pellias' }, state: { tracks: [
        track({ id: 't2', vendorId: 'sandpoint-garrison', offeringId: 'specialized-medium', choiceId: 'aiding-shield', hours: 160 }),
      ] } },
    ]);
    render(<PartyTrainingBoard />);
    const row = screen.getByTestId('training-pc-p');
    expect(within(row).getByText('Specialized Shield Training (Medium): Aiding Shield')).toBeInTheDocument();
    expect(within(row).getByText('✓ ready')).toBeInTheDocument();
  });

  it('omits PCs whose only tracks are completed/submitted (not in-progress)', () => {
    party([
      { char: { id: 'b', name: 'Blu' }, state: { tracks: [track({ status: 'completed' })] } },
    ]);
    const { container } = render(<PartyTrainingBoard />);
    expect(container).toBeEmptyDOMElement();
  });
});
