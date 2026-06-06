import {
  costToForm,
  costFromForm,
  strikeToForm,
  strikeFromForm,
  actionToForm,
  actionFromForm,
  blankAction,
  reactionToForm,
  reactionFromForm,
  blankReaction,
  featToForm,
  featFromForm,
  blankFeat,
  familiarToForm,
  familiarFromForm,
  blankFamiliar,
  animalCompanionToForm,
  animalCompanionFromForm,
  blankAnimalCompanion,
  foundryEffectToForm,
  foundryEffectFromForm,
  chainToForm,
  chainFromForm,
} from './AbilitySubforms';
import { sampleCharacters, items } from '../../data';
import { renderActionIcons } from '../../utils/actionIconUtils';

describe('costToForm / costFromForm', () => {
  it('maps a numeric action (item style) to the canonical actionCount', () => {
    expect(costToForm({ action: 2 })).toMatchObject({ mode: '2' });
    expect(costFromForm(costToForm({ action: 2 }))).toEqual({ actionCount: 2 });
  });

  it('maps a numeric actionCount through unchanged', () => {
    expect(costFromForm(costToForm({ actionCount: 3 }))).toEqual({ actionCount: 3 });
  });

  it('parses a string "One to Two" range into Variable', () => {
    const c = costToForm({ actionCount: 'One to Two' });
    expect(c).toMatchObject({ mode: 'V', v1: true, v2: true, v3: false });
    expect(costFromForm(c)).toEqual({
      variableActionCount: { min: 1, max: 2 },
      actionCount: '1 to 2',
    });
  });

  it('reads a variableActionCount object', () => {
    const c = costToForm({ variableActionCount: { min: 1, max: 3 } });
    expect(c).toMatchObject({ mode: 'V', v1: true, v2: true, v3: true });
    expect(costFromForm(c)).toEqual({
      variableActionCount: { min: 1, max: 3 },
      actionCount: '1 to 3',
    });
  });

  it('recognises a reaction from the actions string', () => {
    expect(costToForm({ actions: 'Reaction' })).toMatchObject({ mode: 'R' });
    expect(costFromForm(costToForm({ actions: 'Reaction' }))).toEqual({ actions: 'Reaction' });
  });

  it('recognises "Two Actions" text', () => {
    expect(costFromForm(costToForm({ actions: 'Two Actions' }))).toEqual({ actionCount: 2 });
  });

  it('treats an unrecognised cost as unset (caller preserves it)', () => {
    expect(costToForm({ actions: 'Special' })).toMatchObject({ mode: '' });
    expect(costFromForm({ mode: '' })).toBeNull();
  });
});

describe('strikeToForm / strikeFromForm', () => {
  it('round-trips every managed scalar and preserves unknown keys', () => {
    const src = {
      name: 'Hammer Throw',
      proficiency: 'martial',
      type: 'ranged',
      range: '20ft',
      action: 1,
      damage: '1d6',
      traits: ['Attack', 'Thrown'],
      description: 'Chuck it.',
      attackBonus: 12, // unknown key — must survive
    };
    const out = strikeFromForm(strikeToForm(src));
    expect(out).toEqual({
      name: 'Hammer Throw',
      proficiency: 'martial',
      type: 'ranged',
      range: '20ft',
      damage: '1d6',
      traits: ['Attack', 'Thrown'],
      description: 'Chuck it.',
      attackBonus: 12,
      actionCount: 1, // canonical (was `action: 1`)
    });
  });

  it('preserves an exotic, unmodelled cost verbatim', () => {
    const out = strikeFromForm(strikeToForm({ name: 'X', actions: 'Special' }));
    expect(out).toEqual({ name: 'X', actions: 'Special' });
  });

  it('keeps a variable action cost renderable', () => {
    const out = strikeFromForm(strikeToForm({ name: 'Blast', actionCount: 'One to Two' }));
    expect(out.variableActionCount).toEqual({ min: 1, max: 2 });
  });
});

// The canonical cost re-emit changes the stored key but must NOT change what a
// player sees. Compare the consumer-rendered action descriptor (StrikesList /
// ActionCardList both resolve via this same precedence) plus every non-cost
// field, for every real bundled strike.
const COST_KEYS = ['action', 'actionCount', 'variableActionCount', 'actions'];
const stripCost = (o) => {
  const r = { ...o };
  COST_KEYS.forEach((k) => delete r[k]);
  return r;
};
const actionText = (s) => {
  if (s.actions) return s.actions;
  if (s.variableActionCount) {
    const { min, max } = s.variableActionCount;
    return `${min} to ${max} Actions`;
  }
  const n = s.actionCount || s.action || 1;
  return `${n} Action${n !== 1 ? 's' : ''}`;
};

