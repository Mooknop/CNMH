import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmLore from './GmLore';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/LoreContext', () => ({ useLore: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import { useLore } from '../../contexts/LoreContext';
import { saveDocument } from '../../utils/gmApi';

const loreEntries = [
  {
    id: 'sandpoint',
    title: 'Sandpoint',
    category: 'Location',
    summary: 'A town.',
    content: 'Sandpoint sits in a cove.',
    related: ['aroden'],
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'aroden',
    title: 'Aroden',
    category: 'History',
    summary: 'A dead god.',
    content: 'He died.',
    related: [],
  },
];

const setContent = () => useContent.mockReturnValue({ allLoreEntries: loreEntries, images: [] });

const multiCategory = [
  { id: 'sandpoint', title: 'Sandpoint', category: 'Location' },
  { id: 'magnimar', title: 'Magnimar', category: 'Location' },
  { id: 'aroden', title: 'Aroden', category: 'History' },
  { id: 'desna', title: 'Desna', category: 'Religion' },
];
const setMulti = () => useContent.mockReturnValue({ allLoreEntries: multiCategory, images: [] });

beforeEach(() => {
  useLore.mockReturnValue({ openLore: vi.fn() });
});
afterEach(() => vi.restoreAllMocks());

// Helper: select a lore entry list item to open its read-only detail pane.
const selectEntry = (name) => fireEvent.click(screen.getByRole('button', { name }));

