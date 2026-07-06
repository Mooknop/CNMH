import { describe, it, expect } from 'vitest';
import { reinforcingRuneDocs, clearedGearEntry, applyGearEntry } from './gmRunes';
import { REINFORCING_TIERS } from './shieldRunes';

describe('reinforcingRuneDocs', () => {
  it('emits one shield-target fundamental doc per reinforcing tier', () => {
    const docs = reinforcingRuneDocs();
    expect(docs).toHaveLength(REINFORCING_TIERS.length);
    docs.forEach((d) => {
      expect(d.type).toBe('fundamental');
      expect(d.fundamental).toBe('reinforcing');
      expect(d.target).toBe('shield');
      expect(d.tierKey).toBeTruthy();
      expect(d.name).toBeTruthy();
    });
    expect(docs.map((d) => d.id)).toContain('reinforcing-minor');
  });
});

describe('clearedGearEntry', () => {
  it('clears potency AND its property runes, minting a fresh uid', () => {
    const item = { uid: 'w1', name: 'Longsword', runes: { potency: 2, striking: 'striking', property: ['flaming'] } };
    const out = clearedGearEntry(item, { type: 'potency' });
    expect(out.uid).not.toBe('w1');
    expect(out.runes).toEqual({ striking: 'striking' });
  });

  it('clears a keyed fundamental without touching the rest', () => {
    const item = { uid: 'w1', runes: { potency: 1, striking: 'greater' } };
    expect(clearedGearEntry(item, { type: 'striking' }).runes).toEqual({ potency: 1 });
  });

  it('removes a single property rune by index', () => {
    const item = { uid: 'w1', runes: { potency: 2, property: ['flaming', 'shock'] } };
    const out = clearedGearEntry(item, { type: 'property', index: 0 });
    expect(out.runes.property).toEqual(['shock']);
    expect(out.runes.potency).toBe(2);
  });

  it('clears the accessory rune and its baked config', () => {
    const item = { uid: 'c1', runes: { accessory: 'dragons-breath', accessoryConfig: { dragon: 'red' } } };
    expect(clearedGearEntry(item, { type: 'accessory' }).runes).toEqual({});
  });

  it('drops transient loadout fields', () => {
    const item = { uid: 'w1', state: 'held', hand: 1, runes: { striking: 'striking' } };
    const out = clearedGearEntry(item, { type: 'striking' });
    expect(out).not.toHaveProperty('state');
    expect(out).not.toHaveProperty('hand');
  });

  it('returns null for an unknown socket or missing input', () => {
    expect(clearedGearEntry({ uid: 'w1' }, { type: 'mystery' })).toBeNull();
    expect(clearedGearEntry(null, { type: 'potency' })).toBeNull();
  });
});

describe('applyGearEntry', () => {
  const entry = { uid: 'new', name: 'Runed' };

  it('masks an authored original via removed and credits acquired', () => {
    const { acquired, removed } = applyGearEntry([], [], 'w1', entry);
    expect(acquired).toEqual([entry]);
    expect(removed).toEqual(['w1']);
  });

  it('splices a previously-acquired item instead of masking it', () => {
    const prior = { uid: 'w1', name: 'Old runed' };
    const { acquired, removed } = applyGearEntry([prior], [], 'w1', entry);
    expect(acquired).toEqual([entry]);
    expect(removed).toEqual([]);
  });

  it('does not duplicate an already-masked uid', () => {
    const { removed } = applyGearEntry([], ['w1'], 'w1', entry);
    expect(removed).toEqual(['w1']);
  });
});