describe('bundled strike resolve-parity (Slice 1 gate)', () => {
  const bundledStrikeLists = [];
  sampleCharacters.forEach((c) => {
    if (Array.isArray(c.strikes) && c.strikes.length) {
      bundledStrikeLists.push([`character ${c.id}`, c.strikes]);
    }
  });
  items.forEach((it) => {
    if (it.strikes) {
      bundledStrikeLists.push([
        `item ${it.id}`,
        Array.isArray(it.strikes) ? it.strikes : [it.strikes],
      ]);
    }
  });

  it('covers real bundled strikes', () => {
    expect(bundledStrikeLists.length).toBeGreaterThan(0);
  });

  it.each(bundledStrikeLists)('%s round-trips losslessly for the player', (_label, strikes) => {
    strikes.forEach((src) => {
      const out = strikeFromForm(strikeToForm(src));
      expect(stripCost(out)).toEqual(stripCost(src));
      expect(renderActionIcons(actionText(out))).toEqual(renderActionIcons(actionText(src)));
    });
  });
});

describe('actionToForm / reactionToForm round-trip', () => {
  it('preserves a real action including its unmodelled `degrees` block', () => {
    const src = {
      name: 'Exploit Vulnerability',
      actionCount: 1,
      traits: ['Esoterica', 'Manipulate', 'Thaumaturge'],
      description: 'Scour your esoterica…',
      degrees: { Success: 'You recall.', Failure: 'You forget.' },
    };
    const out = actionFromForm(actionToForm(src));
    expect(out).toEqual(src);
  });

  it('preserves a real reaction (trigger + traits + description, no cost)', () => {
    const src = {
      name: 'Retributive Strike',
      traits: ['Champion'],
      trigger: 'An enemy damages an ally within 15 feet of you.',
      description: 'You protect your ally and strike your foe.',
    };
    const out = reactionFromForm(reactionToForm(src));
    expect(out).toEqual(src); // mode '' → no cost emitted, matches source
  });

  it('blankAction has no cost; blankReaction defaults to Reaction', () => {
    expect(actionFromForm(blankAction())).toEqual({});
    expect(reactionFromForm(blankReaction())).toEqual({ actions: 'Reaction' });
  });

  it('preserves requirements/frequency and an unrecognised cost', () => {
    const src = {
      name: 'Exotic Maneuver',
      actions: 'Special',
      requirements: 'You are adjacent.',
      frequency: 'once per day',
      traits: ['Manipulate'],
    };
    const out = actionFromForm(actionToForm(src));
    expect(out).toEqual(src);
  });
});

describe('action targetDefense round-trip', () => {
  it('round-trips targetDefense: ac through the form', () => {
    const src = { name: 'Strike', actionCount: 1, targetDefense: 'ac' };
    expect(actionFromForm(actionToForm(src))).toEqual(src);
  });

  it('round-trips targetDefense: fortitude through the form', () => {
    const src = { name: 'Grapple', actionCount: 1, targetDefense: 'fortitude' };
    expect(actionFromForm(actionToForm(src))).toEqual(src);
  });

  it('round-trips targetDefense: reflex through the form', () => {
    const src = { name: 'Trip', actionCount: 1, targetDefense: 'reflex' };
    expect(actionFromForm(actionToForm(src))).toEqual(src);
  });

  it('round-trips targetDefense: will through the form', () => {
    const src = { name: 'Demoralize', actionCount: 1, targetDefense: 'will' };
    expect(actionFromForm(actionToForm(src))).toEqual(src);
  });

  it('omits targetDefense when not set', () => {
    const src = { name: 'Ready', actionCount: 2 };
    const out = actionFromForm(actionToForm(src));
    expect(out.targetDefense).toBeUndefined();
  });

  it('does not double-write targetDefense through the rest blob', () => {
    const src = { name: 'Grapple', actionCount: 1, targetDefense: 'fortitude' };
    const form = actionToForm(src);
    expect(form.rest.targetDefense).toBeUndefined();
  });
});

