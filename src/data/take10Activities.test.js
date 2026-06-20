import { availableTake10Activities, itemTake10Activities, TAKE10_ACTIVITIES } from './take10Activities';

describe('availableTake10Activities', () => {
  it('returns [] for a missing model', () => {
    expect(availableTake10Activities(null)).toEqual([]);
  });

  it('always offers the generic GM-adjudicated activity', () => {
    const list = availableTake10Activities({ flags: {}, skillProficiencies: {} });
    expect(list.map((a) => a.id)).toContain('other');
  });

  it('gates Refocus on a focus pool', () => {
    const without = availableTake10Activities({ flags: {}, skillProficiencies: {} });
    expect(without.map((a) => a.id)).not.toContain('refocus');
    const withPool = availableTake10Activities({ flags: { hasFocusSpells: true }, skillProficiencies: {} });
    expect(withPool.map((a) => a.id)).toContain('refocus');
  });

  it('gates Treat Wounds / Repair on skill training', () => {
    const trained = availableTake10Activities({
      flags: {},
      skillProficiencies: { medicine: 1, crafting: 2 },
    });
    const ids = trained.map((a) => a.id);
    expect(ids).toContain('treat-wounds');
    expect(ids).toContain('repair');
  });

  it('gates Learn a Spell on spellcasting AND a trained magic skill', () => {
    const skillOnly = availableTake10Activities({
      flags: {},
      skillProficiencies: { arcana: 1 },
    });
    expect(skillOnly.map((a) => a.id)).not.toContain('learn-a-spell');

    const both = availableTake10Activities({
      flags: { hasSpellcasting: true },
      skillProficiencies: { arcana: 1 },
    });
    expect(both.map((a) => a.id)).toContain('learn-a-spell');
  });

  it('declares a positive minute cost on every activity', () => {
    expect(TAKE10_ACTIVITIES.every((a) => a.minutes > 0)).toBe(true);
  });
});

describe('itemTake10Activities', () => {
  const oil = {
    id: 'oil-w', name: 'Oil of Weightlessness', traits: ['Consumable', 'Oil'],
    consumable: { kind: 'effect', target: 'item', durationMinutes: 60, label: 'Weightless', note: 'Negligible Bulk (1 hr)' },
  };
  const scrub = {
    id: 'scrub', name: 'Rust Scrub', traits: ['Consumable'],
    consumable: { kind: 'effect', target: 'item', transient: true, note: 'Restore 2d4 HP' },
  };
  const talisman = {
    uid: 't1', name: 'Potency Crystal', traits: ['Consumable', 'Talisman'],
    talisman: { affixTo: 'weapon' },
  };
  const longsword = { id: 'longsword', name: 'Longsword', strikes: [{ name: 'Longsword' }] };
  const model = { inventory: [oil, scrub, talisman, longsword] };

  it('returns [] for a missing model', () => {
    expect(itemTake10Activities(null)).toEqual([]);
  });

  it('surfaces a 10-minute oil with the other items as targets', () => {
    const list = itemTake10Activities(model);
    const oilAct = list.find((a) => a.kind === 'oil');
    expect(oilAct).toMatchObject({ id: 'oil:oil-w', itemUid: 'oil-w', itemName: 'Oil of Weightlessness', minutes: 10 });
    expect(oilAct.targets.map((t) => t.name)).toContain('Longsword');
    expect(oilAct.targets.map((t) => t.uid)).not.toContain('oil-w'); // never itself
  });

  it('excludes transient (no-duration) oils like Rust Scrub', () => {
    const list = itemTake10Activities(model);
    expect(list.some((a) => a.itemName === 'Rust Scrub')).toBe(false);
  });

  it('surfaces an unaffixed talisman with only type-matching hosts as targets', () => {
    const list = itemTake10Activities(model);
    const tAct = list.find((a) => a.kind === 'talisman');
    expect(tAct).toMatchObject({ id: 'talisman:t1', talismanUid: 't1', affixTo: 'weapon', minutes: 10 });
    // Only the weapon is a valid host (oil/scrub/itself excluded).
    expect(tAct.targets).toEqual([{ uid: 'longsword', name: 'Longsword' }]);
  });

  it('hides an already-affixed talisman', () => {
    const list = itemTake10Activities(model, { affixed: { t1: 'longsword' } });
    expect(list.some((a) => a.kind === 'talisman')).toBe(false);
  });

  it('hides a fully-consumed oil', () => {
    const list = itemTake10Activities(model, { consumed: { 'Oil of Weightlessness': 1 } });
    expect(list.some((a) => a.kind === 'oil')).toBe(false);
  });
});
