import { buildInventoryEntry, grantCraftedItem } from './applyCrafting';

describe('buildInventoryEntry', () => {
  it('builds a catalog ref entry with quantity 1 and a fresh uid', () => {
    const e = buildInventoryEntry({ ref: 'shield', level: 5 });
    expect(e).toMatchObject({ ref: 'shield', level: 5, quantity: 1 });
    expect(typeof e.uid).toBe('string');
  });

  it('omits level when absent', () => {
    expect(buildInventoryEntry({ ref: 'torch' })).not.toHaveProperty('level');
  });

  it('carries a craft-time augmentation binding onto the entry (#1202 U2)', () => {
    const e = buildInventoryEntry({ ref: 'targe', augmentation: { ref: 'mirror', choice: 'Dragon' } });
    expect(e.augmentation).toEqual({ ref: 'mirror', choice: 'Dragon' });
  });

  it('ignores a malformed augmentation (no ref)', () => {
    expect(buildInventoryEntry({ ref: 'targe', augmentation: {} })).not.toHaveProperty('augmentation');
  });
});

describe('grantCraftedItem', () => {
  const entry = { charId: 'c2', charName: 'Blu', ref: 'shield', level: null, itemName: 'Sturdy Shield' };

  it('appends a ref entry to the raw doc and persists via saveDocument', async () => {
    const rawCharacters = [{ id: 'c2', name: 'Blu', inventory: [{ ref: 'dagger' }] }];
    const saveDocument = vi.fn(() => Promise.resolve());
    const refresh = vi.fn();
    const appendLog = vi.fn();

    const ok = await grantCraftedItem({ entry, rawCharacters, saveDocument, refresh, appendLog });

    expect(ok).toBe(true);
    const [collection, id, doc] = saveDocument.mock.calls[0];
    expect(collection).toBe('character');
    expect(id).toBe('c2');
    expect(doc.inventory).toHaveLength(2);
    expect(doc.inventory[1].ref).toBe('shield');
    expect(refresh).toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ charId: 'c2', text: expect.stringContaining('crafted Sturdy Shield') }),
    );
  });

  it('handles a doc with no existing inventory', async () => {
    const saveDocument = vi.fn(() => Promise.resolve());
    await grantCraftedItem({ entry, rawCharacters: [{ id: 'c2' }], saveDocument });
    expect(saveDocument.mock.calls[0][2].inventory).toHaveLength(1);
  });

  it('returns false and does not save when the character is missing', async () => {
    const saveDocument = vi.fn(() => Promise.resolve());
    const ok = await grantCraftedItem({ entry, rawCharacters: [], saveDocument });
    expect(ok).toBe(false);
    expect(saveDocument).not.toHaveBeenCalled();
  });
});
