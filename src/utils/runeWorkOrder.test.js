import {
  createWorkOrder,
  createHandoffOrder,
  applyRunesToGear,
  isOrderReady,
  orderStatus,
  eligibleWeapons,
  foldRuneIntoWeapon,
  TURNAROUND_HOURS,
} from './runeWorkOrder';
import { toGameSeconds } from './gameTime';

const now = { day: 5, month: 2, year: 4725, hour: 8, minute: 0, second: 0 };
const nowS = toGameSeconds(now);
const weapon = { uid: 'w1', name: 'Longsword', strikes: { damage: '1d8' }, runes: { potency: 1 } };
const rune = { id: 'flaming', name: 'Flaming', price: 500 };

describe('createWorkOrder', () => {
  it('records the weapon snapshot, rune, price, and a 24h-later ready time', () => {
    const o = createWorkOrder({ weapon, rune, shopTitle: 'The Etcher', locationId: 'sandpoint', now, price: 500 });
    expect(o).toMatchObject({
      weaponUid: 'w1',
      weaponName: 'Longsword',
      runeRef: 'flaming',
      runeName: 'Flaming',
      readyLocationId: 'sandpoint',
      shopTitle: 'The Etcher',
      price: 500,
    });
    expect(o.paidAtSeconds).toBe(nowS);
    expect(o.readyAtSeconds).toBe(nowS + TURNAROUND_HOURS * 3600);
    expect(o.id).toBeTruthy();
  });
});

describe('isOrderReady', () => {
  const order = createWorkOrder({ weapon, rune, locationId: 'sandpoint', now, price: 500 });

  it('is false before the turnaround elapses, even back in town', () => {
    expect(isOrderReady(order, nowS + 3600, 'sandpoint')).toBe(false);
  });

  it('is false after the turnaround but in the wrong town', () => {
    expect(isOrderReady(order, order.readyAtSeconds + 1, 'magnimar')).toBe(false);
  });

  it('is true only once 24h has elapsed AND back in the shop’s town', () => {
    expect(isOrderReady(order, order.readyAtSeconds, 'sandpoint')).toBe(true);
  });
});

describe('orderStatus', () => {
  const order = createWorkOrder({ weapon, rune, locationId: 'sandpoint', now, price: 500 });
  it('flags waiting-on-time and waiting-on-place independently', () => {
    expect(orderStatus(order, nowS + 60, 'magnimar')).toEqual({ ready: false, waitingTime: true, waitingPlace: true });
    expect(orderStatus(order, order.readyAtSeconds, 'magnimar')).toEqual({ ready: false, waitingTime: false, waitingPlace: true });
    expect(orderStatus(order, order.readyAtSeconds, 'sandpoint')).toEqual({ ready: true, waitingTime: false, waitingPlace: false });
  });
});

describe('eligibleWeapons', () => {
  it('keeps items with strikes + a uid, drops the rest', () => {
    const inv = [weapon, { uid: 'p1', name: 'Potion' }, { name: 'No uid', strikes: {} }];
    expect(eligibleWeapons(inv).map((w) => w.uid)).toEqual(['w1']);
  });
});

describe('foldRuneIntoWeapon', () => {
  it('appends the property rune, keeps existing runes, mints a fresh uid', () => {
    const out = foldRuneIntoWeapon(weapon, 'flaming');
    expect(out.runes).toEqual({ potency: 1, property: ['flaming'] });
    expect(out.uid).toBeTruthy();
    expect(out.uid).not.toBe('w1');
    expect(out.name).toBe('Longsword');
  });

  it('does not duplicate a rune already present (string or object id)', () => {
    const w = { uid: 'w2', name: 'Axe', runes: { property: ['flaming', { id: 'frost' }] } };
    expect(foldRuneIntoWeapon(w, 'flaming').runes.property).toEqual(['flaming', { id: 'frost' }]);
    expect(foldRuneIntoWeapon(w, 'frost').runes.property).toEqual(['flaming', { id: 'frost' }]);
  });

  it('strips transient loadout fields (state/hand)', () => {
    const out = foldRuneIntoWeapon({ uid: 'w3', name: 'Mace', state: 'held1', hand: 1 }, 'flaming');
    expect(out.state).toBeUndefined();
    expect(out.hand).toBeUndefined();
    expect(out.runes.property).toEqual(['flaming']);
  });
});

describe('createHandoffOrder / applyRunesToGear (#857 S7a)', () => {
  const potency = { id: 'weapon-potency-1', type: 'fundamental', fundamental: 'potency', target: 'weapon', tier: 1, name: '+1 Weapon Potency', price: 35 };
  const flaming = { id: 'flaming', type: 'property', name: 'Flaming', price: 500 };

  it('builds one order holding the rune array, a joined name, and the summed price', () => {
    const o = createHandoffOrder({ gear: { uid: 'w1', name: 'Longsword', strikes: [{}] }, runes: [potency, flaming], shopTitle: 'Smith', locationId: 'sandpoint', now });
    expect(o).toMatchObject({ weaponUid: 'w1', weaponName: 'Longsword', runeName: '+1 Weapon Potency, Flaming', price: 535, readyLocationId: 'sandpoint' });
    expect(o.runes).toHaveLength(2);
    expect(o.readyAtSeconds).toBe(toGameSeconds(now) + TURNAROUND_HOURS * 3600);
  });

  it('applies fundamentals before property so the property slot exists', () => {
    const runed = applyRunesToGear({ uid: 'w1', name: 'Longsword', strikes: [{}] }, [flaming, potency]); // property listed first
    expect(runed.runes).toEqual({ potency: 1, property: ['flaming'] });
  });

  it('skips an incompatible rune rather than aborting the rest', () => {
    const slick = { id: 'slick', type: 'property', armorRune: true, name: 'Slick', price: 45 }; // armor rune
    const runed = applyRunesToGear({ uid: 'w1', name: 'Longsword', strikes: [{}] }, [potency, slick]);
    expect(runed.runes.potency).toBe(1);
    expect(runed.runes.property || []).not.toContain('slick');
  });

  it('folds an accessory rune into a target-less host on collect (#1033 S5)', () => {
    const menacing = { id: 'menacing', type: 'property', target: 'accessory', name: 'Menacing', price: 50, usage: ['clothing'] };
    const runed = applyRunesToGear({ uid: 'k1', name: 'Cloak', accessoryTags: ['cloak', 'clothing'] }, [menacing]);
    expect(runed.runes).toEqual({ accessory: 'menacing' });
    expect(runed.uid).not.toBe('k1');
  });

  it('folds a staged property rune\'s etchConfig.choice into the { id, choice } entry (#1196 G3)', () => {
    // A player-etched Energy-Resistant: the chosen damage type rides on
    // etchConfig and survives fulfillment (applyRune reads it without opts).
    const energyRes = {
      id: 'energy-resistant', type: 'property', target: 'shield', name: 'Energy-Resistant',
      price: 150, duplicable: true, etchConfig: { choice: 'fire' },
    };
    const shield = { uid: 'sh1', name: 'Steel Shield', weight: 1, shield: { hardness: 5 }, runes: { reinforcing: 'moderate' } };
    const runed = applyRunesToGear(shield, [energyRes]);
    expect(runed.runes.property).toEqual([{ id: 'energy-resistant', choice: 'fire' }]);
  });
});
