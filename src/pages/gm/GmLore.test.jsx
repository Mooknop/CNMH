import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmLore from './GmLore';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';

const loreEntries = [
  {
    id: 'sandpoint',
    title: 'Sandpoint',
    category: 'Location',
    summary: 'A town.',
    content: 'Sandpoint sits in a cove.',
    related: ['varisia'],
    tags: ['town', 'hub'],
    createdAt: '2025-01-01T00:00:00.000Z',
  },
  {
    id: 'aroden',
    title: 'Aroden',
    category: 'History',
    summary: 'A dead god.',
    content: 'He died.',
    related: [],
    tags: ['deity'],
  },
];

const setContent = () => useContent.mockReturnValue({ allLoreEntries: loreEntries, images: [] });

const multiCategory = [
  { id: 'sandpoint', title: 'Sandpoint', category: 'Location', tags: ['town'] },
  { id: 'magnimar', title: 'Magnimar', category: 'Location', tags: ['city'] },
  { id: 'aroden', title: 'Aroden', category: 'History', tags: ['deity'] },
  { id: 'desna', title: 'Desna', category: 'Religion', tags: ['deity'] },
];
const setMulti = () => useContent.mockReturnValue({ allLoreEntries: multiCategory, images: [] });

afterEach(() => vi.restoreAllMocks());

// Helper: select a lore entry list item to open its form in the detail pane.
const selectEntry = (name) =>
  fireEvent.click(screen.getByRole('button', { name }));

