// Pure preview derivation for the confirm sheet — rendering + wiring are
// covered by SegmentedDeck.test.jsx; this suite pins the derived readout.
import { describe, it, expect } from 'vitest';
import { buildPreview, verbFor } from './ConfirmSheet';
import { buildActionCatalog } from './buildActionCatalog';
import { fullyRevealedRecord } from '../../../utils/recallKnowledge';

const tileNamed = (tiles, name) => tiles.find((t) => t.name === name);

describe('verbFor', () => {
  it('derives the contextual confirm verb', () => {
    const tiles = buildActionCatalog({
      strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4' }],
      actions: [
        { name: 'Dragon Stance', actionCount: 1, traits: ['Stance'] },
        { name: 'Battle Medicine', actionCount: 1, traits: [], highlightSkill: 'medicine' },
      ],
      reactions: [{ name: 'Shield Block', traits: [] }],
      inventory: [
        { name: 'Healing Potion', state: 'held1', traits: ['Potion'], consumable: { kind: 'healing' } },
        {
          uid: 'cc-1', name: 'Crescent Cross', state: 'held1',
          strikes: [{ name: 'Bolt', type: 'ranged', capacity: 3, reload: 1, ammoType: 'bolt', traits: ['Capacity 3'] }],
        },
      ],
    });
    expect(verbFor(tileNamed(tiles, 'Longsword'))).toBe('Roll attack');
    expect(verbFor(tileNamed(tiles, 'Dragon Stance'))).toBe('Enter stance');
    expect(verbFor(tileNamed(tiles, 'Battle Medicine'))).toBe('Roll Medicine');
    expect(verbFor(tileNamed(tiles, 'Shield Block'))).toBe('Ready');
    expect(verbFor(tileNamed(tiles, 'Healing Potion'))).toBe('Drink');
    expect(verbFor(tileNamed(tiles, 'Reload Crescent Cross'))).toBe('Reload');
    expect(verbFor(tileNamed(tiles, 'Stride'))).toBe('Stride'); // controller: 'move'
  });
});

describe('buildPreview', () => {
  const strikeTile = () => tileNamed(
    buildActionCatalog({
      strikes: [{ name: 'Longsword', type: 'melee', actionCount: 1, attackMod: 9, damage: '1d8+4', damageType: 'slashing' }],
    }),
    'Longsword'
  );
  const goblin = {
    entryId: 'e1', kind: 'enemy', name: 'Goblin',
    defenses: { ac: 18, saves: { fortitude: 9, reflex: 5, will: 7 } },
  };

  it('nets the bonus of MAP and shows the chip only when the penalty is nonzero', () => {
    const fresh = buildPreview(strikeTile(), { focusEnemy: goblin, attacksMade: 0 });
    expect(fresh.bonus).toBe('+9');
    expect(fresh.mapChip).toBeNull();

    const second = buildPreview(strikeTile(), { focusEnemy: goblin, attacksMade: 1 });
    expect(second.bonus).toBe('+4');
    expect(second.mapChip).toBe('MAP −5');

    // Clamped at the third attack and beyond.
    const fourth = buildPreview(strikeTile(), { focusEnemy: goblin, attacksMade: 3 });
    expect(fourth.bonus).toBe('-1');
    expect(fourth.mapChip).toBe('MAP −10');
  });

  it('softens MAP for agile weapons', () => {
    const [tile] = buildActionCatalog({
      strikes: [{ name: 'Fist', type: 'melee', actionCount: 1, attackMod: 7, damage: '1d4+2', traits: ['Agile', 'Unarmed'] }],
    });
    const p = buildPreview(tile, { attacksMade: 2 });
    expect(p.mapChip).toBe('MAP −8');
    expect(p.bonus).toBe('-1'); // 7 − 8
  });

  it('shows the AC value only when the foe is focused and the field is revealed', () => {
    const hidden = buildPreview(strikeTile(), { focusEnemy: goblin, rec: null });
    expect(hidden.vsLabel).toBe('vs AC');

    const revealed = buildPreview(strikeTile(), { focusEnemy: goblin, rec: fullyRevealedRecord() });
    expect(revealed.vsLabel).toBe('vs AC 18');
  });

  it('labels maneuvers against their target defense', () => {
    const trip = tileNamed(buildActionCatalog({}), 'Trip');
    const p = buildPreview(trip, { focusEnemy: goblin, rec: fullyRevealedRecord() });
    expect(p.vsLabel).toBe('vs Ref 15'); // 10 + reflex 5
    expect(p.mapChip).toBeNull(); // no attacks yet
  });

  it('uses the fixed DC line for a save-forcing consumable', () => {
    const tile = tileNamed(
      buildActionCatalog({
        inventory: [{
          name: 'Devil’s Breath Incense', state: 'held1',
          consumable: { kind: 'save', save: { defense: 'fortitude', dc: 19 } },
        }],
      }),
      'Devil’s Breath Incense'
    );
    const p = buildPreview(tile, {});
    expect(p.vsLabel).toBe('DC 19 · Fortitude save');
  });

  it('targets the focused foe for target-needing tiles, the ally for support tiles', () => {
    const strike = buildPreview(strikeTile(), { focusEnemy: goblin });
    expect(strike.targetName).toBe('Goblin');

    const potion = tileNamed(
      buildActionCatalog({
        inventory: [{ name: 'Healing Potion', state: 'worn', traits: ['Potion'], consumable: { kind: 'healing' } }],
      }),
      'Healing Potion'
    );
    const p = buildPreview(potion, { focusAlly: { entryId: 'a1', kind: 'pc', name: 'Ashka' } });
    expect(p.targetName).toBe('Ashka');
    // The draw surcharge surfaces in the effect text.
    expect(p.effect).toMatch(/Worn — costs \+1 action to draw/);
  });

  it('passes damage + type through and omits roll data for utility actions', () => {
    const p = buildPreview(strikeTile(), {});
    expect(p.damage).toBe('1d8+4');
    expect(p.damageType).toBe('slashing');

    const stand = tileNamed(buildActionCatalog({}), 'Stand');
    const u = buildPreview(stand, {});
    expect(u.bonus).toBeNull();
    expect(u.vsLabel).toBeNull();
    expect(u.damage).toBeNull();
    expect(u.effect).toBeTruthy(); // its description
  });
});
