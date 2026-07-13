import { describe, it, expect, vi } from 'vitest';
import {
  applyStrikeOnCritSave, applyStrikeOnCritConditions,
  applyStrikeOnHitConditions, applyStrikeOnHitNotes,
} from './strikeOnCrit';

const onCritSave = {
  defense: 'fortitude', dc: 19, label: 'Serpent Dagger',
  conditions: {
    failure: [{ id: 'sickened', value: 1 }],
    criticalFailure: [{ id: 'sickened', value: 1 }],
  },
};
const ability = { name: 'Serpent Dagger', onCritSave };
const character = { id: 'pc', name: 'Rogue' };
const order = [{ entryId: 'g1', name: 'Goblin', kind: 'enemy', defenses: { saves: { fortitude: 8 } } }];

const bag = (results) => ({
  ability,
  character,
  order,
  rayGroups: [{ results }],
  chainResults: null,
  addSaveRequest: vi.fn(),
  appendLog: vi.fn(),
});

describe('applyStrikeOnCritSave (#1439)', () => {
  it('pushes a fixed-DC save request on a critical Strike, with the per-degree conditions', () => {
    const b = bag([{ entryId: 'g1', degree: 'criticalSuccess' }]);
    applyStrikeOnCritSave(b);
    expect(b.addSaveRequest).toHaveBeenCalledTimes(1);
    expect(b.addSaveRequest.mock.calls[0][0]).toMatchObject({
      casterId: 'pc',
      abilityName: 'Serpent Dagger',
      save: 'fortitude',
      dc: 19,
      basic: false,
      targets: [{ entryId: 'g1', name: 'Goblin', saveMod: 8 }],
      conditions: onCritSave.conditions,
    });
    expect(b.appendLog).toHaveBeenCalled();
  });

  it('does nothing on a non-critical hit', () => {
    const b = bag([{ entryId: 'g1', degree: 'success' }]);
    applyStrikeOnCritSave(b);
    expect(b.addSaveRequest).not.toHaveBeenCalled();
  });

  it('no-ops when the strike carries no onCritSave', () => {
    const b = { ...bag([{ entryId: 'g1', degree: 'criticalSuccess' }]), ability: { name: 'Plain Dagger' } };
    applyStrikeOnCritSave(b);
    expect(b.addSaveRequest).not.toHaveBeenCalled();
  });

  it('collects crit results from a strike chain too', () => {
    const b = { ...bag([]), chainResults: { rolls: [[{ entryId: 'g1', degree: 'criticalSuccess' }]] } };
    applyStrikeOnCritSave(b);
    expect(b.addSaveRequest).toHaveBeenCalledTimes(1);
  });

  it('leaves saveMod null when the target has no readable save', () => {
    const b = { ...bag([{ entryId: 'x1', degree: 'criticalSuccess' }]), order: [{ entryId: 'x1', name: 'Wraith', defenses: {} }] };
    applyStrikeOnCritSave(b);
    expect(b.addSaveRequest.mock.calls[0][0].targets[0].saveMod).toBeNull();
  });
});

describe('applyStrikeOnCritConditions (#1439 tail — no-save on-crit)', () => {
  const ability = { name: 'Necrotic Bomb', source: 'Necrotic Bomb', onCritConditions: [{ id: 'sickened', value: 1 }] };
  const order = [{ entryId: 'g1', name: 'Goblin', kind: 'enemy', defenses: {} }];
  const cbag = (results, over = {}) => ({
    ability,
    order,
    rayGroups: [{ results }],
    chainResults: null,
    applyEnemyCondition: vi.fn(),
    appendLog: vi.fn(),
    ...over,
  });

  it('applies the condition (with value) straight to the enemy on a crit', () => {
    const b = cbag([{ entryId: 'g1', degree: 'criticalSuccess' }]);
    applyStrikeOnCritConditions(b);
    expect(b.applyEnemyCondition).toHaveBeenCalledWith('g1', { id: 'sickened', value: 1, source: 'Necrotic Bomb' });
    expect(b.appendLog).toHaveBeenCalled();
  });

  it('does nothing on a non-critical hit', () => {
    const b = cbag([{ entryId: 'g1', degree: 'success' }]);
    applyStrikeOnCritConditions(b);
    expect(b.applyEnemyCondition).not.toHaveBeenCalled();
  });

  it('skips non-enemy targets', () => {
    const b = cbag([{ entryId: 'a1', degree: 'criticalSuccess' }], {
      order: [{ entryId: 'a1', name: 'Ally', kind: 'ally', defenses: {} }],
    });
    applyStrikeOnCritConditions(b);
    expect(b.applyEnemyCondition).not.toHaveBeenCalled();
  });

  it('applies multiple conditions and omits value when absent', () => {
    const b = cbag([{ entryId: 'g1', degree: 'criticalSuccess' }], {
      ability: { name: 'Multi', onCritConditions: [{ id: 'prone' }, { id: 'clumsy', value: 1 }] },
    });
    applyStrikeOnCritConditions(b);
    expect(b.applyEnemyCondition).toHaveBeenCalledWith('g1', { id: 'prone', source: 'Multi' });
    expect(b.applyEnemyCondition).toHaveBeenCalledWith('g1', { id: 'clumsy', value: 1, source: 'Multi' });
  });

  it('no-ops without onCritConditions', () => {
    const b = cbag([{ entryId: 'g1', degree: 'criticalSuccess' }], { ability: { name: 'Plain' } });
    applyStrikeOnCritConditions(b);
    expect(b.applyEnemyCondition).not.toHaveBeenCalled();
  });
});