describe('GmLore', () => {
  it('lists all entries as master-list buttons and shows a count', () => {
    setContent();
    render(<GmLore />);
    expect(screen.getByRole('button', { name: 'Sandpoint' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aroden' })).toBeInTheDocument();
    expect(screen.queryByTestId('lore-form-sandpoint')).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 2 of 2/)).toBeInTheDocument();
  });

  it('filters the list by title, category, tag or id', () => {
    setContent();
    render(<GmLore />);
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'history' } });
    expect(screen.getByRole('button', { name: 'Aroden' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Sandpoint' })).not.toBeInTheDocument();
    expect(screen.getByText(/Showing 1 of 2/)).toBeInTheDocument();
  });

  it('edits an entry and saves arrays parsed from CSV, preserving createdAt', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    selectEntry('Sandpoint');
    const form = screen.getByTestId('lore-form-sandpoint');
    fireEvent.change(within(form).getByLabelText('tags'), { target: { value: 'town, hub, port' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('lore');
    expect(id).toBe('sandpoint');
    expect(data.tags).toEqual(['town', 'hub', 'port']);
    expect(data.related).toEqual(['varisia']);
    expect(data.createdAt).toBe('2025-01-01T00:00:00.000Z');
  });

  it('requires a title and a category', async () => {
    setContent();
    render(<GmLore />);
    selectEntry('Aroden');
    const form = screen.getByTestId('lore-form-aroden');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: '' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Title is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a new entry with a slug id and a createdAt', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    fireEvent.click(screen.getByText('+ New entry'));
    const form = screen.getByTestId('lore-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'The Old Light' } });
    fireEvent.change(within(form).getByLabelText('category'), { target: { value: 'Location' } });
    fireEvent.click(within(form).getByText('Create entry'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('the-old-light');
    expect(typeof data.createdAt).toBe('string');
  });

  it('deletes an entry only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    selectEntry('Aroden');
    const form = screen.getByTestId('lore-form-aroden');
    fireEvent.click(within(form).getByText('Delete'));
    expect(within(form).getByText('Delete forever')).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: 'Aroden' } });
    fireEvent.click(within(form).getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('lore', 'aroden'));
  });

  it('warns before overwriting an existing id when creating a new entry', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    fireEvent.click(screen.getByText('+ New entry'));
    const form = screen.getByTestId('lore-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Aroden' } });
    fireEvent.change(within(form).getByLabelText('category'), { target: { value: 'History' } });
    fireEvent.click(within(form).getByText('Create entry'));
    expect(saveDocument).not.toHaveBeenCalled();
    fireEvent.click(within(form).getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('lore', 'aroden', expect.objectContaining({ id: 'aroden' }))
    );
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
    // 'aroden' is in History, not Location — never shown even though it would
    // match a broader search.
    fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'deity' } });
    expect(screen.getByText('Showing 0 of 2')).toBeInTheDocument();
  });

  it('prefills a new entry category from the active tab; blank under All', async () => {
    setMulti();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmLore />);
    fireEvent.click(within(screen.getByLabelText('lore categories')).getByText('Religion'));
    fireEvent.click(screen.getByText('+ New entry'));
    const form = screen.getByTestId('lore-form-new');
    expect(within(form).getByLabelText('category')).toHaveValue('Religion');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Pharasma' } });
    fireEvent.click(within(form).getByText('Create entry'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'lore',
        'pharasma',
        expect.objectContaining({ category: 'Religion' })
      )
    );
  });

  describe('visibility', () => {
    it('defaults the form to GM only for legacy entries and saves the flag', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('Sandpoint');
      const form = screen.getByTestId('lore-form-sandpoint');
      expect(within(form).getByLabelText('visibility')).toHaveValue('gm');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].visibility).toBe('gm');
    });

    it('creates new entries as GM only by default', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      fireEvent.click(screen.getByText('+ New entry'));
      const form = screen.getByTestId('lore-form-new');
      fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'The Pit' } });
      fireEvent.change(within(form).getByLabelText('category'), { target: { value: 'Location' } });
      fireEvent.click(within(form).getByText('Create entry'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].visibility).toBe('gm');
    });

    it('saves a revealed visibility chosen in the form select', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('Sandpoint');
      const form = screen.getByTestId('lore-form-sandpoint');
      fireEvent.change(within(form).getByLabelText('visibility'), { target: { value: 'revealed' } });
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].visibility).toBe('revealed');
    });

    it('reveals an entry in one tap, persisting immediately', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('Sandpoint');
      const form = screen.getByTestId('lore-form-sandpoint');
      fireEvent.click(within(form).getByText('Reveal to players'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      const [collection, id, data] = saveDocument.mock.calls[0];
      expect(collection).toBe('lore');
      expect(id).toBe('sandpoint');
      expect(data.visibility).toBe('revealed');
      // Button flips so the same tap hides it again.
      expect(within(form).getByText('Hide from players')).toBeInTheDocument();
    });

    it('badges revealed entries in the master list and offers to hide them', () => {
      const revealed = { ...loreEntries[0], visibility: 'revealed' };
      useContent.mockReturnValue({ allLoreEntries: [revealed, loreEntries[1]], images: [] });
      render(<GmLore />);
      expect(screen.getByText('Revealed')).toBeInTheDocument();
      selectEntry(/Sandpoint/);
      const form = screen.getByTestId('lore-form-sandpoint');
      expect(within(form).getByLabelText('visibility')).toHaveValue('revealed');
      expect(within(form).getByText('Hide from players')).toBeInTheDocument();
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
      // Entries are sorted so each category's rows sit under its heading.
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

    it('shows a reveal dot and a compact tag line on each row', () => {
      const tagged = {
        ...multiCategory[0],
        tags: ['town', 'coast', 'varisia', 'hub'],
        visibility: 'revealed',
      };
      useContent.mockReturnValue({ allLoreEntries: [tagged, multiCategory[2]], images: [] });
      render(<GmLore />);
      const row = screen.getByRole('button', { name: /Sandpoint/ });
      expect(within(row).getByTitle('Revealed to players')).toBeInTheDocument();
      expect(within(row).getByText('town, coast, varisia +1')).toBeInTheDocument();
      const gmRow = screen.getByRole('button', { name: 'Aroden' });
      expect(within(gmRow).getByTitle('GM only')).toBeInTheDocument();
    });

    it('filters by tag chips with AND semantics and a clear affordance', () => {
      setMulti();
      render(<GmLore />);
      const tagbar = () => screen.getByLabelText('tag filters');
      fireEvent.click(within(tagbar()).getByText('deity'));
      expect(screen.getByText('Showing 2 of 2')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Aroden' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Sandpoint' })).not.toBeInTheDocument();
      // Second active tag narrows further (entry must carry every tag).
      fireEvent.click(within(tagbar()).getByText('city'));
      expect(screen.getByText('Showing 0 of 0')).toBeInTheDocument();
      fireEvent.click(within(tagbar()).getByText('× clear'));
      expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument();
    });

    it('scopes tag chips to the active category tab and composes with search', () => {
      setMulti();
      render(<GmLore />);
      fireEvent.click(within(screen.getByLabelText('lore categories')).getByText('Location'));
      const tagbar = screen.getByLabelText('tag filters');
      expect(within(tagbar).queryByText('deity')).not.toBeInTheDocument();
      fireEvent.click(within(tagbar).getByText('town'));
      fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'magni' } });
      expect(screen.getByText('Showing 0 of 1')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('filter'), { target: { value: 'sand' } });
      expect(screen.getByRole('button', { name: 'Sandpoint' })).toBeInTheDocument();
    });
  });

  describe('bulk editing', () => {
    const enterSelect = () => fireEvent.click(screen.getByRole('button', { name: 'Select' }));
    const check = (id) => fireEvent.click(screen.getByLabelText(`select ${id}`));

    it('toggles selection mode: checkboxes in, bulk panel on first check, cleared on Done', () => {
      setMulti();
      render(<GmLore />);
      enterSelect();
      expect(screen.getByText('+ New entry')).toBeDisabled();
      expect(screen.getByText('0 selected')).toBeInTheDocument();
      expect(screen.queryByTestId('lore-bulk-panel')).not.toBeInTheDocument();
      check('aroden');
      expect(screen.getByTestId('lore-bulk-panel')).toBeInTheDocument();
      expect(screen.getByText('1 selected')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Done' }));
      expect(screen.queryByTestId('lore-bulk-panel')).not.toBeInTheDocument();
      // Re-entering starts from an empty selection.
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
      expect(screen.getByText(/Bulk edit — 2 entries selected/)).toBeInTheDocument();
    });

    it('bulk-reveals the selection, one PUT per entry', async () => {
      setMulti();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      enterSelect();
      check('aroden');
      check('desna');
      fireEvent.change(screen.getByLabelText('bulk-visibility'), {
        target: { value: 'revealed' },
      });
      fireEvent.click(screen.getByText('Apply to selection'));
      await screen.findByText(/Updated 2, unchanged 0/);
      expect(saveDocument).toHaveBeenCalledTimes(2);
      const byId = Object.fromEntries(saveDocument.mock.calls.map(([, id, doc]) => [id, doc]));
      expect(byId.aroden.visibility).toBe('revealed');
      expect(byId.desna.visibility).toBe('revealed');
      // Untouched fields ride along from the live doc.
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

    it('adds and removes tags across the selection', async () => {
      setMulti();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      enterSelect();
      check('aroden');
      check('sandpoint');
      // Union chips show counts; queue 'deity' (only on aroden) for removal.
      const tagbar = screen.getByLabelText('bulk tags');
      fireEvent.click(within(tagbar).getByText('deity ×1'));
      fireEvent.change(screen.getByLabelText('bulk-add-tags'), {
        target: { value: 'doom, town' },
      });
      fireEvent.click(screen.getByText('Apply to selection'));
      await screen.findByText(/Updated 2, unchanged 0/);
      const byId = Object.fromEntries(saveDocument.mock.calls.map(([, id, doc]) => [id, doc]));
      expect(byId.aroden.tags).toEqual(['doom', 'town']);
      // 'town' already on sandpoint — not duplicated.
      expect(byId.sandpoint.tags).toEqual(['town', 'doom']);
    });

    it('adds related ids by title and removes via chips', async () => {
      const withRelated = [
        { id: 'sandpoint', title: 'Sandpoint', category: 'Location', related: ['old-light'] },
        { id: 'magnimar', title: 'Magnimar', category: 'Location', related: [] },
        { id: 'old-light', title: 'The Old Light', category: 'Location' },
      ];
      useContent.mockReturnValue({ allLoreEntries: withRelated, images: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      enterSelect();
      check('sandpoint');
      check('magnimar');
      // Existing related ids surface as title-labelled chips; queue removal.
      fireEvent.click(within(screen.getByLabelText('bulk related')).getByText('The Old Light ×1'));
      // Adding by title resolves to the slug id.
      fireEvent.change(screen.getByLabelText('bulk-add-related'), {
        target: { value: 'Magnimar' },
      });
      fireEvent.click(screen.getByText('Apply to selection'));
      await screen.findByText(/Updated 2, unchanged 0/);
      const byId = Object.fromEntries(saveDocument.mock.calls.map(([, id, doc]) => [id, doc]));
      expect(byId.sandpoint.related).toEqual(['magnimar']);
      expect(byId.magnimar.related).toEqual(['magnimar']);
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
      fireEvent.change(screen.getByLabelText('bulk-visibility'), {
        target: { value: 'revealed' },
      });
      fireEvent.click(screen.getByText('Apply to selection'));
      const alert = await screen.findByRole('alert');
      expect(alert).toHaveTextContent('Updated 1, unchanged 0 — failed: aroden');
      expect(saveDocument).toHaveBeenCalledTimes(2);
    });
  });

  describe('image round-trip', () => {
    it('saves image id when lore entry has an image', async () => {
      const withImage = { ...loreEntries[0], image: 'img_sandpoint.jpg' };
      useContent.mockReturnValue({ allLoreEntries: [withImage], images: [] });
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('Sandpoint');
      const form = screen.getByTestId('lore-form-sandpoint');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].image).toBe('img_sandpoint.jpg');
    });

    it('omits image key when lore entry has no image', async () => {
      setContent();
      saveDocument.mockResolvedValue({ ok: true });
      render(<GmLore />);
      selectEntry('Sandpoint');
      const form = screen.getByTestId('lore-form-sandpoint');
      fireEvent.click(within(form).getByText('Save'));
      await waitFor(() => expect(saveDocument).toHaveBeenCalled());
      expect(saveDocument.mock.calls[0][2].image).toBeUndefined();
    });
  });
});
