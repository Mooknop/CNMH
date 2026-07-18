// focusPlays (#1502 S4) — the contextual play list's pure ranking/annotation.
import { describe, it, expect } from 'vitest';
import { focusPlays, targetIntel, weaknessMatch } from './contextualPlays';
import { fullyRevealedRecord, defaultRecord } from '../../../utils/recallKnowledge';

const strike = (over = {}) => ({
  id: over.id || `strike-${over.name}`,
  name: 'Longsword',
  origin: 'strike',
  cost: 1,
  cat: 'attack',
  traits: [],
  needsTarget: true,
  supports: false,
  inactive: false,
  statLine: '+9 · 1d8+4',
  raw: { attackMod: 9, damageType: 'slashing' },
  ...over,
});

const skillTile = (over = {}) => ({
  id: over.id || `skill-${over.name}`,
  name: 'Demoralize',
  origin: 'basic',
  cost: 1,
  cat: 'skill',
  traits: [],
  needsTarget: true,
  supports: false,
  inactive: false,
  statLine: 'vs Will',
  raw: { targetDefense: 'will' },
  ...over,
});

const supportTile = (over = {}) => ({
  id: over.id || `support-${over.name}`,
  name: 'Battle Medicine',
  origin: 'custom',
  cost: 1,
  cat: 'skill',
  traits: [],
  needsTarget: false,
  supports: true,
  heals: false,
  inactive: false,
  statLine: 'Medicine',
  raw: {},
  ...over,
});

const healTile = (over = {}) => ({
  id: over.id || `heal-${over.name}`,
  name: 'Elixir of Life',
  origin: 'item',
  kind: 'consumable',
  cost: 1,
  cat: 'item',
  traits: [],
  needsTarget: false,
  supports: true,
  heals: true,
  inactive: false,
  statLine: null,
  raw: {},
  ...over,
});

const FOE = {
  entryId: 'e1',
  kind: 'enemy',
  name: 'Sinspawn',
  defenses: {
    ac: 18,
    saves: { fortitude: 7, reflex: 6, will: 2 },
    weaknesses: [{ type: 'holy', value: 5 }],
  },
  bestiary: { level: 2 },
};

describe('targetIntel', () => {
  it('gates weaknesses and the low save on the reveal record', () => {
    const none = targetIntel(FOE, defaultRecord(), null);
    expect(none.identified).toBe(false);
    expect(none.weaknesses).toEqual([]);
    expect(none.lowSave).toBeNull();

    const full = targetIntel(FOE, fullyRevealedRecord(), null);
    expect(full.identified).toBe(true);
    expect(full.weaknesses).toEqual([{ type: 'holy', value: 5 }]);
    expect(full.lowSave).toEqual({ key: 'will', label: 'Will' });
  });

  it('surfaces a per-type weakness reveal without the full IWR flag', () => {
    const rec = { ...defaultRecord(), weaknessesRevealed: { holy: true } };
    expect(targetIntel(FOE, rec, null).weaknesses).toEqual([{ type: 'holy', value: 5 }]);
  });

  it('matches the exploit only when it targets this foe', () => {
    const exploit = { targetEntryId: 'e1', type: 'mortal', weaknessType: 'holy', value: 4 };
    expect(targetIntel(FOE, defaultRecord(), exploit).exploit).toBe(exploit);
    expect(targetIntel(FOE, defaultRecord(), { ...exploit, targetEntryId: 'other' }).exploit).toBeNull();
  });
});

describe('weaknessMatch', () => {
  it('matches on the strike damageType and on traits', () => {
    const weak = [{ type: 'holy', value: 5 }];
    expect(weaknessMatch(strike({ raw: { damageType: 'holy' } }), weak)).toEqual(weak[0]);
    expect(weaknessMatch(strike({ traits: ['Attack', 'Holy'] }), weak)).toEqual(weak[0]);
    expect(weaknessMatch(strike(), weak)).toBeNull();
  });
});

describe('focusPlays — foe mode', () => {
  const intelFull = targetIntel(FOE, fullyRevealedRecord(), null);

  it('floats a weakness-matching attack to the top with the verdant note + best tag', () => {
    const holyWater = strike({ id: 's-holy', name: 'Holy Water', traits: ['Holy'], raw: { attackMod: 9, damageType: 'vitality' } });
    const plays = focusPlays([strike({ id: 's-sword' }), holyWater], {
      mode: 'foe', actionsLeft: 3, intel: intelFull,
    });
    expect(plays[0].tile.id).toBe('s-holy');
    expect(plays[0].note).toEqual({ text: '▸ hits holy weakness', tone: 'verdant' });
    expect(plays[0].tag).toEqual({ text: 'best', tone: 'verdant' });
    // The plain strike keeps its attack-mod tag.
    expect(plays[1].tag).toEqual({ text: '+9', tone: 'ember' });
  });

  it('cues maneuvers against the revealed lowest save', () => {
    const plays = focusPlays([skillTile()], { mode: 'foe', actionsLeft: 3, intel: intelFull });
    expect(plays[0].note).toEqual({ text: '▸ vs low Will', tone: 'arcane' });
  });

  it('adds the exploit rider to strike sub-lines', () => {
    const intel = targetIntel(FOE, fullyRevealedRecord(), {
      targetEntryId: 'e1', type: 'mortal', weaknessType: 'holy', value: 4,
    });
    const plays = focusPlays([strike()], { mode: 'foe', actionsLeft: 3, intel });
    expect(plays[0].sub).toBe('+9 · 1d8+4 · +holy 4 (exploit)');
  });

  it('renders without annotations when nothing is revealed', () => {
    const intel = targetIntel(FOE, defaultRecord(), null);
    const plays = focusPlays([strike(), skillTile()], { mode: 'foe', actionsLeft: 3, intel });
    expect(plays.every((p) => p.note === null)).toBe(true);
  });

  it('drops unaffordable and inactive tiles', () => {
    const plays = focusPlays(
      [strike({ id: 's-2act', cost: 2 }), strike({ id: 's-stowed', inactive: true })],
      { mode: 'foe', actionsLeft: 1, intel: intelFull }
    );
    expect(plays).toHaveLength(0);
  });
});

describe('focusPlays — ally / self modes', () => {
  it('ally mode surfaces support, gated on reach', () => {
    const tiles = [strike(), supportTile(), healTile()];
    const inReach = focusPlays(tiles, { mode: 'ally', actionsLeft: 3, allyInReach: true });
    expect(inReach.map((p) => p.tile.name)).toEqual(['Elixir of Life', 'Battle Medicine']);
    expect(focusPlays(tiles, { mode: 'ally', actionsLeft: 3, allyInReach: false })).toHaveLength(0);
  });

  it('self mode floats healing to the top with the best tag when hurt', () => {
    const defense = skillTile({ id: 'd-shield', name: 'Raise a Shield', cat: 'defense', needsTarget: false, raw: {} });
    const plays = focusPlays([defense, healTile()], { mode: 'self', actionsLeft: 3, hpRatio: 0.4 });
    expect(plays[0].tile.name).toBe('Elixir of Life');
    expect(plays[0].tag).toEqual({ text: 'best', tone: 'verdant' });
    expect(plays[1].tile.name).toBe('Raise a Shield');
  });

  it('self mode never surfaces target-needing offense', () => {
    const plays = focusPlays([strike(), skillTile()], { mode: 'self', actionsLeft: 3 });
    expect(plays).toHaveLength(0);
  });
});
