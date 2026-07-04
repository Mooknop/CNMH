import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn() }));

// Stub the picker modal so the editor tests drive selection deterministically —
// CatalogPicker has its own coverage. Exposes a button per fixture catalog item
// and reflects multiSelect so we can assert add (multi) vs resolve (single).
vi.mock('./CatalogPickerModal', () => ({
  default: ({ isOpen, onSelect, multiSelect }) =>
    isOpen ? (
      <div data-testid="picker" data-multi={String(multiSelect)}>
        <button type="button" onClick={() => onSelect([{ id: 'acid-flask', name: 'Acid Flask' }])}>
          pick-acid
        </button>
        <button type="button" onClick={() => onSelect([{ id: 'treasure-item', name: 'Treasure' }])}>
          pick-treasure
        </button>
      </div>
    ) : null,
}));

import { useContent } from '../../contexts/ContentContext';
import { saveDocument } from '../../utils/gmApi';
import RoomTreasureEditor from './RoomTreasureEditor';

const refresh = vi.fn();

const baseRoom = {
  id: 'a3',
  name: 'Shrine',
  site: 'Warren',
  treasureCache: {
    gold: 25,
    items: [
      { ref: 'healing-potion', name: 'Healing Potion', qty: 2 },
      { name: 'Shark Tooth Charm', qty: 1, value: 5 }, // unmatched placeholder
    ],
  },
};

const renderEditor = (room = baseRoom) => render(<RoomTreasureEditor room={room} />);

beforeEach(() => {
  useContent.mockReturnValue({
    items: [{ id: 'acid-flask', name: 'Acid Flask' }],
    runes: [{ id: 'raiment', name: 'Raiment' }], // merged into the picker catalog
    refresh,
  });
  saveDocument.mockResolvedValue({ ok: true });
  refresh.mockResolvedValue();
});

describe('RoomTreasureEditor', () => {
  it('renders gold and item lines, flagging the unmatched placeholder', () => {
    renderEditor();
    expect(screen.getByLabelText('Gold (gp)')).toHaveValue(25);
    expect(screen.getByText('Healing Potion')).toBeInTheDocument();
    const unmatched = screen.getByText('Shark Tooth Charm').closest('li');
    expect(unmatched).toHaveClass('is-unmatched');
    expect(within(unmatched).getByText('not in catalog')).toBeInTheDocument();
    // Only the unmatched line offers Resolve.
    expect(screen.getAllByRole('button', { name: 'Resolve…' })).toHaveLength(1);
  });

  it('edits gold and quantity and saves the cache payload shape', async () => {
    renderEditor();
    const saveBtn = screen.getByRole('button', { name: 'Save cache' });
    expect(saveBtn).toBeDisabled(); // nothing dirty yet

    fireEvent.change(screen.getByLabelText('Gold (gp)'), { target: { value: '40' } });
    fireEvent.change(screen.getByLabelText('Quantity for Healing Potion'), { target: { value: '3' } });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    expect(saveDocument).toHaveBeenCalledWith('room', 'a3', expect.objectContaining({
      treasureCache: {
        gold: 40,
        items: [
          { ref: 'healing-potion', name: 'Healing Potion', qty: 3 },
          { name: 'Shark Tooth Charm', qty: 1, value: 5 },
        ],
      },
    }));
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
    expect(refresh).toHaveBeenCalled();
  });

  it('adds a catalog item as a new line', async () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Add item…' }));
    expect(screen.getByTestId('picker')).toHaveAttribute('data-multi', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'pick-acid' }));

    expect(screen.getByText('Acid Flask')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save cache' }));
    expect(saveDocument).toHaveBeenCalledWith('room', 'a3', expect.objectContaining({
      treasureCache: expect.objectContaining({
        items: expect.arrayContaining([{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }]),
      }),
    }));
  });

  it('resolves an unmatched placeholder to a catalog item, clearing the flag', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve…' }));
    expect(screen.getByTestId('picker')).toHaveAttribute('data-multi', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'pick-acid' }));

    // The placeholder is now bound: canonical name, no flag, qty preserved.
    expect(screen.queryByText('Shark Tooth Charm')).not.toBeInTheDocument();
    expect(screen.queryByText('not in catalog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save cache' }));
    expect(saveDocument).toHaveBeenCalledWith('room', 'a3', expect.objectContaining({
      treasureCache: expect.objectContaining({
        items: expect.arrayContaining([{ ref: 'acid-flask', name: 'Acid Flask', qty: 1 }]),
      }),
    }));
  });

  it('removes a line', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Remove Healing Potion' }));
    expect(screen.queryByText('Healing Potion')).not.toBeInTheDocument();
  });

  it('resolving a valuable to the Treasure Item keeps its name and value', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve…' })); // the Shark Tooth Charm line
    fireEvent.click(screen.getByRole('button', { name: 'pick-treasure' }));

    // Now an editable treasure line: name preserved, no "not in catalog" flag.
    expect(screen.queryByText('not in catalog')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Treasure name for line 2')).toHaveValue('Shark Tooth Charm');
    expect(screen.getByLabelText('Value (gp) for line 2')).toHaveValue(5);

    fireEvent.click(screen.getByRole('button', { name: 'Save cache' }));
    expect(saveDocument).toHaveBeenCalledWith('room', 'a3', expect.objectContaining({
      treasureCache: expect.objectContaining({
        items: expect.arrayContaining([
          { ref: 'treasure-item', name: 'Shark Tooth Charm', qty: 1, value: 5 },
        ]),
      }),
    }));
  });

  it('edits a treasure line name and value inline', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Resolve…' }));
    fireEvent.click(screen.getByRole('button', { name: 'pick-treasure' }));

    fireEvent.change(screen.getByLabelText('Treasure name for line 2'), { target: { value: 'Silver Bowl' } });
    fireEvent.change(screen.getByLabelText('Value (gp) for line 2'), { target: { value: '25' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save cache' }));

    expect(saveDocument).toHaveBeenCalledWith('room', 'a3', expect.objectContaining({
      treasureCache: expect.objectContaining({
        items: expect.arrayContaining([
          { ref: 'treasure-item', name: 'Silver Bowl', qty: 1, value: 25 },
        ]),
      }),
    }));
  });

  it('locks a distributed cache and reopens it by clearing the stamp', async () => {
    renderEditor({ ...baseRoom, distributedAt: 1720000000000 });
    expect(screen.getByText(/cache is locked/i)).toBeInTheDocument();
    expect(screen.queryByLabelText('Gold (gp)')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Reopen cache' }));
    const [, , payload] = saveDocument.mock.calls[0];
    expect(payload).not.toHaveProperty('distributedAt');
    expect(payload).toEqual(expect.objectContaining({ id: 'a3', treasureCache: baseRoom.treasureCache }));
    // Button re-enables once the reopen resolves (the room prop is static here,
    // so it stays in the locked branch).
    expect(await screen.findByRole('button', { name: 'Reopen cache' })).toBeEnabled();
    expect(refresh).toHaveBeenCalled();
  });
});