describe('GmLore', () => {
  it('lists all entries as master-list buttons and shows a count', () => {
    setContent();
    render(<GmLore />);
    expect(screen.getByRole('button', { name: 'Sandpoint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aroden' })).toBeInTheDocument();
    expect(screen.queryByTestId('lore-detail-sandpoint')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it('filters the list by title, category or id', () => {
    setContent();
    render(<GmLore />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'history' } });
    expect(screen.getByRole('button', { name: 'Aroden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sandpoint' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
  });

  describe('read-only detail (no content editing)', () => {
    it('renders a read-only preview: summary, markdown content, connections, vault note', () => {
      setContent();
      render(<GmLore />);
      selectEntry('Sandpoint');
      const detail = screen.getByTestId('lore-detail-sandpoint');
      expect(within(detail).getByText('A town.')).toBeInTheDocument();
      expect(within(detail).getByText('Sandpoint sits in a cove.')).toBeInTheDocument();
      // Connections resolved from related[] (read-only display).
      expect(within(detail).getByText('Connections')).toBeInTheDocument();
      expect(within(detail).getByText(/Aroden/)).toBeInTheDocument();
      // Pointer to the real edit path.
      expect(within(detail).getByText(/Edit this entry in Obsidian/)).toBeInTheDocument();
      expect(within(detail).getByText('lore-vault/Location/Sandpoint.md')).toBeInTheDocument();
    });

    it('exposes no create / save / delete / content-edit controls', () => {
      setContent();
      render(<GmLore />);
      expect(screen.queryByText('+ New entry')).not.toBeInTheDocument();
      selectEntry('Sandpoint');
      const detail = screen.getByTestId('lore-detail-sandpoint');
      expect(within(detail).queryByText('Save')).not.toBeInTheDocument();
      expect(within(detail).queryByText('Delete')).not.toBeInTheDocument();
      expect(within(detail).queryByLabelText('title')).not.toBeInTheDocument();
      expect(within(detail).queryByLabelText('content')).not.toBeInTheDocument();
      expect(within(detail).queryByLabelText('visibility')).not.toBeInTheDocument();
    });
  });

  it('renders a tab per category (All + sorted)', () => {
    setMulti();
    render(<GmLore />);
    const nav = screen.getByLabelText('lore categories');
    ['All', 'History', 'Location', 'Religion'].forEach((t) =>
      expect(within(nav).getByText(t)).toBeInTheDocument()
    );
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument();
  });

  it('filters to the active category tab and the count reflects it', () => {
    setMulti();
    render(<GmLore />);
    fireEvent.click(within(screen.getByLabelText('lore categories')).getByText('Location'));
    expect(screen.getByRole('button', { name: 'Sandpoint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Magnimar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Aroden' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
  });

  it('scopes the text filter within the active category tab', () => {
    setMulti();
    render(<GmLore />);
    fireEvent.click(within(screen.getByLabelText('lore categories')).getByText('Location'));
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'magni' } });
    expect(screen.getByRole('button', { name: 'Magnimar' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sandpoint' })).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 2')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'deity' } });
    expect(screen.getByText('Showing 0 of 2')).toBeInTheDocument();
  });

  describe('reveal control', () => {
    it('reveals an entry in one tap, persisting the full doc with only visibility changed', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('Sandpoint');
      const detail = screen.getByTestId('lore-detail-sandpoint');
      fireEvent.click(within(detail).getByText('Reveal to players'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const [collection, id, data] = saveDocument.mock.calls[0];
      expect(collection).toBe('lore');
      expect(id).toBe('sandpoint');
      expect(data.visibility).toBe('revealed');
      // Every other field rides along unchanged from the live doc.
      expect(data.content).toBe('Sandpoint sits in a cove.');
      expect(data.related).toEqual(['aroden']);
      expect(data.createdAt).toBe('2025-01-01T00:00:00.000Z');
      // Button flips so the same tap hides it again.
      expect(within(detail).getByText('Hide from players')).toBeInTheDocument();
    });

    it('preserves vault-only fields (dateArStart/tags) on a reveal toggle', async () => {
      const dated = {
        id: 'late-unpleasantness',
        title: 'The Late Unpleasantness',
        category: 'History',
        summary: 'Dark days.',
        content: 'In 4702 AR…',
        related: [],
        dateArStart: 4702,
        dateArEnd: 4703,
        tags: ['history'],
        visibility: 'gm',
        createdAt: '2025-01-01T00:00:00.000Z',
      };
      useContent.mockReturnValue({ allLoreEntries: [dated], images: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('The Late Unpleasantness');
      fireEvent.click(screen.getByText('Reveal to players'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const data = saveDocument.mock.calls[0][2];
      expect(data.visibility).toBe('revealed');
      expect(data.dateArStart).toBe(4702);
      expect(data.dateArEnd).toBe(4703);
      expect(data.tags).toEqual(['history']);
    });

    it('badges revealed entries in the master list and offers to hide them', () => {
      const revealed = { ...loreEntries[0], visibility: 'revealed' };
      useContent.mockReturnValue({ allLoreEntries: [revealed, loreEntries[1]], images: [] });
      render(<GmLore />);
      expect(screen.getByText('Revealed')).toBeInTheDocument();
      selectEntry(/Sandpoint/);
      const detail = screen.getByTestId('lore-detail-sandpoint');
      expect(within(detail).getByText('Hide from players')).toBeInTheDocument();
    });
  });

  describe('list navigation', () => {
    it('groups the All tab by category with heading rows', () => {
      setMulti();
      render(<GmLore />);
      const list = screen.getByLabelText('entry list');
      ['History', 'Location', 'Religion'].forEach((g) =>
        expect(within(list).getByText(g)).toBeInTheDocument()
      );
      const rows = within(list).getAllByRole('button').map((b) => b.textContent);
      expect(rows.findIndex((t) => t.includes('Aroden'))).toBeLessThan(
        rows.findIndex((t) => t.includes('Sandpoint'))
      );
    });

    it('omits group headings inside a single-category tab', () => {
      setMulti();
      render(<GmLore />);
      fireEvent.click(within(screen.getByLabelText('lore categories')).getByText('Location'));
      const list = screen.getByLabelText('entry list');
      expect(within(list).queryByText('Location')).not.toBeInTheDocument();
    });

    it('shows a reveal-state dot on each row', () => {
      const revealed = { ...multiCategory[0], visibility: 'revealed' };
      useContent.mockReturnValue({ allLoreEntries: [revealed, multiCategory[2]], images: [] });
      render(<GmLore />);
      const row = screen.getByRole('button', { name: /Sandpoint/ });
      expect(within(row).getByTitle('Revealed to players')).toBeInTheDocument();
      const gmRow = screen.getByRole('button', { name: 'Aroden' });
      expect(within(gmRow).getByTitle('GM only')).toBeInTheDocument();
    });
  });

  describe('bulk reveal', () => {
    const enterSelect = () => fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    const check = (id) => fireEvent.click(screen.getByLabelText(`select ${id}`));

    it('toggles selection mode: checkboxes in, bulk panel on first check, cleared on Done', () => {
      setMulti();
      render(<GmLore />);
      enterSelect();
      expect(screen.getByText('0 selected')).toBeInTheDocument();
      expect(screen.queryByTestId('lore-bulk-panel')).not.toBeInTheDocument();
      check('aroden');
      expect(screen.getByTestId('lore-bulk-panel')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByTestId('lore-bulk-panel')).not.toBeInTheDocument();
      enterSelect();
      expect(screen.getByText('0 selected')).toBeInTheDocument();
    });

    it('select-all only checks the currently filtered entries', () => {
      setMulti();
      render(<GmLore />);
      fireEvent.click(within(screen.getByLabelText('lore categories')).getByText('Location'));
      enterSelect();
      fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
      expect(screen.getByText('2 selected')).toBeInTheDocument();
      expect(screen.getByText(/Bulk reveal — 2 entries selected/)).toBeInTheDocument();
    });

    it('bulk-reveals the selection, one PUT per entry, untouched fields preserved', async () => {
      setMulti();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      enterSelect();
      check('aroden');
      check('desna');
      fireEvent.change(screen.getByLabelText('bulk-visibility'), { target: { value: 'revealed' } });
      fireEvent.click(screen.getByText('Apply to selection'));
      await screen.findByText(/Updated 2, unchanged 0/);
      expect(saveDocument).toHaveBeenCalledTimes(2);
      const byId = Object.fromEntries(saveDocument.mock.calls.map(([, id, doc]) => [id, doc]));
      expect(byId.aroden.visibility).toBe('revealed');
      expect(byId.desna.visibility).toBe('revealed');
      expect(byId.aroden.title).toBe('Aroden');
    });

    it('skips no-op writes entirely', async () => {
      setMulti();
      render(<GmLore />);
      enterSelect();
      check('aroden');
      check('desna');
      fireEvent.click(screen.getByText('Apply to selection'));
      await screen.findByText(/Updated 0, unchanged 2/);
      expect(saveDocument).not.toHaveBeenCalled();
    });

    it('reports per-entry failures and keeps going', async () => {
      setMulti();
      saveDocument.mockImplementation((c, id) =>
        id === 'aroden' ? Promise.reject(new Error('boom')) : Promise.resolve({ ok: true })
      );
      render(<GmLore />);
      enterSelect();
      check('aroden');
      check('desna');
      fireEvent.change(screen.getByLabelText('bulk-visibility'), { target: { value: 'revealed' } });
      fireEvent.click(screen.getByText('Apply to selection'));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Updated 1, unchanged 0 — failed: aroden');
      expect(saveDocument).toHaveBeenCalledTimes(2);
    });
  });
});
