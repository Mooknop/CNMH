import {
  reuid,
  subtreeUids,
  transferBlockReason,
  handBlockReason,
  gmTransferItem,
  gmSetLoadoutEntry,
} from './inventoryTransfer';

// Deterministic uids so a gifted subtree is assertable.
let uidSeq = 0;
vi.mock('./uid', () => ({ newEntryUid: () => `gift-${++uidSeq}` }));

// Minimal session stand-in: a flat `${id}:${type}` state map + a call log.
const makeSession = (state = {}) => {
  const map = { ...state };
  const sent = [];
  return {
    sent,
    getState: (id, type) => map[`${id}:${type}`],
    sendUpdate: (id, type, value, options) => {
      sent.push({ id, type, value, options });
      map[`${id}:${type}`] = value;
    },
  };
};

beforeEach(() => {
  uidSeq = 0;
});

const sword = { uid: 'auth1', name: 'Longsword', weight: 1, state: 'worn' };
const pack = {
  uid: 'pack',
  name: 'Backpack',
  weight: 0.1,
  state: 'worn',
  container: { capacity: 4, contents: [{ uid: 'rope', name: 'Rope', weight: 1, state: 'stowed' }] },
};

describe('reuid', () => {
  it('mints a fresh uid and strips the live placement fields', () => {
    expect(reuid({ ...sword, hand: 1, state: 'held1' })).toEqual({
      uid: 'gift-1',
      name: 'Longsword',
      weight: 1,
    });
  });

  it('re-uids a container subtree depth-first', () => {
    const copy = reuid(pack);
    expect(copy.uid).toBe('gift-1');
    expect(copy.container.contents[0].uid).toBe('gift-2');
    expect(copy.container.contents[0].state).toBeUndefined();
  });

  it('tolerates a null item', () => {
    expect(reuid(null)).toEqual({ uid: 'gift-1' });
  });
});

describe('subtreeUids', () => {
  it('returns the entry uid alone for plain gear', () => {
    expect(subtreeUids(sword)).toEqual(['auth1']);
  });

  it('includes every content uid for a container', () => {
    expect(subtreeUids(pack)).toEqual(['pack', 'rope']);
  });

  it('returns nothing for a uid-less entry', () => {
    expect(subtreeUids({ name: 'Ghost' })).toEqual([]);
  });
});

describe('transferBlockReason', () => {
  it('passes ordinary gear', () => {
    expect(transferBlockReason(sword, {})).toBeNull();
  });

  it('blocks body-bound gear (a tattoo)', () => {
    const tattoo = { uid: 't1', name: 'Carnasia Tattoo', traits: ['Magical', 'Tattoo'] };
    expect(transferBlockReason(tattoo, {})).toMatch(/tattooed/i);
  });

  it('blocks a talisman that is affixed to a host', () => {
    expect(transferBlockReason({ uid: 'tal', name: 'Fear Gem' }, { tal: 'auth1' })).toMatch(
      /affix/i,
    );
  });

  it('blocks the host that is carrying an affixed talisman', () => {
    expect(transferBlockReason(sword, { tal: 'auth1' })).toMatch(/affix/i);
  });

  it('blocks a container whose CONTENT is affix-entangled', () => {
    expect(transferBlockReason(pack, { tal: 'rope' })).toMatch(/affix/i);
  });

  it('blocks an entry with no uid', () => {
    expect(transferBlockReason({ name: 'Ghost' }, {})).toMatch(/entry id/i);
  });
});

describe('handBlockReason', () => {
  it('passes ordinary gear', () => {
    expect(handBlockReason(sword)).toBeNull();
  });

  it('blocks a container — it is worn, not wielded', () => {
    expect(handBlockReason(pack)).toMatch(/container/i);
  });

  it('blocks body-bound gear', () => {
    expect(handBlockReason({ uid: 't1', name: 'Tattoo', traits: ['Tattoo'] })).toMatch(/tattooed/i);
  });
});