describe('foundryEffectToForm / foundryEffectFromForm', () => {
  it('round-trips a set foundryEffect with explicit applyTo', () => {
    const src = { ref: 'Compendium.pf2e.spell-effects.Item.abc123', applyTo: 'all-allies' };
    expect(foundryEffectFromForm(foundryEffectToForm(src))).toEqual(src);
  });

  it('defaults applyTo to self when not supplied', () => {
    const src = { ref: 'Compendium.pf2e.spell-effects.Item.abc123' };
    const out = foundryEffectFromForm(foundryEffectToForm(src));
    expect(out).toEqual({ ref: 'Compendium.pf2e.spell-effects.Item.abc123', applyTo: 'self' });
  });

  it('returns null when ref is empty', () => {
    expect(foundryEffectFromForm(foundryEffectToForm(null))).toBeNull();
    expect(foundryEffectFromForm(foundryEffectToForm({ ref: '' }))).toBeNull();
    expect(foundryEffectFromForm({ ref: '   ' })).toBeNull();
  });

  it('round-trips through an action — set', () => {
    const src = {
      name: 'Courageous Anthem',
      actionCount: 1,
      foundryEffect: { ref: 'Compendium.pf2e.spell-effects.Item.xyz', applyTo: 'all-allies' },
    };
    expect(actionFromForm(actionToForm(src))).toEqual(src);
  });

  it('round-trips through an action — unset (no foundryEffect key emitted)', () => {
    const src = { name: 'Stride', actionCount: 1 };
    const out = actionFromForm(actionToForm(src));
    expect(out).toEqual(src);
    expect(out.foundryEffect).toBeUndefined();
  });

  it('does not double-write foundryEffect through the rest blob', () => {
    const src = { name: 'Anthem', foundryEffect: { ref: 'Compendium.pf2e.x.Item.1' } };
    const form = actionToForm(src);
    expect(form.rest.foundryEffect).toBeUndefined();
  });
});

describe('action with structured effects round-trip', () => {
  it('round-trips effects and preserves other unmodelled keys', () => {
    const src = {
      name: 'Runic Strike',
      actionCount: 2,
      description: 'Strike with runes.',
      degrees: { Success: 'Apply effect.' },
      effects: [
        { effectId: 'heroism-1', applyTo: 'target', duration: { until: 'rounds', rounds: 3 } },
        { effectId: 'bless',     applyTo: 'all-allies', duration: { until: 'caster-turn-end' } },
      ],
    };
    const out = actionFromForm(actionToForm(src));
    expect(out).toEqual(src);
  });

  it('an action without effects still round-trips with no effects key emitted', () => {
    const src = { name: 'Stride', actionCount: 1, description: 'Move.' };
    const out = actionFromForm(actionToForm(src));
    expect(out).toEqual(src);
    expect(out.effects).toBeUndefined();
  });
});

describe('bundled action/reaction resolve-parity (Slice 2 gate)', () => {
  const bundledActionLists = [];
  const bundledReactionLists = [];
  sampleCharacters.forEach((c) => {
    if (Array.isArray(c.actions) && c.actions.length) {
      bundledActionLists.push([`character ${c.id} actions`, c.actions]);
    }
    if (Array.isArray(c.reactions) && c.reactions.length) {
      bundledReactionLists.push([`character ${c.id} reactions`, c.reactions]);
    }
  });

  it('covers real bundled abilities', () => {
    expect(bundledActionLists.length + bundledReactionLists.length).toBeGreaterThan(0);
  });

  it.each(bundledActionLists)('%s round-trips losslessly', (_label, actions) => {
    actions.forEach((src) => {
      const out = actionFromForm(actionToForm(src));
      expect(stripCost(out)).toEqual(stripCost(src));
      expect(renderActionIcons(actionText(out))).toEqual(renderActionIcons(actionText(src)));
    });
  });

  it.each(bundledReactionLists)('%s round-trips losslessly', (_label, reactions) => {
    reactions.forEach((src) => {
      const out = reactionFromForm(reactionToForm(src));
      // Reactions in bundled data have no cost key; mode '' emits nothing,
      // so the comparison includes every field as-is.
      expect(out).toEqual(src);
    });
  });
});

