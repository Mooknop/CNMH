// positions tests (#528): payload shape and push-on-hook behaviour.
//
// Positions are keyed by combatant id and derived from each combatant's token
// grid cell (token.x/y ÷ gridSize). Tests control geometry via makeToken x/y.

import { initPositions, pushPositions, getLatestPositions } from './positions.js';
import { makeCombat, makeCombatant, makeToken } from './test/foundryMock.js';

let send;

beforeEach(() => {
  global.canvas.tokens.placeables = [];
});

function setup(tokens = []) {
  send = jest.fn();
  const combatants = tokens.map(({ entryId, token }) => {
    global.canvas.tokens.placeables.push(token);
    return makeCombatant({ id: entryId, actorId: `actor-${entryId}`, tokenId: token.id });
  });
  global.game.combat = combatants.length ? makeCombat({ combatants }) : null;
  initPositions(send);
}

describe('pushPositions', () => {
  it('emits empty positions when there is no combat', () => {
    send = jest.fn();
    global.game.combat = null;
    initPositions(send);
    pushPositions();
    expect(send).toHaveBeenCalledWith('global', 'positions', { gridSize: 0, positions: {} });
  });

  it('maps each combatant id to its grid cell and includes the grid size', () => {
    // gridSize defaults to 100 in the mock game; x/y are pixels.
    setup([
      { entryId: 'cbt-ashka',  token: makeToken({ id: 'tok-ashka',  x: 300, y: 100 }) },
      { entryId: 'cbt-goblin', token: makeToken({ id: 'tok-goblin', x: 800, y: 100 }) },
    ]);

    pushPositions();

    const [[, , payload]] = send.mock.calls;
    expect(payload.gridSize).toBe(100);
    expect(payload.positions).toEqual({
      'cbt-ashka':  { col: 3, row: 1 },
      'cbt-goblin': { col: 8, row: 1 },
    });
    // getLatestPositions mirrors the last push.
    expect(getLatestPositions()).toEqual(payload);
  });

  it('re-broadcasts when a token moves (updateToken hook)', () => {
    setup([{ entryId: 'cbt-ashka', token: makeToken({ id: 'tok-ashka', x: 0, y: 0 }) }]);

    global.Hooks.fire('updateToken');

    expect(send).toHaveBeenCalledWith('global', 'positions', expect.objectContaining({
      positions: { 'cbt-ashka': { col: 0, row: 0 } },
    }));
  });

  it('re-broadcasts on combat lifecycle hooks', () => {
    setup([{ entryId: 'cbt-ashka', token: makeToken({ id: 'tok-ashka', x: 200, y: 200 }) }]);

    global.Hooks.fire('createCombat');
    global.Hooks.fire('updateCombat');

    expect(send).toHaveBeenCalledWith('global', 'positions', expect.objectContaining({
      positions: { 'cbt-ashka': { col: 2, row: 2 } },
    }));
  });
});
