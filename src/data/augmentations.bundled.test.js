// Snapshot integrity gate for the Augmentations sample content (#1202 U1): the
// seed carries the first two augmentation docs (Coat of Arms — a passive note,
// Mirror — an actuated reaction), authored so U3 only extends. Runs the REAL
// augmentation model so an authoring slip (wrong type, missing augTarget, a shop
// leak, a malformed actuated block) is caught here rather than in the app.
import { items } from './index';
import { isAugmentation, augTargets, augmentationFits } from '../utils/augmentations';

const byId = (id) => items.find((i) => i.id === id);
const targe = { id: 'targe', name: 'Targe', shield: { bonus: 1 }, weight: 0.1 };

describe('seeded augmentations (U1 samples)', () => {
  it.each(['coat-of-arms', 'mirror'])('%s is a shield augmentation kept out of shops', (id) => {
    const doc = byId(id);
    expect(doc, `missing ${id}`).toBeTruthy();
    expect(isAugmentation(doc)).toBe(true);
    expect(augTargets(doc)).toEqual(['shield']);
    expect(doc.noShop).toBe(true); // #1106 — never enters shop stock or the Sale Shelf
    expect(typeof doc.name).toBe('string');
    expect(typeof doc.description).toBe('string');
    expect(doc.description.length).toBeGreaterThan(0);
    expect(augmentationFits(targe, doc)).toBe(true); // affixable onto a real shield
  });

  it('Coat of Arms is a passive note (no actuated block)', () => {
    expect(byId('coat-of-arms').actuated).toBeUndefined();
    expect(byId('coat-of-arms').price).toBe(20);
  });

  it('Mirror carries a well-formed actuated reaction', () => {
    const { actuated, price } = byId('mirror');
    expect(price).toBe(1);
    expect(actuated).toBeTruthy();
    expect(actuated.name).toBe('Mirror');
    expect(actuated.actionCount).toBe('reaction');
    expect(actuated.cost).toBe('none');
    expect(typeof actuated.description).toBe('string');
  });
});
