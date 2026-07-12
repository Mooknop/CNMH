import {
  TRAINING_VENDORS,
  DEFAULT_TRAINING_HOURS,
  trainingVendorById,
  knowsAbility,
  eligibleChoices,
  eligibleOfferings,
  availableTrainingVendors,
  trackOffering,
  trackLabel,
  buildGrant,
  trainingFamilies,
  trainingSummary,
  trainingHoursLabel,
} from './trainingVendors';
import { buildTrainedEntry } from '../utils/applyTraining';
import { resolveCharacterItems } from '../utils/contentUtils';

// ── Data shape (mirrors earnIncomeEmployers.test.js) ─────────────────────────

describe('trainingVendors data', () => {
  it('is a non-empty array', () => {
    expect(Array.isArray(TRAINING_VENDORS)).toBe(true);
    expect(TRAINING_VENDORS.length).toBeGreaterThan(0);
  });

  it('every vendor id is unique', () => {
    const ids = TRAINING_VENDORS.map((v) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every vendor has a name and a non-empty offerings array', () => {
    TRAINING_VENDORS.forEach((v) => {
      expect(typeof v.id).toBe('string');
      expect(v.id.length).toBeGreaterThan(0);
      expect(typeof v.name).toBe('string');
      expect(v.name.length).toBeGreaterThan(0);
      expect(Array.isArray(v.offerings)).toBe(true);
      expect(v.offerings.length).toBeGreaterThan(0);
    });
  });

  it('every offering has valid shapes', () => {
    TRAINING_VENDORS.forEach((v) => {
      const ids = v.offerings.map((o) => o.id);
      expect(new Set(ids).size).toBe(ids.length);
      v.offerings.forEach((o) => {
        expect(typeof o.id).toBe('string');
        expect(typeof o.name).toBe('string');
        expect(o.name.length).toBeGreaterThan(0);
        expect(Number.isInteger(o.hours)).toBe(true);
        expect(o.hours).toBeGreaterThan(0);
        expect(['reaction', 'feat']).toContain(o.kind);
        expect(typeof o.skipIfKnown).toBe('boolean');
        expect(typeof o.summary).toBe('string');
        expect(o.summary.length).toBeGreaterThan(0);
        // Every offering must produce a grant payload for every possible pick
        // — a feat-kind offering with no explicit grant would submit null and
        // dead-end at GM approval (buildGrant only derives reactions).
        const picks = o.choices || [null];
        picks.forEach((c) => expect(buildGrant(o, c)).toBeTruthy());
        if (o.choices !== null) {
          expect(Array.isArray(o.choices)).toBe(true);
          expect(o.choices.length).toBeGreaterThan(0);
          const cids = o.choices.map((c) => c.id);
          expect(new Set(cids).size).toBe(cids.length);
          o.choices.forEach((c) => {
            expect(typeof c.id).toBe('string');
            expect(typeof c.name).toBe('string');
          });
        }
      });
    });
  });

  it('the default track length is one month of 8-hour days', () => {
    expect(DEFAULT_TRAINING_HOURS).toBe(160);
  });

  it('looks up a vendor by id', () => {
    expect(trainingVendorById('sandpoint-garrison')?.name).toBe('Sandpoint Garrison');
    expect(trainingVendorById('nope')).toBeNull();
  });
});

// ── Eligibility ──────────────────────────────────────────────────────────────

describe('knowsAbility', () => {
  it('matches a standalone reaction by name, case-insensitively', () => {
    const c = { reactions: [{ name: 'Shield Block' }] };
    expect(knowsAbility(c, 'shield block')).toBe(true);
    expect(knowsAbility(c, 'Aiding Shield')).toBe(false);
  });

  it('matches a feat by name', () => {
    const c = { feats: [{ name: 'Shield Block' }] };
    expect(knowsAbility(c, 'Shield Block')).toBe(true);
  });

  it('matches an action nested in a feat (stances)', () => {
    const c = { feats: [{ name: 'Dragon Stance', actions: [{ name: 'Dragon Stance' }] }] };
    expect(knowsAbility(c, 'Dragon Stance')).toBe(true);
  });

  it('matches trained[] grants under feat.name / reaction.name / name', () => {
    expect(knowsAbility({ trained: [{ kind: 'reaction', reaction: { name: 'Shield Block' } }] }, 'Shield Block')).toBe(true);
    expect(knowsAbility({ trained: [{ kind: 'feat', feat: { name: 'Tiger Stance' } }] }, 'Tiger Stance')).toBe(true);
    expect(knowsAbility({ trained: [{ name: 'Covering Shield' }] }, 'Covering Shield')).toBe(true);
  });

  it('is false for empty characters and blank names', () => {
    expect(knowsAbility({}, 'Shield Block')).toBe(false);
    expect(knowsAbility({ reactions: [{ name: 'Shield Block' }] }, '')).toBe(false);
  });
});

describe('eligibleOfferings', () => {
  const offering = (over = {}) => ({
    id: 'o1',
    name: 'Shield Block',
    hours: 160,
    kind: 'reaction',
    requiresClass: null,
    skipIfKnown: false,
    requiresAbility: null,
    choices: null,
    summary: 'x',
    ...over,
  });
  const vendor = (offerings) => ({ id: 'v1', name: 'Vendor', offerings });

  it('gates on requiresClass', () => {
    const v = vendor([offering({ requiresClass: 'Monk' })]);
    expect(eligibleOfferings(v, { class: 'Monk' })).toHaveLength(1);
    expect(eligibleOfferings(v, { class: 'monk' })).toHaveLength(1);
    expect(eligibleOfferings(v, { class: 'Bard' })).toHaveLength(0);
  });

  it('hides a skipIfKnown offering the character already has', () => {
    const v = vendor([offering({ skipIfKnown: true })]);
    expect(eligibleOfferings(v, { reactions: [{ name: 'Shield Block' }] })).toHaveLength(0);
    expect(eligibleOfferings(v, { reactions: [] })).toHaveLength(1);
  });

  it('requiresAbility is satisfied innately OR via trained[]', () => {
    const v = vendor([offering({ id: 'o2', name: 'Specialized', requiresAbility: 'Shield Block' })]);
    expect(eligibleOfferings(v, {})).toHaveLength(0);
    expect(eligibleOfferings(v, { feats: [{ name: 'Shield Block' }] })).toHaveLength(1);
    expect(eligibleOfferings(v, { trained: [{ reaction: { name: 'Shield Block' } }] })).toHaveLength(1);
  });

  it('hides a choice offering once every choice is known', () => {
    const choices = [{ id: 'a', name: 'Aiding Shield' }, { id: 'b', name: 'Covering Shield' }];
    const v = vendor([offering({ id: 'o3', name: 'Medium Training', choices })]);
    const knowsOne = { reactions: [{ name: 'Aiding Shield' }] };
    const knowsBoth = { reactions: [{ name: 'Aiding Shield' }, { name: 'Covering Shield' }] };
    expect(eligibleOfferings(v, knowsOne)).toHaveLength(1);
    expect(eligibleChoices(v.offerings[0], knowsOne)).toEqual([{ id: 'b', name: 'Covering Shield' }]);
    expect(eligibleOfferings(v, knowsBoth)).toHaveLength(0);
  });

  it('hides an offering with a track already in progress, but not a completed one', () => {
    const v = vendor([offering()]);
    const inProgress = [{ vendorId: 'v1', offeringId: 'o1', status: 'in-progress' }];
    const done = [{ vendorId: 'v1', offeringId: 'o1', status: 'completed' }];
    expect(eligibleOfferings(v, {}, inProgress)).toHaveLength(0);
    expect(eligibleOfferings(v, {}, done)).toHaveLength(1);
  });
});

describe('availableTrainingVendors', () => {
  const vendors = [
    { id: 'v1', name: 'One', offerings: [{ id: 'o1', name: 'A', hours: 160, kind: 'reaction', requiresClass: null, skipIfKnown: false, requiresAbility: null, choices: null, summary: 'x' }] },
    { id: 'v2', name: 'Two', offerings: [{ id: 'o2', name: 'B', hours: 160, kind: 'feat', requiresClass: 'Monk', skipIfKnown: false, requiresAbility: null, choices: null, summary: 'x' }] },
  ];

  it('only lists supported vendors', () => {
    expect(availableTrainingVendors({}, {}, [], vendors)).toHaveLength(0);
    const out = availableTrainingVendors({}, { v1: { earnedAt: null } }, [], vendors);
    expect(out).toHaveLength(1);
    expect(out[0].vendor.id).toBe('v1');
  });

  it('drops a supported vendor whose offerings are all ineligible', () => {
    const supported = { v2: { earnedAt: null } };
    expect(availableTrainingVendors({ class: 'Bard' }, supported, [], vendors)).toHaveLength(0);
    expect(availableTrainingVendors({ class: 'Monk' }, supported, [], vendors)).toHaveLength(1);
  });
});

describe('buildGrant', () => {
  const offering = {
    id: 'o1', name: 'Shield Block', hours: 160, kind: 'reaction',
    requiresClass: null, skipIfKnown: true, requiresAbility: null, choices: null,
    trigger: 'While raised…', summary: 'Snap your shield in place.',
  };

  it('derives a reaction doc from a choice-less reaction offering', () => {
    expect(buildGrant(offering)).toEqual({
      kind: 'reaction',
      reaction: { name: 'Shield Block', trigger: 'While raised…', description: 'Snap your shield in place.' },
    });
  });

  it("uses the picked choice's own fields, not the offering's", () => {
    const choice = { id: 'a', name: 'Aiding Shield', trigger: 'An ally is hit…', summary: 'Extend your shield.' };
    expect(buildGrant({ ...offering, choices: [choice] }, choice)).toEqual({
      kind: 'reaction',
      reaction: { name: 'Aiding Shield', trigger: 'An ally is hit…', description: 'Extend your shield.' },
    });
  });

  it('falls back to the choice note and omits absent fields', () => {
    const choice = { id: 'a', name: 'Aiding Shield', note: 'medium tier' };
    expect(buildGrant({ ...offering, choices: [choice] }, choice)).toEqual({
      kind: 'reaction',
      reaction: { name: 'Aiding Shield', description: 'medium tier' },
    });
  });

  it('lets an explicit grant win (choice over offering)', () => {
    const featGrant = { kind: 'feat', feat: { name: 'Tiger Stance', actions: [] } };
    expect(buildGrant({ ...offering, kind: 'feat', grant: featGrant })).toBe(featGrant);
    const choiceGrant = { kind: 'feat', feat: { name: 'Crane Stance' } };
    expect(buildGrant({ ...offering, kind: 'feat', grant: featGrant }, { id: 'c', name: 'Crane', grant: choiceGrant }))
      .toBe(choiceGrant);
  });

  it('returns null for a feat-kind offering with no explicit grant', () => {
    expect(buildGrant({ ...offering, kind: 'feat' })).toBeNull();
    expect(buildGrant(null)).toBeNull();
  });
});

describe('trackOffering / trackLabel', () => {
  const vendors = [{
    id: 'v1',
    name: 'One',
    offerings: [{
      id: 'o1', name: 'Medium Training', hours: 160, kind: 'reaction',
      requiresClass: null, skipIfKnown: false, requiresAbility: null,
      choices: [{ id: 'a', name: 'Aiding Shield' }], summary: 'x',
    }],
  }];

  it('resolves the offering from a track', () => {
    expect(trackOffering({ vendorId: 'v1', offeringId: 'o1' }, vendors)?.name).toBe('Medium Training');
    expect(trackOffering({ vendorId: 'v1', offeringId: 'zz' }, vendors)).toBeNull();
  });

  it('labels a track with its picked choice', () => {
    expect(trackLabel({ vendorId: 'v1', offeringId: 'o1', choiceId: 'a' }, vendors))
      .toBe('Medium Training: Aiding Shield');
    expect(trackLabel({ vendorId: 'v1', offeringId: 'o1' }, vendors)).toBe('Medium Training');
  });

  it('falls back to the raw offering id when the definition is gone', () => {
    expect(trackLabel({ vendorId: 'gone', offeringId: 'mystery' }, vendors)).toBe('mystery');
  });
});

// ── Launch catalog (#1191 S3) ────────────────────────────────────────────────

describe('launch catalog', () => {
  const garrison = trainingVendorById('sandpoint-garrison');
  const monastery = trainingVendorById('house-of-blue-stones');

  it('ships both launch vendors', () => {
    expect(garrison).toBeTruthy();
    expect(monastery?.name).toBe('House of Blue Stones');
  });

  it('every requiresAbility names an ability actually taught by some offering', () => {
    // The Specialized tracks gate on Shield Block — which the Garrison itself
    // teaches. A requiresAbility that no offering grants would be unreachable.
    const taught = new Set();
    TRAINING_VENDORS.forEach((v) => v.offerings.forEach((o) => {
      (o.choices || [o]).forEach((pick) => {
        const g = buildGrant(o, o.choices ? pick : null);
        const name = g?.feat?.name || g?.reaction?.name;
        if (name) taught.add(name.toLowerCase());
      });
    }));
    TRAINING_VENDORS.forEach((v) => v.offerings.forEach((o) => {
      if (o.requiresAbility) expect(taught.has(o.requiresAbility.toLowerCase())).toBe(true);
    }));
  });

  it('House of Blue Stones offers Monk-gated stances (not Dragon, which Blu has)', () => {
    monastery.offerings.forEach((o) => {
      expect(o.requiresClass).toBe('Monk');
      expect(o.kind).toBe('feat');
      expect(o.skipIfKnown).toBe(true);
    });
    const names = monastery.offerings.map((o) => o.name);
    expect(names).toContain('Tiger Stance');
    expect(names).not.toContain('Dragon Stance');
  });

  it('a stance grant mirrors the Dragon Stance shape (Stance action + co-located strike)', () => {
    const tiger = monastery.offerings.find((o) => o.name === 'Tiger Stance');
    const g = buildGrant(tiger);
    expect(g.kind).toBe('feat');
    const stanceAction = g.feat.actions.find((a) => a.traits.includes('Stance'));
    expect(stanceAction).toBeTruthy();
    expect(g.feat.strikes[0]).toMatchObject({
      name: 'Tiger Claw', proficiency: 'unarmed', type: 'melee', damage: '1d8', damageType: 'slashing',
    });
  });

  it('the three Specialized tiers require Shield Block and offer their tier reactions', () => {
    const tiers = {
      'specialized-light': ['Disrupting Shield', 'Intercepting Shield', 'Catch and Twist'],
      'specialized-medium': ['Aiding Shield', 'Covering Shield'],
      'specialized-heavy': ['Bulwark Shield', 'Shoving Shield'],
    };
    Object.entries(tiers).forEach(([id, expected]) => {
      const o = garrison.offerings.find((x) => x.id === id);
      expect(o.requiresAbility).toBe('Shield Block');
      expect(o.skipIfKnown).toBe(false); // retrainable for a second reaction
      expect(o.choices.map((c) => c.name)).toEqual(expected);
    });
  });

  it('a Specialized choice grant is a reaction carrying the verbatim trigger + effect', () => {
    const medium = garrison.offerings.find((o) => o.id === 'specialized-medium');
    const aiding = medium.choices.find((c) => c.id === 'aiding-shield');
    const g = buildGrant(medium, aiding);
    expect(g.kind).toBe('reaction');
    expect(g.reaction.name).toBe('Aiding Shield');
    expect(g.reaction.trigger).toContain('attempts a skill check');
    expect(g.reaction.description).toContain('use your shield to create space');
  });

  describe('summary helpers (#1191 S4)', () => {
    it('collapses offerings to distinct family labels in order', () => {
      expect(trainingFamilies(monastery)).toEqual(['Monk stances']);
      expect(trainingFamilies(garrison)).toEqual(['Shield Block', 'Specialized Shield Training']);
    });

    it('joins the families into a trains-summary', () => {
      expect(trainingSummary(monastery)).toBe('Monk stances');
      expect(trainingSummary(garrison)).toBe('Shield Block, Specialized Shield Training');
    });

    it('reports uniform track hours', () => {
      expect(trainingHoursLabel(monastery)).toBe('160h');
      expect(trainingHoursLabel(garrison)).toBe('160h');
      expect(trainingHoursLabel({ offerings: [{ hours: 80 }, { hours: 160 }] })).toBe('80–160h');
      expect(trainingHoursLabel({ offerings: [] })).toBe('');
    });
  });

  // End-to-end through the S2 grant path: buildGrant → trained[] entry →
  // resolveCharacterItems fold, one per kind, over real catalog data.
  describe('resolved-grant smoke (through the S2 merge path)', () => {
    const grantEntry = (vendorId, offeringId, choiceId) => {
      const o = trackOffering({ vendorId, offeringId });
      const choice = choiceId ? o.choices.find((c) => c.id === choiceId) : null;
      return buildTrainedEntry({
        grant: buildGrant(o, choice), vendorId, offeringId, choiceId: choiceId || null,
      });
    };

    it('folds a granted stance into feats as a usable Stance action + strike', () => {
      const entry = grantEntry('house-of-blue-stones', 'wolf-stance');
      const out = resolveCharacterItems({ id: 'blu', feats: [], trained: [entry] }, []);
      const wolf = out.feats.find((f) => f.name === 'Wolf Stance');
      expect(wolf.actions[0].traits).toContain('Stance');
      expect(wolf.strikes[0].name).toBe('Wolf Jaw');
    });

    it('folds a granted Garrison reaction into reactions', () => {
      const entry = grantEntry('sandpoint-garrison', 'shield-block');
      const out = resolveCharacterItems({ id: 'pel', reactions: [], trained: [entry] }, []);
      expect(out.reactions.map((r) => r.name)).toContain('Shield Block');
    });

    it('folds a picked Specialized reaction into reactions', () => {
      const entry = grantEntry('sandpoint-garrison', 'specialized-heavy', 'bulwark-shield');
      const out = resolveCharacterItems({ id: 'pel', reactions: [], trained: [entry] }, []);
      expect(out.reactions.map((r) => r.name)).toContain('Bulwark Shield');
    });
  });
});
