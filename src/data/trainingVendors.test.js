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
} from './trainingVendors';

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
