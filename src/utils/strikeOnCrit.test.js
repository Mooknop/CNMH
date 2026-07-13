import { describe, it, expect, vi } from 'vitest';
import { applyStrikeOnCritSave, applyStrikeOnCritConditions } from './strikeOnCrit';

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
