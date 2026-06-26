import { collectAuras, formatAuraReminder } from './auraReminders';

const wispAura = { save: 'fortitude', dc: 23, range: 'adjacent', effect: 'it becomes deafened until it moves away from you' };
const dreadAura = { save: 'will', dc: 20, range: 30, requires: 'frightened', sight: true, effect: "the frightened value doesn't drop below 1 this turn" };

describe('collectAuras', () => {
  it('finds a top-level item aura on equipped gear', () => {
    const char = { inventory: [{ name: 'Wisp Chain', state: 'worn', aura: wispAura }] };
    expect(collectAuras(char)).toEqual([{ aura: wispAura, source: 'Wisp Chain' }]);
  });

  it('finds an aura on a property rune etched into an equipped item', () => {
    const char = {
      inventory: [
        { name: 'Studded Leather', state: 'worn', runes: { property: [{ id: 'dread', name: 'Dread (Lesser)', aura: dreadAura }] } },
      ],
    };
    expect(collectAuras(char)).toEqual([{ aura: dreadAura, source: 'Studded Leather (Dread (Lesser))' }]);
  });

  it('treats an unset item state as equipped', () => {
    const char = { inventory: [{ name: 'Wisp Chain', aura: wispAura }] };
    expect(collectAuras(char)).toHaveLength(1);
  });

  it('skips stowed/dropped gear', () => {
    expect(collectAuras({ inventory: [{ name: 'Wisp Chain', state: 'dropped', aura: wispAura }] })).toEqual([]);
  });

  it('ignores items without a valid aura block and string-id (unresolved) runes', () => {
    const char = {
      inventory: [
        { name: 'Plain Cloak', state: 'worn' },
        { name: 'Bad Aura', state: 'worn', aura: { effect: 'no save/dc' } },
        { name: 'Armor', state: 'worn', runes: { property: ['dread'] } },
      ],
    };
    expect(collectAuras(char)).toEqual([]);
  });

  it('is resilient to a missing/empty inventory', () => {
    expect(collectAuras({})).toEqual([]);
    expect(collectAuras(null)).toEqual([]);
  });
});

describe('formatAuraReminder', () => {
  it('formats an adjacent deafen aura (Wisp Chain)', () => {
    expect(formatAuraReminder({ aura: wispAura, source: 'Wisp Chain' }, 'Ashka', 'Goblin')).toBe(
      'Wisp Chain (Ashka): if Goblin ended its turn adjacent, DC 23 Fortitude or it becomes deafened until it moves away from you.'
    );
  });

  it('formats a ranged, requires + sight aura (Dread)', () => {
    expect(formatAuraReminder({ aura: dreadAura, source: 'Studded Leather (Dread)' }, 'Ashka', 'Goblin')).toBe(
      "Studded Leather (Dread) (Ashka): if Goblin ended its turn within 30 ft while frightened and can see you, DC 20 Will or the frightened value doesn't drop below 1 this turn."
    );
  });
});
