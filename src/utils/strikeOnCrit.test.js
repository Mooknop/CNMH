import { describe, it, expect, vi } from 'vitest';
import { applyStrikeOnCritSave } from './strikeOnCrit';

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
