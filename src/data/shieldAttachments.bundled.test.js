// Snapshot integrity gate for shield attachments (#1165 Track 2, S8): the seeded
// attachment weapons classify correctly and Pellias's inventory is remodeled off
// the baked spiked shield. Runs the REAL utils so authoring drift is caught here.
import { items, sampleCharacters } from './index';
import { isShieldAttachment } from '../utils/shieldAttach';
import { gearTarget } from '../utils/runeSockets';

const byId = (id) => items.find((i) => i.id === id);

describe('seeded shield-attachment weapons', () => {
  it.each([
    ['shield-spikes', 'piercing'],
    ['shield-boss', 'bludgeoning'],
  ])('%s is a runable shield attachment (weapon target, own 1d6 %s Strike)', (id, dmgType) => {
    const item = byId(id);
    expect(item, `missing ${id}`).toBeTruthy();
    expect(isShieldAttachment(item)).toBe(true);
    expect(item.attachment).toEqual({ to: 'shield' });
    // No shield block of its own → gearTarget stays 'weapon' (takes weapon runes).
    expect(gearTarget(item)).toBe('weapon');
    const strike = Array.isArray(item.strikes) ? item.strikes[0] : item.strikes;
    expect(strike.damage).toBe('1d6');
    expect(strike.damageType).toBe(dmgType);
  });

  it('keeps the deprecated spiked-steel-shield so live inventories still resolve', () => {
    // Not removed: character diff-apply preserves live inventory, so a live PC may
    // still reference it until the GM swaps it manually.
    expect(byId('spiked-steel-shield')).toBeTruthy();
  });
});

describe('Pellias remodel', () => {
  const pellias = sampleCharacters.find((c) => (c.name || '').toLowerCase().includes('pellias'));

  it('carries a plain steel shield + a Shield Spikes attachment, not the baked spiked shield', () => {
    expect(pellias).toBeTruthy();
    const refs = (pellias.inventory || []).map((e) => e.ref);
    expect(refs).toContain('steel-shield');
    expect(refs).toContain('shield-spikes');
    expect(refs).not.toContain('spiked-steel-shield');
  });
});
