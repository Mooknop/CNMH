import { describe, it, expect } from 'vitest';
import {
  attachedKey,
  isShieldAttachment,
  validAttachHosts,
  attachedHostUid,
  attachmentOnShield,
  attach,
  unattach,
  attachedUidSet,
  attachmentsByHost,
  attachmentStrikes,
} from './shieldAttach';


const spikes = (uid = 'spk') => ({
  uid,
  name: 'Shield Spikes',
  attachment: { to: 'shield' },
  runes: { potency: 1, striking: 'striking' },
  strikes: [{ type: 'melee', actionCount: 1, damage: '1d6', damageType: 'piercing', traits: [] }],
});
const boss = (uid = 'bss') => ({
  uid, name: 'Shield Boss', traits: ['Attached'],
  strikes: [{ type: 'melee', actionCount: 1, damage: '1d6', damageType: 'bludgeoning', traits: [] }],
});
const shield = (uid, state) => ({ uid, name: 'Steel Shield', shield: { hardness: 5, health: 20, breakThreshold: 10 }, state });
const sword = (uid = 'sw') => ({ uid, name: 'Longsword', strikes: [{ type: 'melee', damage: '1d8' }] });

describe('shieldAttach — keys + classification', () => {
  it('keys the overlay per character', () => {
    expect(attachedKey('pellias')).toBe('cnmh_attached_pellias');
  });
  it('recognizes attachments by marker or Attached trait; needs strikes; not a shield', () => {
    expect(isShieldAttachment(spikes())).toBe(true);
    expect(isShieldAttachment(boss())).toBe(true);
    expect(isShieldAttachment(shield('s1'))).toBe(false);        // a shield, not an attachment
    expect(isShieldAttachment({ name: 'Spikes', attachment: { to: 'shield' } })).toBe(false); // no strikes
    expect(isShieldAttachment(sword())).toBe(false);             // plain weapon
  });
});

describe('shieldAttach — host validation', () => {
  it('only shields are valid hosts, excluding the attachment itself', () => {
    const items = [shield('s1'), shield('s2'), sword(), spikes('spk')];
    expect(validAttachHosts(items, spikes('spk')).map((i) => i.uid)).toEqual(['s1', 's2']);
  });
});

describe('shieldAttach — bind / unbind (one per shield)', () => {
  it('binds and reads back the host + reverse lookup', () => {
    const ov = attach({}, 'spk', 's1');
    expect(ov).toEqual({ spk: 's1' });
    expect(attachedHostUid(ov, 'spk')).toBe('s1');
    expect(attachmentOnShield(ov, 's1')).toBe('spk');
    expect(attachmentOnShield(ov, 's2')).toBeNull();
  });
  it('displaces any existing attachment already on that shield (one per shield)', () => {
    const ov = attach({ spk: 's1' }, 'bss', 's1'); // boss onto the shield that had spikes
    expect(ov).toEqual({ bss: 's1' });             // spikes displaced
  });
  it('keeps attachments bound to OTHER shields when binding', () => {
    const ov = attach({ spk: 's1' }, 'bss', 's2');
    expect(ov).toEqual({ spk: 's1', bss: 's2' });
  });
  it('unbinds by attachment uid', () => {
    expect(unattach({ spk: 's1', bss: 's2' }, 'spk')).toEqual({ bss: 's2' });
    expect(attachedUidSet({ spk: 's1', bss: 's2' })).toEqual(new Set(['spk', 'bss']));
  });
});

describe('shieldAttach — attachmentsByHost', () => {
  it('groups resolved attachment items under their host shield uid; skips stale', () => {
    const flat = [spikes('spk'), shield('s1', 'held1')];
    const grouped = attachmentsByHost({ spk: 's1', ghost: 's1' }, flat);
    expect(grouped.s1.map((i) => i.uid)).toEqual(['spk']); // 'ghost' uid doesn't resolve
  });
});

describe('shieldAttach — Strike injection', () => {
  const character = { name: 'Pellias', level: 5, abilities: { strength: 4 }, proficiencies: {} };

  it('injects the attachment Strike only when its host shield is HELD', () => {
    const heldChar = { ...character, inventory: [shield('s1', 'held1'), spikes('spk')] };
    const strikes = attachmentStrikes(heldChar, { spk: 's1' });
    expect(strikes).toHaveLength(1);
    expect(strikes[0]).toMatchObject({ shieldAttachment: true, hostUid: 's1' });
    expect(strikes[0].name).toContain('Shield Spikes');
  });

  it('injects nothing when the host shield is not held', () => {
    const stowedChar = { ...character, inventory: [shield('s1', 'stowed'), spikes('spk')] };
    expect(attachmentStrikes(stowedChar, { spk: 's1' })).toEqual([]);
  });

  it('injects nothing with an empty overlay or a non-attachment binding', () => {
    const heldChar = { ...character, inventory: [shield('s1', 'held1'), sword('sw')] };
    expect(attachmentStrikes(heldChar, {})).toEqual([]);
    expect(attachmentStrikes(heldChar, { sw: 's1' })).toEqual([]); // a plain sword isn't an attachment
  });

  it('folds the attachment\'s own runes into its Strike (striking scales the dice)', () => {
    const heldChar = { ...character, inventory: [shield('s1', 'held1'), spikes('spk')] };
    const [strike] = attachmentStrikes(heldChar, { spk: 's1' });
    // 1d6 base + a striking rune → two dice.
    expect(strike.damage).toMatch(/2d6/);
  });

  // Finesse host shield lends finesse to its attachment Strike (#1196 G3).
  const finesseBase = (uid, state) => ({ uid, name: 'Targe', shield: { hardness: 1 }, state, traits: ['Finesse'] });
  const featherShield = (uid, state) => ({
    uid, name: 'Kite Shield', shield: { hardness: 4 }, state,
    runes: { reinforcing: 'minor', property: [{ id: 'feather', type: 'property', name: 'Feather' }] },
  });

  it('adds Finesse to the attachment Strike when the host shield has finesse (base trait)', () => {
    const heldChar = { ...character, inventory: [finesseBase('s1', 'held1'), spikes('spk')] };
    const [strike] = attachmentStrikes(heldChar, { spk: 's1' });
    expect(strike.traits).toContain('Finesse');
  });

  it('adds Finesse to the attachment Strike when the host has a Feather rune', () => {
    const heldChar = { ...character, inventory: [featherShield('s1', 'held1'), spikes('spk')] };
    const [strike] = attachmentStrikes(heldChar, { spk: 's1' });
    expect(strike.traits).toContain('Finesse');
  });

  it('does not add Finesse when the host shield has none (no duplicate/spurious trait)', () => {
    const heldChar = { ...character, inventory: [shield('s1', 'held1'), spikes('spk')] };
    const [strike] = attachmentStrikes(heldChar, { spk: 's1' });
    expect(strike.traits).not.toContain('Finesse');
  });
});
