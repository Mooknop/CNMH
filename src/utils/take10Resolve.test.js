import { resolveTake10 } from './take10Resolve';

const OPENED = 500;

// Minimal getState backed by a plain map keyed `${id}:${key}`.
const makeGetState = (map) => (id, key) => map[`${id}:${key}`];

describe('resolveTake10', () => {
  it('restores all Focus Points when a player Refocused', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 2,
    };
    const sendUpdate = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog: vi.fn(),
    });
    expect(sendUpdate).toHaveBeenCalledWith('a', 'focus', 0);
  });

  it('does not write focus when none was spent', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 0,
    };
    const sendUpdate = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog: vi.fn(),
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('does not touch focus for non-Refocus activities', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'treat-wounds', label: 'Treat Wounds', minutes: 10 }] },
      'a:focus': 3,
    };
    const sendUpdate = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog: vi.fn(),
    });
    expect(sendUpdate).not.toHaveBeenCalled();
  });

  it('logs a per-player summary with total minutes', () => {
    const map = {
      'a:take10alloc': {
        beatAt: OPENED, ready: true,
        activities: [
          { id: 'refocus', label: 'Refocus', minutes: 10 },
          { id: 'treat-wounds', label: 'Treat Wounds', minutes: 10 },
        ],
      },
      'a:focus': 1,
    };
    const appendLog = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate: vi.fn(),
      appendLog,
    });
    expect(appendLog).toHaveBeenCalledWith({
      type: 'activity',
      text: 'Ari (20 min): Refocus, Treat Wounds',
    });
  });

  it('skips a stale-beat allocation', () => {
    const map = {
      'a:take10alloc': { beatAt: 1, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 2,
    };
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog,
    });
    expect(sendUpdate).not.toHaveBeenCalled();
    expect(appendLog).not.toHaveBeenCalled();
  });

  it('skips players with no allocation and resolves each member independently', () => {
    const map = {
      'a:take10alloc': { beatAt: OPENED, ready: true, activities: [{ id: 'refocus', label: 'Refocus', minutes: 10 }] },
      'a:focus': 2,
      // b has no alloc
    };
    const sendUpdate = vi.fn();
    const appendLog = vi.fn();
    resolveTake10({
      characters: [{ id: 'a', name: 'Ari' }, { id: 'b', name: 'Bex' }],
      openedAt: OPENED,
      getState: makeGetState(map),
      sendUpdate,
      appendLog,
    });
    expect(sendUpdate).toHaveBeenCalledTimes(1);
    expect(appendLog).toHaveBeenCalledTimes(1);
  });
});
