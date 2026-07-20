// Content-integrity gate for ability-authored per-degree save conditions (#987).
//
// `saveConditions` is a { [degree]: [{ id, value?, note?, scopedToCaster? }] }
// map that buildTargetSaveRequest forwards to the save request, and that
// RequestedSaves applies to the enemy-conditions rail. Unlike the damageData
// rider ladder (which computeSaveDamage gates to success/failure/criticalFailure)
// this path is a plain degree lookup, so it also reaches criticalSuccess.
//
// Any condition id that isn't a real PF2e condition must be backed by an effect
// doc, because EnemyConditionBadge renders
//   getCondition(id)?.name || effectCatalog.find(e => e.id === id)?.name || id
// — without one it would render the bare slug.
import { spells, effects } from './index';
import { getCondition } from './pf2eConditions';

const DEGREES = ['criticalSuccess', 'success', 'failure', 'criticalFailure'];
const effectIds = new Set(effects.map((e) => e.id));
const withLadder = spells.filter((s) => s.saveConditions);

describe('save-condition ladders (#987)', () => {
  it('every authored ladder is well-formed and uses only real degree keys', () => {
    expect(withLadder.length).toBeGreaterThan(0);
    for (const s of withLadder) {
      for (const [degree, list] of Object.entries(s.saveConditions)) {
        expect(DEGREES).toContain(degree);
        expect(Array.isArray(list)).toBe(true);
        for (const c of list) {
          expect(typeof c.id).toBe('string');
          expect(c.id.length).toBeGreaterThan(0);
          if (c.value != null) expect(typeof c.value).toBe('number');
        }
      }
    }
  });

  it('every condition id resolves to a real condition or a backing effect doc', () => {
    const unresolved = [];
    for (const s of withLadder) {
      for (const list of Object.values(s.saveConditions)) {
        for (const c of list) {
          if (!getCondition(c.id) && !effectIds.has(c.id)) unresolved.push(`${s.id}:${c.id}`);
        }
      }
    }
    expect(unresolved).toEqual([]);
  });

  it('Crushing Stampede ladders off-guard on a failure and prone on a critical failure', () => {
    const sc = spells.find((s) => s.id === 'crushing-stampede').saveConditions;
    expect(sc.failure.map((c) => c.id)).toEqual(['off-guard']);
    // The crit-failure text is standalone ("double damage and is knocked prone"),
    // so it does NOT inherit the failure degree's off-guard.
    expect(sc.criticalFailure.map((c) => c.id)).toEqual(['prone']);
    expect(sc).not.toHaveProperty('criticalSuccess');
  });

  it('Steal the Show ladders off-guard + the stupefied 2/4 split, and spotlights a crit success', () => {
    const sc = spells.find((s) => s.id === 'steal-the-show').saveConditions;
    const ids = (d) => sc[d].map((c) => c.id);
    // Crit success is the whole point of using this path over damageData riders.
    expect(ids('criticalSuccess')).toEqual(['steal-the-show-spotlight']);
    expect(ids('success')).toEqual(['off-guard']);
    // "stupefied 2 on a failure; instead stupefied 4 on a crit failure"
    expect(sc.failure.find((c) => c.id === 'stupefied').value).toBe(2);
    expect(sc.criticalFailure.find((c) => c.id === 'stupefied').value).toBe(4);
    // Off-guard rides every failed degree, never the crit success.
    for (const d of ['success', 'failure', 'criticalFailure']) {
      expect(ids(d)).toContain('off-guard');
    }
    expect(ids('criticalSuccess')).not.toContain('off-guard');
  });
});
