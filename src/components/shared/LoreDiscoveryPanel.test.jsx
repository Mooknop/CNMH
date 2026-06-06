import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LoreDiscoveryPanel from './LoreDiscoveryPanel';

vi.mock('../../contexts/LoreContext', () => ({
  useLore: () => ({ openLore: vi.fn() }),
}));

const mockEntry = {
  id: 'entry-1',
  title: 'Aroden',
  category: 'History',
  summary: 'A dead god.',
  tags: ['deity', 'dead'],
};

const renderPanel = (props = {}) =>
  render(
    <MemoryRouter>
      <LoreDiscoveryPanel
        entry={mockEntry}
        connectionData={{}}
        onEntrySelect={vi.fn()}
        onClose={vi.fn()}
        {...props}
      />
    </MemoryRouter>
  );

describe('LoreDiscoveryPanel', () => {
  it('renders nothing when entry is null', () => {
    const { container } = render(
      <MemoryRouter>
        <LoreDiscoveryPanel entry={null} connectionData={{}} onEntrySelect={vi.fn()} onClose={vi.fn()} />
      </MemoryRouter>
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders entry title and category', () => {
    renderPanel();
    expect(screen.getByText('Aroden')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders the summary', () => {
    renderPanel();
    expect(screen.getByText('A dead god.')).toBeInTheDocument();
  });

  it('renders tags', () => {
    renderPanel();
    expect(screen.getByText('deity')).toBeInTheDocument();
    expect(screen.getByText('dead')).toBeInTheDocument();
  });

  it('renders without tags gracefully', () => {
    renderPanel({ entry: { ...mockEntry, tags: undefined } });
    expect(screen.getByText('Aroden')).toBeInTheDocument();
  });

  it('does not render summary section when summary is absent', () => {
    renderPanel({ entry: { ...mockEntry, summary: undefined } });
    expect(screen.queryByText('A dead god.')).not.toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', () => {
    const onClose = vi.fn();
    renderPanel({ onClose });
    fireEvent.click(screen.getByLabelText('Close panel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('shows no-connections message when connectionData has no categories', () => {
    renderPanel({ connectionData: {} });
    expect(screen.getByText('No connections recorded for this entry.')).toBeInTheDocument();
  });

  it('shows no-connections message when both category lists are empty', () => {
    renderPanel({ connectionData: { outgoingByCategory: {}, incomingByCategory: {} } });
    expect(screen.getByText('No connections recorded for this entry.')).toBeInTheDocument();
  });

  it('renders outgoing connections grouped by category', () => {
    const connectionData = {
      outgoingByCategory: {
        Factions: [{ id: 'f1', title: 'The Pathfinder Society' }],
      },
      incomingByCategory: {},
    };
    renderPanel({ connectionData });
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Factions')).toBeInTheDocument();
    expect(screen.getByText('The Pathfinder Society')).toBeInTheDocument();
  });

  it('calls onEntrySelect with the entry id when a connection button is clicked', () => {
    const onEntrySelect = vi.fn();
    const connectionData = {
      outgoingByCategory: {
        Factions: [{ id: 'f1', title: 'Pathfinders' }],
      },
      incomingByCategory: {},
    };
    renderPanel({ connectionData, onEntrySelect });
    fireEvent.click(screen.getByText('Pathfinders'));
    expect(onEntrySelect).toHaveBeenCalledWith('f1');
  });

  it('renders incoming connections grouped by category', () => {
    const connectionData = {
      outgoingByCategory: {},
      incomingByCategory: {
        History: [{ id: 'h1', title: 'Age of Enthronement' }],
      },
    };
    renderPanel({ connectionData });
    expect(screen.getByText('Referenced By')).toBeInTheDocument();
    expect(screen.getByText('Age of Enthronement')).toBeInTheDocument();
  });

  it('calls onEntrySelect when an incoming connection button is clicked', () => {
    const onEntrySelect = vi.fn();
    const connectionData = {
      outgoingByCategory: {},
      incomingByCategory: {
        History: [{ id: 'h1', title: 'Age of Enthronement' }],
      },
    };
    renderPanel({ connectionData, onEntrySelect });
    fireEvent.click(screen.getByText('Age of Enthronement'));
    expect(onEntrySelect).toHaveBeenCalledWith('h1');
  });

  it('renders the full entry link', () => {
    renderPanel();
    expect(screen.getByText('Open full entry →')).toBeInTheDocument();
  });
});
