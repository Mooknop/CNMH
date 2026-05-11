import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { useLore } from '../../contexts/LoreContext';
import LoreDrawer from './LoreDrawer';

jest.mock('../../data', () => ({
  loreEntries: [
    {
      id: 'aroden',
      title: 'Aroden',
      category: 'History',
      content: 'A great god.\nHe died mysteriously.',
      summary: 'A dead god.',
      related: ['absalom'],
      tags: ['deity', 'dead'],
    },
    {
      id: 'absalom',
      title: 'Absalom',
      category: 'Locations',
      content: 'A great city.',
      summary: 'City at the center of the world.',
      related: [],
      tags: [],
    },
  ],
}));

jest.mock('../../contexts/LoreContext', () => ({
  useLore: jest.fn(),
}));

const closeLore = jest.fn();
const navigateTo = jest.fn();
const goBack = jest.fn();

beforeEach(() => {
  jest.clearAllMocks();
  useLore.mockReturnValue({
    isOpen: true,
    currentEntryId: 'aroden',
    closeLore,
    navigateTo,
    goBack,
    canGoBack: false,
  });
});

describe('LoreDrawer', () => {
  it('renders nothing when closed', () => {
    useLore.mockReturnValue({ isOpen: false, currentEntryId: null, closeLore, navigateTo, goBack, canGoBack: false });
    const { container } = render(<LoreDrawer />);
    expect(container.firstChild).toBeNull();
  });

  it('shows not-found message for an unknown entry id', () => {
    useLore.mockReturnValue({ isOpen: true, currentEntryId: 'nonexistent', closeLore, navigateTo, goBack, canGoBack: false });
    render(<LoreDrawer />);
    expect(screen.getByText('Entry not found.')).toBeInTheDocument();
  });

  it('renders the entry title and category', () => {
    render(<LoreDrawer />);
    expect(screen.getByText('Aroden')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<LoreDrawer />);
    expect(screen.getByText('deity')).toBeInTheDocument();
    expect(screen.getByText('dead')).toBeInTheDocument();
  });

  it('renders multi-line content as separate paragraphs', () => {
    render(<LoreDrawer />);
    expect(screen.getByText('A great god.')).toBeInTheDocument();
    expect(screen.getByText('He died mysteriously.')).toBeInTheDocument();
  });

  it('renders outgoing connections grouped under Connections', () => {
    render(<LoreDrawer />);
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Absalom')).toBeInTheDocument();
  });

  it('calls navigateTo with the entry id when a connection button is clicked', () => {
    render(<LoreDrawer />);
    fireEvent.click(screen.getByText('Absalom'));
    expect(navigateTo).toHaveBeenCalledWith('absalom');
  });

  it('renders incoming connections under Referenced By', () => {
    useLore.mockReturnValue({ isOpen: true, currentEntryId: 'absalom', closeLore, navigateTo, goBack, canGoBack: false });
    render(<LoreDrawer />);
    expect(screen.getByText('Referenced By')).toBeInTheDocument();
    expect(screen.getByText('Aroden')).toBeInTheDocument();
  });

  it('calls closeLore when the close button is clicked', () => {
    render(<LoreDrawer />);
    fireEvent.click(screen.getByLabelText('Close'));
    expect(closeLore).toHaveBeenCalledTimes(1);
  });

  it('calls closeLore when the backdrop is clicked', () => {
    render(<LoreDrawer />);
    fireEvent.click(document.querySelector('.lore-drawer-backdrop'));
    expect(closeLore).toHaveBeenCalledTimes(1);
  });

  it('does not show back button when canGoBack is false', () => {
    render(<LoreDrawer />);
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument();
  });

  it('shows back button when canGoBack is true and calls goBack on click', () => {
    useLore.mockReturnValue({ isOpen: true, currentEntryId: 'aroden', closeLore, navigateTo, goBack, canGoBack: true });
    render(<LoreDrawer />);
    const backBtn = screen.getByLabelText('Go back');
    fireEvent.click(backBtn);
    expect(goBack).toHaveBeenCalledTimes(1);
  });
});
