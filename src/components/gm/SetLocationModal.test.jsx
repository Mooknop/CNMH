import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SetLocationModal from './SetLocationModal';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';

// ─── fixtures ────────────────────────────────────────────────
const LORE = [
  { id: 'sandpoint', title: 'Sandpoint', category: 'Location', summary: 'A small coastal town.' },
  { id: 'magnimar', title: 'Magnimar', category: 'Location', summary: 'The City of Monuments.' },
  { id: 'akoni', title: 'Akoni', category: 'NPC', summary: 'A dryad.' },
];

let setCampaign;

afterEach(() => vi.restoreAllMocks());

beforeEach(() => {
  setCampaign = vi.fn();
  useContent.mockReturnValue({ allLoreEntries: LORE });
  useSyncedState.mockReturnValue([{ location: '', locationLoreId: '' }, setCampaign]);
});

// ─── tests ───────────────────────────────────────────────────
describe('SetLocationModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<SetLocationModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists only Location-category lore entries', () => {
    render(<SetLocationModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Sandpoint')).toBeInTheDocument();
    expect(screen.getByText('Magnimar')).toBeInTheDocument();
    expect(screen.queryByText('Akoni')).not.toBeInTheDocument();
  });

  it('filters the list by the search query', () => {
    render(<SetLocationModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Search locations'), { target: { value: 'magni' } });
    expect(screen.getByText('Magnimar')).toBeInTheDocument();
    expect(screen.queryByText('Sandpoint')).not.toBeInTheDocument();
  });

  it('sets location title + lore id and closes when an entry is picked', () => {
    const onClose = vi.fn();
    render(<SetLocationModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByText('Sandpoint'));
    expect(setCampaign).toHaveBeenCalledWith(
      expect.objectContaining({ location: 'Sandpoint', locationLoreId: 'sandpoint' })
    );
    expect(onClose).toHaveBeenCalled();
  });
});
