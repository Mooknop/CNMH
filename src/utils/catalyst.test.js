import { describe, it, expect } from 'vitest';
import {
  catalystMeta,
  isCatalyst,
  catalystTargetSpell,
  catalystTargetTrait,
  catalystAddActions,
  catalystSummary,
  catalystMatchesSpell,
  eligibleCatalystsFor,
  sumCatalystActions,
} from './catalyst';
import { items, spells } from '../data';

const blueSalt = () => items.find((i) => i.id === 'blue-salt-crystal');
const phoenix = () => items.find((i) => i.id === 'phoenix-tail-feather');

describe('catalyst spine', () => {
  it('reads the catalyst block + traits', () => {
    expect(isCatalyst(blueSalt())).toBe(true);
    expect(isCatalyst({ traits: ['Catalyst'] })).toBe(true);
    expect(isCatalyst({ name: 'Potion', traits: ['Consumable'] })).toBe(false);
    expect(catalystMeta({ catalyst: {} })).toBeNull(); // no catalystFor
  });

  it('exposes target spell + added actions', () => {
    expect(catalystTargetSpell(blueSalt())).toBe('drown');
    expect(catalystAddActions(blueSalt())).toBe(0);
    expect(catalystTargetSpell(phoenix())).toBe('blazing-dive');
    expect(catalystAddActions(phoenix())).toBe(1);
  });

  it('summary falls back to the description', () => {
    expect(catalystSummary(blueSalt())).toMatch(/persistent acid/);
    expect(catalystSummary({ name: 'x', description: 'desc' })).toBe('desc');
  });

  describe('eligibleCatalystsFor', () => {
    const inv = [
      blueSalt(),
      phoenix(),
      { name: 'Sword', traits: ['Weapon'] },
    ];

    it('matches held catalysts to the spell being cast', () => {
      expect(eligibleCatalystsFor(inv, 'drown', {}).map((c) => c.id)).toEqual(['blue-salt-crystal']);
      expect(eligibleCatalystsFor(inv, 'blazing-dive', {}).map((c) => c.id)).toEqual(['phoenix-tail-feather']);
      expect(eligibleCatalystsFor(inv, 'fireball', {})).toEqual([]);
      expect(eligibleCatalystsFor(inv, null, {})).toEqual([]);
    });

    it('excludes a fully-consumed catalyst', () => {
      expect(eligibleCatalystsFor(inv, 'drown', { 'Blue Salt Crystal': 1 })).toEqual([]);
    });

    it('finds catalysts stowed in containers', () => {
      const bag = [{ name: 'Backpack', container: { contents: [blueSalt()] } }];
      expect(eligibleCatalystsFor(bag, 'drown', {}).map((c) => c.id)).toEqual(['blue-salt-crystal']);
    });
  });

  it('sumCatalystActions totals added actions', () => {
    expect(sumCatalystActions([blueSalt(), phoenix()])).toBe(1);
    expect(sumCatalystActions([])).toBe(0);
  });

  describe('trait-form catalysts (#1254 W2)', () => {
    const traitCat = {
      id: 'deathless-light-fixture', name: 'Deathless Light', quantity: 1,
      traits: ['Uncommon', 'Catalyst', 'Consumable', 'Magical'],
      catalyst: { catalystForTrait: 'Light', effect: 'counteract boost' },
    };
    const lightSpell = { id: 'light', traits: ['Cantrip', 'Concentrate', 'Light', 'Manipulate'] };
    const fireSpell = { id: 'fireball', traits: ['Concentrate', 'Fire', 'Manipulate'] };

    it('reads the trait-form block', () => {
      expect(catalystMeta(traitCat)).toBeTruthy();
      expect(isCatalyst(traitCat)).toBe(true);
      expect(catalystTargetTrait(traitCat)).toBe('Light');
      expect(catalystTargetSpell(traitCat)).toBeNull();
      expect(catalystTargetTrait(blueSalt())).toBeNull();
    });

    it('matches any spell carrying the trait, case-insensitively', () => {
      expect(catalystMatchesSpell(traitCat, lightSpell)).toBe(true);
      expect(catalystMatchesSpell(traitCat, { id: 'x', traits: ['light'] })).toBe(true);
      expect(catalystMatchesSpell(traitCat, fireSpell)).toBe(false);
      // an id string can never satisfy a trait-form catalyst
      expect(catalystMatchesSpell(traitCat, 'light')).toBe(false);
    });

    it('is eligible for a light-trait cast alongside id-targeted catalysts', () => {
      const inv = [traitCat, blueSalt()];
      expect(eligibleCatalystsFor(inv, lightSpell, {}).map((c) => c.id))
        .toEqual(['deathless-light-fixture']);
      expect(eligibleCatalystsFor(inv, fireSpell, {})).toEqual([]);
      // spell-object form still matches catalystFor catalysts by id
      expect(eligibleCatalystsFor(inv, { id: 'drown', traits: [] }, {}).map((c) => c.id))
        .toEqual(['blue-salt-crystal']);
      // consumed overlay still applies
      expect(eligibleCatalystsFor([traitCat], lightSpell, { 'Deathless Light': 1 })).toEqual([]);
    });
  });

  describe('seed content', () => {
    it('every catalyst targets a real catalog spell or trait (catches typos)', () => {
      const spellIds = new Set(spells.map((s) => s.id));
      const catalysts = items.filter(isCatalyst);
      expect(catalysts.length).toBeGreaterThanOrEqual(30);
      catalysts.forEach((c) => {
        const trait = catalystTargetTrait(c);
        if (trait) {
          // trait-form (#1254): the targeted trait must exist on ≥1 catalog spell
          const want = String(trait).toLowerCase();
          const hit = spells.some((s) =>
            (s.traits || []).some((t) => String(t).toLowerCase() === want));
          expect(hit, `${c.id} targets trait "${trait}"`).toBe(true);
          // the two targeting forms are mutually exclusive
          expect(catalystTargetSpell(c), c.id).toBeNull();
        } else {
          expect(spellIds.has(catalystTargetSpell(c)), c.id).toBe(true);
        }
      });
    });

    it('imports the official catalyst set (M3b) verbatim, no 3rd-party tag', () => {
      const official = ['thunderbird-tuft-lesser', 'demon-bone-tiles-pusk', 'healers-gel-lesser', 'noxious-incense', 'dragon-eye'];
      official.forEach((id) => {
        const c = items.find((i) => i.id === id);
        expect(c, id).toBeTruthy();
        expect(isCatalyst(c)).toBe(true);
        // official items carry Catalyst but never the 3rd-party pack tag
        expect(c.traits).not.toContain('3rd Party');
      });
      // sample rider shape: Thunderbird Tuft (Lesser) → Shocking Grasp, +1 action
      const tuft = items.find((i) => i.id === 'thunderbird-tuft-lesser');
      expect(catalystTargetSpell(tuft)).toBe('shocking-grasp');
      expect(catalystAddActions(tuft)).toBe(1);
    });

    it('imports the acid/flora/fire catalyst groups (W1-A) with their target spells', () => {
      const ids = [
        'necrotic-cap-lesser', 'necrotic-cap-moderate', 'necrotic-cap-greater', 'necrotic-cap-major',
        'feral-linguist', 'feral-linguist-greater', 'wolliped-fleece', 'vultures-wing',
        'bougainvillea-blossom-lesser', 'bougainvillea-blossom-moderate',
        'bougainvillea-blossom-greater', 'bougainvillea-blossom-major', 'wemmuth-trinket',
        'firestarter-pellets', 'firestarter-pellets-greater', 'firestarter-pellets-major',
      ];
      ids.forEach((id) => {
        const c = items.find((i) => i.id === id);
        expect(c, id).toBeTruthy();
        expect(isCatalyst(c)).toBe(true);
        expect(c.traits).not.toContain('3rd Party');
      });
      // spot-check a rider: Firestarter Pellets (Greater) → Fireball, +1 action
      const pellets = items.find((i) => i.id === 'firestarter-pellets-greater');
      expect(catalystTargetSpell(pellets)).toBe('fireball');
      expect(catalystAddActions(pellets)).toBe(1);
      // the newly imported target spells resolve
      ['acid-grip', 'chilling-spray', 'enfeeble', 'entangling-flora', 'fireball'].forEach((id) => {
        expect(spells.find((s) => s.id === id), id).toBeTruthy();
      });
    });

    it('imports Deathless Light as a trait-form catalyst (#1254 W2)', () => {
      const dl = items.find((i) => i.id === 'deathless-light');
      expect(dl).toBeTruthy();
      expect(isCatalyst(dl)).toBe(true);
      expect(catalystTargetTrait(dl)).toBe('Light');
      expect(catalystTargetSpell(dl)).toBeNull();
      expect(catalystAddActions(dl)).toBe(1); // Activate: 1 envision
      expect(dl.level).toBe(10);
      expect(dl.price).toBe(165);
      expect(dl.traits).toEqual(['Uncommon', 'Catalyst', 'Consumable', 'Magical']);
      expect(dl.traits).not.toContain('3rd Party');
      // the targeted trait must be castable: >=1 light-trait spell in the catalog
      expect(spells.some((s) => (s.traits || []).includes('Light'))).toBe(true);
    });

    it('imports blazing dive alongside the Phoenix Tail Feather', () => {
      const bd = spells.find((s) => s.id === 'blazing-dive');
      expect(bd).toBeTruthy();
      expect(bd.level).toBe(3);
      expect(bd.traits).toEqual(expect.arrayContaining(['Fire']));
    });

    it('imports the blood/walls catalyst groups (W1-D) with their target spells', () => {
      const ids = [
        'dazzling-rosary', 'dazzling-rosary-greater', 'alicorn-hair', 'amphisbaena-spittle',
        'black-ash', 'black-ash-greater', 'black-ash-major', 'dimensional-knot',
        'force-tiles', 'skyfisher-vapors', 'unsullied-blood-lesser', 'unsullied-blood-moderate',
        'unsullied-blood-greater', 'unsullied-blood-major',
      ];
      ids.forEach((id) => {
        const c = items.find((i) => i.id === id);
        expect(c, id).toBeTruthy();
        expect(isCatalyst(c), id).toBe(true);
        expect(c.traits, id).not.toContain('3rd Party');
      });
      // newly imported target spells resolve
      ['toxic-cloud', 'translocate', 'vampiric-feast', 'wall-of-force', 'wall-of-thorns'].forEach((id) => {
        expect(spells.find((s) => s.id === id), id).toBeTruthy();
      });
      // Dazzling Rosary points at the remastered spell id carried by our seed
      expect(catalystTargetSpell(items.find((i) => i.id === 'dazzling-rosary'))).toBe('spiritual-armament');
      // Unsullied Blood activates with a one-action envision → +1 action on the cast
      expect(catalystAddActions(items.find((i) => i.id === 'unsullied-blood-lesser'))).toBe(1);
      // Cast-a-Spell activation adds nothing
      expect(catalystAddActions(items.find((i) => i.id === 'force-tiles'))).toBe(0);
    });

    it('imports the resilience/devotion catalysts with their target spells (#1254 W1-C)', () => {
      const ids = [
        'dragon-scute-lesser', 'dragon-scute-moderate', 'dragon-scute-greater',
        'wood-rotted-root-lesser', 'wood-rotted-root-moderate',
        'wood-rotted-root-greater', 'wood-rotted-root-major',
        'chaos-falcon-feather', 'shimmering-dust', 'bottled-screams',
        'steadfast-sentinel', 'soothing-scents', 'ogre-spider-filament', 'kushtaka-relic',
      ];
      ids.forEach((id) => {
        const c = items.find((i) => i.id === id);
        expect(c, id).toBeTruthy();
        expect(isCatalyst(c)).toBe(true);
        expect(c.traits).not.toContain('3rd Party');
      });
      const spellIds = new Set(spells.map((s) => s.id));
      ['mountain-resilience', 'oaken-resilience', 'resist-energy', 'revealing-light',
        'seal-fate', 'shadow-spy', 'soothe', 'spider-sting', 'spirit-blast',
      ].forEach((id) => expect(spellIds.has(id), id).toBe(true));
      // sample rider shape: Bottled Screams → Seal Fate, +1 action (its own ◆ envision activation);
      // Kushtaka Relic → Spirit Blast, +1 action ("Cast a Spell (add one action)")
      expect(catalystTargetSpell(items.find((i) => i.id === 'bottled-screams'))).toBe('seal-fate');
      expect(catalystAddActions(items.find((i) => i.id === 'bottled-screams'))).toBe(1);
      expect(catalystAddActions(items.find((i) => i.id === 'kushtaka-relic'))).toBe(1);
    });

    it('imports the fire shield / mist / terror catalysts and their target spells (#1254 W1-B)', () => {
      const ids = [
        'witchwarg-fur', 'nevercold', 'nevercold-compressed', 'nevercold-refined',
        'hippogriff-feather', 'void-salts', 'grave-token', 'broken-rams-thorn',
        'silvered-marp-fur', 'defiled-costa', 'defiled-costa-greater',
        'irritating-seedpod-lesser', 'gravemist-taper', 'irritating-seedpod',
        'irritating-seedpod-greater', 'irritating-seedpod-major',
      ];
      ids.forEach((id) => {
        const c = items.find((i) => i.id === id);
        expect(c, id).toBeTruthy();
        expect(isCatalyst(c), id).toBe(true);
        expect(c.traits).not.toContain('3rd Party');
      });
      // spot-check a rider shape: Witchwarg Fur → Fire Shield, no extra action
      expect(catalystTargetSpell(items.find((i) => i.id === 'witchwarg-fur'))).toBe('fire-shield');
      expect(catalystAddActions(items.find((i) => i.id === 'witchwarg-fur'))).toBe(0);
      // …and one that does cost the extra action
      expect(catalystAddActions(items.find((i) => i.id === 'irritating-seedpod-major'))).toBe(1);
      // every target spell landed in the spell catalog
      ['fire-shield', 'ghostly-carrier', 'grim-tendrils', 'harm',
        'howling-blizzard', 'impaling-spike', 'mask-of-terror', 'mist'].forEach((id) => {
        expect(spells.find((s) => s.id === id), id).toBeTruthy();
      });
    });
  });
});