describe('featToForm / featFromForm', () => {
  it('round-trips a simple feat (no nested arrays)', () => {
    const src = {
      id: 'feat-1',
      name: 'Ranger Dedication',
      level: 2,
      source: 'Archetype',
      description: 'Hunt prey.',
    };
    expect(featFromForm(featToForm(src))).toEqual(src);
  });

  it('preserves nested actions/strikes/freeActions/innate through the JSON box', () => {
    const src = {
      id: 'feat-42',
      name: 'Kineticist Dedication',
      level: 2,
      source: 'Archetype',
      description: 'Channel elements.',
      actions: [
        { name: 'Channel Elements', actionCount: 1, traits: ['Aura', 'Kineticist'], description: '…' },
      ],
      strikes: [{ name: 'Elemental Blast', proficiency: 'martial', damage: '1d8' }],
      freeActions: [{ name: 'Toggle Aura' }],
    };
    expect(featFromForm(featToForm(src))).toEqual(src);
  });

  it('blankFeat saves only the name once one is typed', () => {
    const f = blankFeat();
    f.str.name = 'Toughness';
    expect(featFromForm(f)).toEqual({ name: 'Toughness' });
  });

  it('rejects invalid JSON / non-object nested body', () => {
    const f = blankFeat();
    f.str.name = 'X';
    f.restJson = '{ broken';
    expect(() => featFromForm(f)).toThrow(/invalid JSON/i);
    f.restJson = '[1,2,3]';
    expect(() => featFromForm(f)).toThrow(/must be a JSON object/i);
  });
});

describe('bundled feat resolve-parity (Slice 3 gate)', () => {
  const bundledFeatLists = [];
  sampleCharacters.forEach((c) => {
    if (Array.isArray(c.feats) && c.feats.length) {
      bundledFeatLists.push([`character ${c.id} feats`, c.feats]);
    }
  });

  it('covers real bundled feats', () => {
    expect(bundledFeatLists.length).toBeGreaterThan(0);
  });

  it.each(bundledFeatLists)('%s round-trips losslessly', (_label, feats) => {
    feats.forEach((src) => {
      const out = featFromForm(featToForm(src));
      expect(out).toEqual(src);
    });
  });
});

describe('familiarToForm / familiarFromForm', () => {
  it('round-trips a simple familiar with no abilities', () => {
    const src = { name: 'Sprout', type: 'Sprite', ac: 14, hp: 10, speed: '25 feet' };
    expect(familiarFromForm(familiarToForm(src))).toEqual(src);
  });

  it('preserves abilities (name + description) and unknown keys via the JSON box', () => {
    const src = {
      name: 'Lazarus',
      type: 'Squox',
      size: 'Tiny',
      traits: ['Familiar'],
      ac: 20,
      hp: 20,
      speed: '25 feet',
      skills: ['Stealth', 'Acrobatics'],
      communication: 'Empathic link',
      description: 'A squirrel-fox.',
      abilities: [
        { name: 'Manual Dexterity', description: 'Hands.' },
        { name: 'Threat Display', description: 'Snarls.' },
      ],
      legacyTag: 'unknown', // round-trips through restJson
    };
    expect(familiarFromForm(familiarToForm(src))).toEqual(src);
  });

  it('blankFamiliar saves only the typed name', () => {
    const f = blankFamiliar();
    f.str.name = 'Tiny Toad';
    expect(familiarFromForm(f)).toEqual({ name: 'Tiny Toad' });
  });

  it('rejects invalid JSON / non-object nested body', () => {
    const f = blankFamiliar();
    f.restJson = '{ broken';
    expect(() => familiarFromForm(f)).toThrow(/invalid JSON/i);
    f.restJson = '[1,2]';
    expect(() => familiarFromForm(f)).toThrow(/must be a JSON object/i);
  });

  it('round-trips image id and imagePosition', () => {
    const src = { name: 'Sprout', type: 'Sprite', ac: 14, hp: 10, image: 'img_familiar.jpg', imagePosition: { x: 30, y: 70 } };
    expect(familiarFromForm(familiarToForm(src))).toEqual(src);
  });
});

describe('bundled familiar resolve-parity (Slice 4a gate)', () => {
  const bundledFamiliars = [];
  sampleCharacters.forEach((c) => {
    if (c.familiar && typeof c.familiar === 'object') {
      bundledFamiliars.push([`character ${c.id} familiar`, c.familiar]);
    }
  });

  it('covers real bundled familiars', () => {
    expect(bundledFamiliars.length).toBeGreaterThan(0);
  });

  it.each(bundledFamiliars)('%s round-trips losslessly', (_label, fam) => {
    expect(familiarFromForm(familiarToForm(fam))).toEqual(fam);
  });
});

