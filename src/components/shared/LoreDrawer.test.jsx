import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { useLore } from '../../contexts/LoreContext';
import LoreDrawer from './LoreDrawer';

// The drawer is route-aware (GM routes resolve unrevealed entries), so every
// render needs a router.
const renderDrawer = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LoreDrawer />
    </MemoryRouter>
  );

const LORE = [
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
];

vi.mock('../../contexts/LoreContext', () => ({
  useLore: vi.fn(),
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: vi.fn(),
}));
import { useContent } from '../../contexts/ContentContext';

const closeLore = vi.fn();
const navigateTo = vi.fn();
const goBack = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  useContent.mockReturnValue({ loreEntries: LORE, allLoreEntries: LORE });
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
    const { container } = renderDrawer();
    expect(container.firstChild).toBeNull();
  });

  it('shows not-found message for an unknown entry id', () => {
    useLore.mockReturnValue({ isOpen: true, currentEntryId: 'nonexistent', closeLore, navigateTo, goBack, canGoBack: false });
    renderDrawer();
    expect(screen.getByText('Entry not found.')).toBeInTheDocument();
  });

  it('renders the entry title and category', () => {
    renderDrawer();
    expect(screen.getByText('Aroden')).toBeInTheDocument();
    expect(screen.getByText('History')).toBeInTheDocument();
  });

  it('renders tags', () => {
    renderDrawer();
    expect(screen.getByText('deity')).toBeInTheDocument();
    expect(screen.getByText('dead')).toBeInTheDocument();
  });

  it('renders multi-line content as separate paragraphs', () => {
    renderDrawer();
    expect(screen.getByText('A great god.')).toBeInTheDocument();
    expect(screen.getByText('He died mysteriously.')).toBeInTheDocument();
  });

  it('renders outgoing connections grouped under Connections', () => {
    renderDrawer();
    expect(screen.getByText('Connections')).toBeInTheDocument();
    expect(screen.getByText('Absalom')).toBeInTheDocument();
  });

  it('calls navigateTo with the entry id when a connection button is clicked', () => {
    renderDrawer();
    fireEvent.click(screen.getByText('Absalom'));
    expect(navigateTo).toHaveBeenCalledWith('absalom');
  });

  it('renders incoming connections under Referenced By', () => {
    useLore.mockReturnValue({ isOpen: true, currentEntryId: 'absalom', closeLore, navigateTo, goBack, canGoBack: false });
    renderDrawer();
    expect(screen.getByText('Referenced By')).toBeInTheDocument();
    expect(screen.getByText('Aroden')).toBeInTheDocument();
  });

  it('calls closeLore when the close button is clicked', () => {
    renderDrawer();
    fireEvent.click(screen.getByLabelText('Close'));
    expect(closeLore).toHaveBeenCalledTimes(1);
  });

  it('calls closeLore when the backdrop is clicked', () => {
    renderDrawer();
    fireEvent.click(document.querySelector('.lore-drawer-backdrop'));
    expect(closeLore).toHaveBeenCalledTimes(1);
  });

  it('does not show back button when canGoBack is false', () => {
    renderDrawer();
    expect(screen.queryByLabelText('Go back')).not.toBeInTheDocument();
  });

  it('shows back button when canGoBack is true and calls goBack on click', () => {
    useLore.mockReturnValue({ isOpen: true, currentEntryId: 'aroden', closeLore, navigateTo, goBack, canGoBack: true });
    renderDrawer();
    const backBtn = screen.getByLabelText('Go back');
    fireEvent.click(backBtn);
    expect(goBack).toHaveBeenCalledTimes(1);
  });

  describe('visibility-aware resolution', () => {
    const HIDDEN = { id: 'the-pit', title: 'The Pit', category: 'Locations', content: 'Secret.', related: [], tags: [] };

    beforeEach(() => {
      useContent.mockReturnValue({ loreEntries: LORE, allLoreEntries: [...LORE, HIDDEN] });
      useLore.mockReturnValue({ isOpen: true, currentEntryId: 'the-pit', closeLore, navigateTo, goBack, canGoBack: false });
    });

    it('does not resolve an unrevealed entry on player routes', () => {
      renderDrawer('/');
      expect(screen.getByText('Entry not found.')).toBeInTheDocument();
    });

    it('resolves an unrevealed entry on GM routes', () => {
      renderDrawer('/gm');
      expect(screen.getByText('The Pit')).toBeInTheDocument();
    });
  });

  it('renders entity image when entry.image is set', () => {
    const loreWithImage = LORE.map((e) =>
      e.id === 'aroden' ? { ...e, image: 'img_aroden.jpg' } : e
    );
    useContent.mockReturnValue({ loreEntries: loreWithImage, allLoreEntries: loreWithImage });
    const { container } = renderDrawer();
    const img = container.querySelector('.entity-image');
    expect(img).not.toBeNull();
    expect(img).toHaveAttribute('src', '/api/images/img_aroden.jpg');
  });

  it('does not render entity image when entry.image is absent', () => {
    const { container } = renderDrawer();
    expect(container.querySelector('.entity-image')).toBeNull();
  });
});
