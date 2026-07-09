// First behavioral tests for actionUtils (#1319) — the extractors the action
// dial / command sheet / reaction bar use to assemble a character's actions,
// reactions, and free actions from character docs, inventory items, etched
// property runes, accessory runes, and feats. Input shapes mirror the resolved
// character objects consumers pass (CharacterContext output).
import { getActions, getReactions, getFreeActions, deriveSpellshapeChain } from './actionUtils';

describe('deriveSpellshapeChain', () => {
  it('gives a Spellshape-trait action a chained-cast into spell, carrying the description as modifier', () => {
    const action = { name: 'Widen Spell', traits: ['Concentrate', 'Spellshape'], description: 'The spell’s area grows.' };
    expect(deriveSpellshapeChain(action)).toEqual({
      ...action,
      chain: { into: 'spell', modifier: 'The spell’s area grows.' },
    });
  });

  it('matches the trait case-insensitively and defaults a missing description to null', () => {
    const derived = deriveSpellshapeChain({ name: 'X', traits: ['SPELLSHAPE'] });
    expect(derived.chain).toEqual({ into: 'spell', modifier: null });
  });

  it('never overrides an authored chain, and leaves non-spellshape actions untouched', () => {
    const authored = { name: 'X', traits: ['Spellshape'], chain: { into: 'spell', filter: { damageType: 'fire' } } };
    expect(deriveSpellshapeChain(authored)).toBe(authored);
    const plain = { name: 'Stride', traits: ['Move'] };
    expect(deriveSpellshapeChain(plain)).toBe(plain);
    expect(deriveSpellshapeChain(null)).toBeNull();
  });
});

describe('getActions', () => {
  it('returns [] when the character has no actions anywhere — the basics (Stride/Step/Strike) are merged by buildActionCatalog, never injected here', () => {
    expect(getActions({})).toEqual([]);
  });

  it('resolves action-text counts, including variable "One to Three Actions" ranges', () => {
    const [fixed, variable, untouched] = getActions({
      actions: [
        { name: 'Sweep', actions: 'Two Actions' },
        { name: 'Heal-alike', actions: 'One to Three Actions' },
        { name: 'Pre-normalized', actionCount: 1 },
      ],
    });
    expect(fixed.actionCount).toBe(2);
    expect(variable).toMatchObject({ actionCount: 1, variableActionCount: { min: 1, max: 3 } });
    expect(untouched).toEqual({ name: 'Pre-normalized', actionCount: 1 });
  });

  it('sources inventory actions from the item and gates active on the held/noHandRequired rule', () => {
    const actions = getActions({
      inventory: [
        { name: 'Wand', state: 'held1', actions: [{ name: 'Zap' }] },
        { name: 'Stowed Rod', state: 'dropped', actions: [{ name: 'Wave' }] },
        { name: 'Boots', state: 'worn', noHandRequired: true, actions: [{ name: 'Kick Off' }] },
      ],
    });
    expect(actions).toEqual([
      expect.objectContaining({ name: 'Zap', source: 'Wand', active: true }),
      expect.objectContaining({ name: 'Wave', source: 'Stowed Rod', active: false }),
      expect.objectContaining({ name: 'Kick Off', source: 'Boots', active: true }),
    ]);
  });

  it('derives the spellshape chain on item actions (scepters flow through the chained-cast UI)', () => {
    const [tweak] = getActions({
      inventory: [{
        name: 'Scepter of Widening',
        state: 'held1',
        actions: [{ name: 'Widen', traits: ['Spellshape'], description: 'Wider.' }],
      }],
    });
    expect(tweak.chain).toEqual({ into: 'spell', modifier: 'Wider.' });
  });

  it('surfaces etched property-rune actions sourced "Item (Rune)", active while the host is equipped', () => {
    const rune = { name: 'Swallow-Spike', actions: [{ name: 'Grow Spikes', actions: 'One Action' }] };
    const [equipped] = getActions({
      inventory: [{ name: 'Full Plate', runes: { property: [rune] } }], // no state → worn default
    });
    expect(equipped).toMatchObject({
      name: 'Grow Spikes', actionCount: 1, source: 'Full Plate (Swallow-Spike)', active: true,
    });

    const [dropped] = getActions({
      inventory: [{ name: 'Full Plate', state: 'dropped', runes: { property: [rune] } }],
    });
    expect(dropped.active).toBe(false);
  });

  it('sources feat actions from the feat', () => {
    const actions = getActions({
      feats: [{ name: 'Sudden Charge', actions: [{ name: 'Sudden Charge', actions: 'Two Actions' }] }],
    });
    expect(actions).toEqual([
      expect.objectContaining({ name: 'Sudden Charge', actionCount: 2, source: 'Sudden Charge' }),
    ]);
  });

  it('surfaces accessory-rune actions sourced "Item (Rune)", normalized and gated on the host being equipped', () => {
    const accessory = { name: 'Test Rune', actions: [{ name: 'Rune Action', actions: 'Two Actions' }] };
    const [worn] = getActions({
      inventory: [{ name: 'Gloves', runes: { accessory } }], // no state → worn default
    });
    expect(worn).toMatchObject({
      name: 'Rune Action', actionCount: 2, source: 'Gloves (Test Rune)', active: true,
    });

    const [dropped] = getActions({
      inventory: [{ name: 'Gloves', state: 'dropped', runes: { accessory } }],
    });
    expect(dropped.active).toBe(false);
  });
});