describe('animalCompanionToForm / animalCompanionFromForm', () => {
  it('round-trips a minimal AC (name only)', () => {
    expect(animalCompanionFromForm(animalCompanionToForm({ name: 'Rex' }))).toEqual({ name: 'Rex' });
  });

  it('preserves ability/save blocks, numeric speed, and unknown keys', () => {
    const src = {
      name: 'Zevira',
      type: 'Young Shadow Hound',
      size: 'Small',
      ac: 19,
      hp: 32,
      speed: 30,
      senses: 'Darkvision',
      abilities: {
        strength: 14, dexterity: 16, constitution: 13,
        intelligence: 2, wisdom: 12, charisma: 12,
      },
      saves: { fortitude: 7, reflex: 9, will: 7 },
      skills: ['Acrobatics'],
      strikes: [{ name: 'Bite', damage: '1d8' }],
      support: 'Shrouds your foes.',
    };
    expect(animalCompanionFromForm(animalCompanionToForm(src))).toEqual(src);
  });

  it('preserves a string speed verbatim', () => {
    const src = { name: 'Wolf', speed: '40 feet' };
    expect(animalCompanionFromForm(animalCompanionToForm(src))).toEqual(src);
  });

  it('blankAnimalCompanion saves only the typed name', () => {
    const f = blankAnimalCompanion();
    f.str.name = 'Spot';
    expect(animalCompanionFromForm(f)).toEqual({ name: 'Spot' });
  });

  it('rejects invalid JSON / non-object nested body', () => {
    const f = blankAnimalCompanion();
    f.restJson = '{ broken';
    expect(() => animalCompanionFromForm(f)).toThrow(/invalid JSON/i);
    f.restJson = '[1,2]';
    expect(() => animalCompanionFromForm(f)).toThrow(/must be a JSON object/i);
  });

  it('round-trips image id and imagePosition', () => {
    const src = { name: 'Rex', type: 'Dog', image: 'img_companion.jpg', imagePosition: { x: 20, y: 40 } };
    expect(animalCompanionFromForm(animalCompanionToForm(src))).toEqual(src);
  });
});

describe('bundled animal companion resolve-parity (Slice 4b gate)', () => {
  const bundledACs = [];
  sampleCharacters.forEach((c) => {
    if (c.animalCompanion && typeof c.animalCompanion === 'object') {
      bundledACs.push([`character ${c.id} animalCompanion`, c.animalCompanion]);
    }
  });

  it('covers real bundled animal companions', () => {
    expect(bundledACs.length).toBeGreaterThan(0);
  });

  it.each(bundledACs)('%s round-trips losslessly', (_label, ac) => {
    expect(animalCompanionFromForm(animalCompanionToForm(ac))).toEqual(ac);
  });
});

describe('chainToForm / chainFromForm', () => {
  it('round-trips a strike chain with all fields', () => {
    const src = { into: 'strike', cost: 'included', modes: ['strike', 'flurry'], strikeTrait: 'Unarmed', attackBonus: 1, damageBonus: '1d6' };
    expect(chainFromForm(chainToForm(src))).toEqual(src);
  });

  it('round-trips a spell chain', () => {
    const src = { into: 'spell', cost: 'added', spellFilter: 'has-range', modifier: 'Range +30 ft' };
    expect(chainFromForm(chainToForm(src))).toEqual(src);
  });

  it('returns null when into is empty', () => {
    expect(chainFromForm(chainToForm(null))).toBeNull();
    expect(chainFromForm(chainToForm({ into: '' }))).toBeNull();
    expect(chainFromForm(null)).toBeNull();
  });

  it('defaults cost to included when not set', () => {
    const out = chainFromForm(chainToForm({ into: 'strike' }));
    expect(out.cost).toBe('included');
  });

  it('omits optional strike fields when blank', () => {
    const out = chainFromForm(chainToForm({ into: 'strike', cost: 'included' }));
    expect(out.strikeTrait).toBeUndefined();
    expect(out.attackBonus).toBeUndefined();
    expect(out.damageBonus).toBeUndefined();
    expect(out.modes).toBeUndefined();
  });

  it('round-trips through an action — set', () => {
    const src = { name: 'Inner Upheaval', actionCount: 1, chain: { into: 'strike', cost: 'included', modes: ['strike'], attackBonus: 1 } };
    expect(actionFromForm(actionToForm(src))).toEqual(src);
  });

  it('round-trips through an action — unset (no chain key emitted)', () => {
    const src = { name: 'Stride', actionCount: 1 };
    const out = actionFromForm(actionToForm(src));
    expect(out).toEqual(src);
    expect(out.chain).toBeUndefined();
  });

  it('does not double-write chain through the rest blob', () => {
    const src = { name: 'Reach Spell', actionCount: 1, chain: { into: 'spell', cost: 'added' } };
    const form = actionToForm(src);
    expect(form.rest.chain).toBeUndefined();
  });
});
