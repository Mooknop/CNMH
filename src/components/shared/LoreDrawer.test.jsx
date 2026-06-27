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
    content: 'A great god.\n\nHe died mysteriously.',
    summary: 'A dead god.',
    related: ['absalom'],
  },
  {
    id: 'absalom',
    title: 'Absalom',
    category: 'Locations',
    content: 'A great city.',
    summary: 'City at the center of the world.',
    related: [],
  },
  { id: 'sandpoint', title: 'Sandpoint', category: 'Locations', content: 'A town.' },
  { id: 'general-store', title: 'General Store', category: 'Locations', content: 'Wares.', parent: 'sandpoint' },
];

vi.mock('../../contexts/LoreContext', () => ({
  useLore: vi.fn(),
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: vi.fn(),
}));
import { useContent } from '../../contexts/ContentContext';

// Stub ShopModal — its own hooks (clock/session) are exercised elsewhere; here
// we only assert the drawer opens it with the right shops + read-only flag.
vi.mock('../shop/ShopModal', () => ({
  default: ({ isOpen, readOnly, shops }) =>
    isOpen ? (
      <div data-testid="lore-shop-modal" data-readonly={String(readOnly)}>
        {(shops || []).length} shops
      </div>
    ) : null,
}));

let mockShops = {};
vi.mock('../../hooks/useShops', () => ({ useShops: () => ({ shops: mockShops }) }));

const closeLore = vi.fn();
const navigateTo = vi.fn();
const goBack = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  mockShops = {};
  useContent.mockReturnValue({ loreEntries: LORE, allLoreEntries: LORE, items: [], runes: [] });
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

  describe('shops', () => {
    const openSandpoint = () =>
      useLore.mockReturnValue({ isOpen: true, currentEntryId: 'sandpoint', closeLore, navigateTo, goBack, canGoBack: false });

    it('shows no Shops button when the location has no shop children', () => {
      renderDrawer(); // aroden — no shop children
      expect(screen.queryByTestId('lore-shops-button')).not.toBeInTheDocument();
    });

    it('surfaces a Shops button for a location with revealed shop children', () => {
      mockShops = { 'general-store': { wares: [{ ref: 'x' }] } };
      openSandpoint();
      renderDrawer();
      expect(screen.getByTestId('lore-shops-button')).toHaveTextContent('Shops');
    });

    it('opens the shop browser read-only when the party isn’t in town', () => {
      mockShops = { 'general-store': { wares: [{ ref: 'x' }] } };
      openSandpoint();
      renderDrawer();
      fireEvent.click(screen.getByTestId('lore-shops-button'));
      const modal = screen.getByTestId('lore-shop-modal');
      expect(modal).toHaveAttribute('data-readonly', 'true');
      expect(modal).toHaveTextContent('1 shops');
    });
  });

  describe('visibility-aware resolution', () => {
    const HIDDEN = { id: 'the-pit', title: 'The Pit', category: 'Locations', content: 'Secret.', related: [] };

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

  describe('wikilinks in content', () => {
    const HIDDEN = { id: 'the-pit', title: 'The Pit', category: 'Locations', content: 'Secret.', related: [] };
    const WITH_LINK = {
      id: 'sage',
      title: 'The Sage',
      category: 'NPC',
      content: 'Speaks of [[Absalom]] and the [[The Pit]] in hushed tones.',
      related: [],
    };

    beforeEach(() => {
      useContent.mockReturnValue({
        loreEntries: [...LORE, WITH_LINK], // player: no The Pit
        allLoreEntries: [...LORE, WITH_LINK, HIDDEN], // GM: includes The Pit
      });
      useLore.mockReturnValue({ isOpen: true, currentEntryId: 'sage', closeLore, navigateTo, goBack, canGoBack: false });
    });

    it('navigates the drawer when a content wikilink is clicked', () => {
      renderDrawer('/');
      fireEvent.click(screen.getByRole('button', { name: 'Absalom' }));
      expect(navigateTo).toHaveBeenCalledWith('absalom');
    });

    it('renders a link to an unrevealed entry as plain text on player routes', () => {
      renderDrawer('/');
      expect(screen.queryByRole('button', { name: 'The Pit' })).not.toBeInTheDocument();
      expect(screen.getByText(/The Pit/)).toBeInTheDocument();
    });

    it('renders the same link as a button on GM routes', () => {
      renderDrawer('/gm');
      fireEvent.click(screen.getByRole('button', { name: 'The Pit' }));
      expect(navigateTo).toHaveBeenCalledWith('the-pit');
    });
  });

  describe('containment hierarchy', () => {
    const HIER = [
      { id: 'varisia', title: 'Varisia', category: 'Location', content: 'Region.', related: [] },
      { id: 'sandpoint', title: 'Sandpoint', category: 'Location', content: 'Town.', parent: 'varisia', related: [] },
      { id: 'cathedral', title: 'Sandpoint Cathedral', category: 'Location', content: 'Church.', parent: 'sandpoint', related: [] },
    ];

    beforeEach(() => {
      useContent.mockReturnValue({ loreEntries: HIER, allLoreEntries: HIER });
    });

    it('renders a root-first ancestor breadcrumb', () => {
      useLore.mockReturnValue({ isOpen: true, currentEntryId: 'cathedral', closeLore, navigateTo, goBack, canGoBack: false });
      renderDrawer();
      const crumbs = document.querySelectorAll('.lore-drawer-crumb');
      expect([...crumbs].map((c) => c.textContent)).toEqual(['Varisia', 'Sandpoint']);
    });

    it('navigates when a breadcrumb crumb is clicked', () => {
      useLore.mockReturnValue({ isOpen: true, currentEntryId: 'cathedral', closeLore, navigateTo, goBack, canGoBack: false });
      renderDrawer();
      fireEvent.click(screen.getByRole('button', { name: 'Sandpoint' }));
      expect(navigateTo).toHaveBeenCalledWith('sandpoint');
    });

    it('lists direct children under Contains', () => {
      useLore.mockReturnValue({ isOpen: true, currentEntryId: 'sandpoint', closeLore, navigateTo, goBack, canGoBack: false });
      renderDrawer();
      expect(screen.getByText('Contains')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Sandpoint Cathedral' }));
      expect(navigateTo).toHaveBeenCalledWith('cathedral');
    });
  });
});
