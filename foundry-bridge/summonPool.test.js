// Summon pool module tests (#261) — folder actors → summonpool push, refresh
// command, and the actor/folder hooks that trigger a re-push. Exercises
// getSummonFolderActors through the module against mocked Foundry globals.

import { initSummonPool, pushSummonPool, handleSummonPoolReq } from './summonPool.js';
import { installFoundryGlobals, makeActor } from './test/foundryMock.js';

let send;

function setup({ actors = [], folder = 'Summons' } = {}) {
  installFoundryGlobals({ gameOpts: { actors, settings: { summonFolder: folder } } });
  send = jest.fn();
  initSummonPool(send);
}

const summonActor = (opts) => makeActor({ folderName: 'Summons', ...opts });

describe('summon pool push', () => {
  test('emits global/summonpool with folder actors mapped to the pool shape', () => {
    const zombie = summonActor({ id: 'a-zombie', name: 'Zombie Shambler', level: 1, hp: { max: 24 } });
    zombie.system.attributes.ac = { value: 12 };
    const outsider = makeActor({ id: 'a-other', name: 'Town Guard', folderName: 'NPCs' });
    setup({ actors: [zombie, outsider] });

    pushSummonPool();

    expect(send).toHaveBeenCalledTimes(1);
    const [characterId, key, pool] = send.mock.calls[0];
    expect(characterId).toBe('global');
    expect(key).toBe('summonpool');
    // Only the Summons-folder actor is offered.
    expect(pool).toHaveLength(1);
    expect(pool[0]).toMatchObject({ key: 'a-zombie', name: 'Zombie Shambler', level: 1, hp: { max: 24 } });
    expect(pool[0].defenses.ac).toBe(12);
  });

  test('re-pushes when an actor or folder changes', () => {
    setup({ actors: [summonActor({ id: 'a1', name: 'Skeleton' })] });
    ['createActor', 'updateActor', 'deleteActor', 'updateFolder'].forEach((hook) =>
      global.Hooks.fire(hook, {})
    );
    expect(send).toHaveBeenCalledTimes(4);
    send.mock.calls.forEach(([characterId, key]) => {
      expect(characterId).toBe('global');
      expect(key).toBe('summonpool');
    });
  });

  test('handleSummonPoolReq pushes on demand (empty folder → [])', () => {
    setup({ actors: [] });
    handleSummonPoolReq();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][2]).toEqual([]);
  });

  test('reads the configured folder name', () => {
    setup({
      actors: [makeActor({ id: 'a-x', name: 'Wolf', folderName: 'Critters' })],
      folder: 'Critters',
    });
    pushSummonPool();
    expect(send.mock.calls[0][2].map((p) => p.name)).toEqual(['Wolf']);
  });
});
