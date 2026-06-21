import { applyRemovedOverlay } from './removedOverlay';

const inv = () => [
  { uid: 'a', name: 'Sword', weight: 1 },
  { uid: 'b', name: 'Shield', weight: 1 },
  {
    uid: 'pack',
    name: 'Backpack',
    weight: 0.1,
    container: { capacity: 4, contents: [{ uid: 'c', name: 'Rope', weight: 1 }] },
  },
];

describe('applyRemovedOverlay', () => {
  it('returns the inventory unchanged for an empty overlay', () => {
    const list = inv();
    expect(applyRemovedOverlay(list, [])).toBe(list);
    expect(applyRemovedOverlay(list, undefined)).toBe(list);
  });

  it('masks a top-level entry by uid', () => {
    const out = applyRemovedOverlay(inv(), ['b']);
    expect(out.map((e) => e.uid)).toEqual(['a', 'pack']);
  });

  it('masks a stowed entry inside a container', () => {
    const out = applyRemovedOverlay(inv(), ['c']);
    const pack = out.find((e) => e.uid === 'pack');
    expect(pack.container.contents).toEqual([]);
    // siblings untouched
    expect(out.map((e) => e.uid)).toEqual(['a', 'b', 'pack']);
  });

  it('accepts a Set as well as an array', () => {
    const out = applyRemovedOverlay(inv(), new Set(['a']));
    expect(out.map((e) => e.uid)).toEqual(['b', 'pack']);
  });

  it('does not mutate the source tree', () => {
    const list = inv();
    applyRemovedOverlay(list, ['c']);
    expect(list[2].container.contents).toHaveLength(1);
  });

  it('leaves entries without a uid alone', () => {
    const list = [{ name: 'Mystery', weight: 0 }, { uid: 'a', name: 'Sword' }];
    const out = applyRemovedOverlay(list, ['a']);
    expect(out).toEqual([{ name: 'Mystery', weight: 0 }]);
  });
});