describe('getReactions', () => {
  it('combines character, item (with active gate), and feat reactions with sources', () => {
    const reactions = getReactions({
      reactions: [{ name: 'Attack of Opportunity' }],
      inventory: [{ name: 'Buckler', state: 'worn', reactions: [{ name: 'Deflect' }] }],
      feats: [{ name: 'Shield Warden', reactions: [{ name: 'Guard Ally' }] }],
    });
    expect(reactions).toEqual([
      { name: 'Attack of Opportunity' },
      { name: 'Deflect', source: 'Buckler', active: false }, // worn, not held
      { name: 'Guard Ally', source: 'Shield Warden' },
    ]);
  });

  it('returns [] for a character with nothing', () => {
    expect(getReactions({})).toEqual([]);
  });

  it('surfaces property-rune reactions and ignores malformed rune entries', () => {
    const reactions = getReactions({
      inventory: [{
        name: 'Full Plate',
        runes: {
          property: [
            'unresolved-ref-string',
            { name: 'No Abilities Rune' },
            { name: 'Swallow-Spike', reactions: [{ name: 'Grow Spikes' }] },
          ],
        },
      }],
    });
    expect(reactions).toEqual([
      { name: 'Grow Spikes', source: 'Full Plate (Swallow-Spike)', active: true },
    ]);
  });

  it('surfaces accessory-rune reactions, inactive when the host is dropped', () => {
    const accessory = { name: 'Soft-Landing', reactions: [{ name: 'Soft Landing', trigger: 'You begin to fall' }] };
    const [worn] = getReactions({ inventory: [{ name: 'Boots', runes: { accessory } }] });
    expect(worn).toMatchObject({ name: 'Soft Landing', source: 'Boots (Soft-Landing)', active: true });

    const [dropped] = getReactions({
      inventory: [{ name: 'Boots', state: 'dropped', runes: { accessory } }],
    });
    expect(dropped.active).toBe(false);
  });
});

describe('getFreeActions', () => {
  it('combines character, item (with active gate), and feat free actions with sources', () => {
    const freeActions = getFreeActions({
      freeActions: [{ name: 'Rage' }],
      inventory: [{ name: 'Bandolier', state: 'worn', freeActions: [{ name: 'Quick Draw Vial' }] }],
      feats: [{ name: 'Quick Alchemy', freeActions: [{ name: 'Quick Alchemy' }] }],
    });
    expect(freeActions).toEqual([
      { name: 'Rage' },
      { name: 'Quick Draw Vial', source: 'Bandolier', active: false },
      { name: 'Quick Alchemy', source: 'Quick Alchemy' },
    ]);
  });

  it('injects the etch-time dragonType into an accessory-rune free action’s chain', () => {
    const accessory = {
      name: "Dragon's Breath",
      freeActions: [{ name: 'Widen Spellshape', chain: { into: 'spell' } }],
    };
    const [fa] = getFreeActions({
      inventory: [{ name: 'Gloves', runes: { accessory, accessoryConfig: { dragonType: 'fire' } } }],
    });
    expect(fa).toMatchObject({
      name: 'Widen Spellshape',
      source: "Gloves (Dragon's Breath)",
      active: true,
      chain: { into: 'spell', dragonType: 'fire' },
    });
  });

  it('leaves the chain untouched without a dragonType config, and adds none where none was authored', () => {
    const accessory = {
      name: "Dragon's Breath",
      freeActions: [
        { name: 'Widen Spellshape', chain: { into: 'spell' } },
        { name: 'Chainless' },
      ],
    };
    const [withChain, chainless] = getFreeActions({
      inventory: [{ name: 'Gloves', runes: { accessory } }],
    });
    expect(withChain.chain).toEqual({ into: 'spell' });
    expect(chainless.chain).toBeUndefined();
  });

  it('ignores an unresolved (string) accessory rune ref', () => {
    expect(getFreeActions({
      inventory: [{ name: 'Gloves', runes: { accessory: 'dragons-breath' } }],
    })).toEqual([]);
  });
});