describe('gmTransferItem', () => {
  it('credits the recipient with a fresh clone on their acquired overlay', () => {
    const s = makeSession();
    expect(gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: sword })).toEqual({ ok: true });
    expect(s.sent[0]).toEqual({
      id: 'b',
      type: 'acquired',
      value: [{ uid: 'gift-1', name: 'Longsword', weight: 1 }],
      options: { force: true },
    });
  });

  it('appends to the recipient existing acquired overlay', () => {
    const s = makeSession({ 'b:acquired': [{ ref: 'dagger', uid: 'x' }] });
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: sword });
    expect(s.sent[0].value).toHaveLength(2);
  });

  it('masks an authored item through the giver removed overlay', () => {
    const s = makeSession();
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: sword });
    expect(s.sent[1]).toMatchObject({ id: 'a', type: 'removed', value: ['auth1'] });
  });

  it('splices an acquired item from the giver array instead of masking it', () => {
    const s = makeSession({ 'a:acquired': [{ ref: 'longsword', uid: 'auth1' }] });
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: sword });
    expect(s.sent[1]).toMatchObject({ id: 'a', type: 'acquired', value: [] });
    expect(s.sent.some((w) => w.type === 'removed')).toBe(false);
  });

  it('masks every authored uid in a container subtree', () => {
    const s = makeSession();
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: pack });
    expect(s.sent[1]).toMatchObject({ type: 'removed', value: ['pack', 'rope'] });
  });

  it('credits the recipient BEFORE debiting the giver', () => {
    const s = makeSession();
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: sword });
    expect(s.sent[0].id).toBe('b');
    expect(s.sent[1].id).toBe('a');
  });

  it('forces every write so an offline Foundry cannot freeze the move', () => {
    const s = makeSession();
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: pack });
    s.sent.forEach((w) => expect(w.options).toEqual({ force: true }));
  });

  it('unhands a held item — the recipient copy carries no state or hand', () => {
    const s = makeSession();
    gmTransferItem({
      ...s,
      fromId: 'a',
      toId: 'b',
      item: { ...sword, state: 'held1', hand: 2 },
    });
    expect(s.sent[0].value[0].state).toBeUndefined();
    expect(s.sent[0].value[0].hand).toBeUndefined();
  });

  it('never double-masks a uid already in the removed overlay', () => {
    const s = makeSession({ 'a:removed': ['auth1'] });
    gmTransferItem({ ...s, fromId: 'a', toId: 'b', item: sword });
    expect(s.sent.filter((w) => w.type === 'removed')).toHaveLength(0);
  });

  it.each([
    ['the same character', { fromId: 'a', toId: 'a' }],
    ['no recipient', { fromId: 'a', toId: '' }],
  ])('refuses %s without writing', (_label, ids) => {
    const s = makeSession();
    const res = gmTransferItem({ ...s, ...ids, item: sword });
    expect(res.ok).toBe(false);
    expect(s.sent).toHaveLength(0);
  });

  it('refuses body-bound gear with the reason, writing nothing', () => {
    const s = makeSession();
    const res = gmTransferItem({
      ...s,
      fromId: 'a',
      toId: 'b',
      item: { uid: 't1', name: 'Tattoo', traits: ['Tattoo'] },
    });
    expect(res.ok).toBe(false);
    expect(res.reason).toMatch(/tattooed/i);
    expect(s.sent).toHaveLength(0);
  });

  it('refuses an affix-entangled item, writing nothing', () => {
    const s = makeSession();
    const res = gmTransferItem({
      ...s,
      fromId: 'a',
      toId: 'b',
      item: sword,
      affixed: { tal: 'auth1' },
    });
    expect(res.ok).toBe(false);
    expect(s.sent).toHaveLength(0);
  });
});

describe('gmSetLoadoutEntry', () => {
  it('merges a patch into the character loadout overlay, forced', () => {
    const s = makeSession({ 'a:loadout': { other: { state: 'worn' } } });
    gmSetLoadoutEntry({ ...s, charId: 'a', uid: 'auth1', patch: { state: 'held1', hand: 1 } });
    expect(s.sent[0]).toEqual({
      id: 'a',
      type: 'loadout',
      value: { other: { state: 'worn' }, auth1: { state: 'held1', hand: 1 } },
      options: { force: true },
    });
  });

  it('preserves the entry existing fields', () => {
    const s = makeSession({ 'a:loadout': { auth1: { state: 'held1', hand: 2 } } });
    gmSetLoadoutEntry({ ...s, charId: 'a', uid: 'auth1', patch: { container: 'pack' } });
    expect(s.sent[0].value.auth1).toEqual({ state: 'held1', hand: 2, container: 'pack' });
  });

  it('DELETES a key patched to undefined (how a stow clears the hand)', () => {
    const s = makeSession({ 'a:loadout': { auth1: { state: 'held1', hand: 2 } } });
    gmSetLoadoutEntry({
      ...s,
      charId: 'a',
      uid: 'auth1',
      patch: { state: 'worn', hand: undefined, container: 'pack' },
    });
    expect(s.sent[0].value.auth1).toEqual({ state: 'worn', container: 'pack' });
  });

  it('refuses without a uid', () => {
    const s = makeSession();
    expect(gmSetLoadoutEntry({ ...s, charId: 'a', uid: null, patch: {} }).ok).toBe(false);
    expect(s.sent).toHaveLength(0);
  });
});