describe('applyStrikeOnHitConditions (#1439 tail — on-hit)', () => {
  const ability = { name: 'Ghost Charge', source: 'Ghost Charge', onHitConditions: [{ id: 'enfeebled', value: 1 }] };
  const order = [{ entryId: 'g1', name: 'Skeleton', kind: 'enemy', defenses: {} }];
  const hbag = (results, over = {}) => ({
    ability,
    order,
    rayGroups: [{ results }],
    chainResults: null,
    applyEnemyCondition: vi.fn(),
    appendLog: vi.fn(),
    ...over,
  });

  it('applies the condition on a success', () => {
    const b = hbag([{ entryId: 'g1', degree: 'success' }]);
    applyStrikeOnHitConditions(b);
    expect(b.applyEnemyCondition).toHaveBeenCalledWith('g1', { id: 'enfeebled', value: 1, source: 'Ghost Charge' });
  });

  it('also applies on a critical hit (a crit is a hit)', () => {
    const b = hbag([{ entryId: 'g1', degree: 'criticalSuccess' }]);
    applyStrikeOnHitConditions(b);
    expect(b.applyEnemyCondition).toHaveBeenCalledTimes(1);
  });

  it('does nothing on a miss', () => {
    const b = hbag([{ entryId: 'g1', degree: 'failure' }]);
    applyStrikeOnHitConditions(b);
    expect(b.applyEnemyCondition).not.toHaveBeenCalled();
  });

  it('skips non-enemy targets and no-ops without a block', () => {
    const ally = hbag([{ entryId: 'a1', degree: 'success' }], {
      order: [{ entryId: 'a1', name: 'Ally', kind: 'ally', defenses: {} }],
    });
    applyStrikeOnHitConditions(ally);
    expect(ally.applyEnemyCondition).not.toHaveBeenCalled();
    const plain = hbag([{ entryId: 'g1', degree: 'success' }], { ability: { name: 'Plain' } });
    applyStrikeOnHitConditions(plain);
    expect(plain.applyEnemyCondition).not.toHaveBeenCalled();
  });
});

describe('applyStrikeOnHitNotes (#1439 tail — on-hit penalty reminders)', () => {
  const ability = { name: 'Frost Vial', source: 'Frost Vial', onHitNotes: ['−5-foot status penalty to Speeds'] };
  const order = [{ entryId: 'g1', name: 'Ogre', kind: 'enemy', defenses: {} }];
  const nbag = (results, over = {}) => ({
    ability,
    order,
    rayGroups: [{ results }],
    chainResults: null,
    appendLog: vi.fn(),
    ...over,
  });

  it('logs a targeted, source-labelled reminder on a hit', () => {
    const b = nbag([{ entryId: 'g1', degree: 'success' }]);
    applyStrikeOnHitNotes(b);
    expect(b.appendLog).toHaveBeenCalledTimes(1);
    const { text } = b.appendLog.mock.calls[0][0];
    expect(text).toContain('Frost Vial');
    expect(text).toContain('Ogre');
    expect(text).toContain('Speeds');
  });

  it('does nothing on a miss', () => {
    const b = nbag([{ entryId: 'g1', degree: 'failure' }]);
    applyStrikeOnHitNotes(b);
    expect(b.appendLog).not.toHaveBeenCalled();
  });

  it('logs once per target (de-duped), skips non-enemies, no-ops without notes', () => {
    const dup = nbag([{ entryId: 'g1', degree: 'success' }, { entryId: 'g1', degree: 'criticalSuccess' }]);
    applyStrikeOnHitNotes(dup);
    expect(dup.appendLog).toHaveBeenCalledTimes(1);
    const ally = nbag([{ entryId: 'a1', degree: 'success' }], {
      order: [{ entryId: 'a1', name: 'Ally', kind: 'ally', defenses: {} }],
    });
    applyStrikeOnHitNotes(ally);
    expect(ally.appendLog).not.toHaveBeenCalled();
    const none = nbag([{ entryId: 'g1', degree: 'success' }], { ability: { name: 'Plain' } });
    applyStrikeOnHitNotes(none);
    expect(none.appendLog).not.toHaveBeenCalled();
  });
});
