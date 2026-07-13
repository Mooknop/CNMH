// Unit tests for the animation rail's bridge half (#1415, epic #1414).
//
// fxplay is app → bridge (consumed, never emitted), so there is no relay
// fixture here — the emission contract is recorded from the app side when the
// emitter lands (A2, #1416). These tests drive handleFxPlay against the mock
// world with a chainable fake Sequence and assert what would play.

import { handleFxPlay, _resetSequencerWarning } from './animations.js';
import { makeActor, makeToken, makeCombat, makeCombatant } from './test/foundryMock.js';

// Chainable Sequencer stand-in: records every builder call; play() marks the
// sequence finished. One instance per `new Sequence()`.
class FakeSequence {
  constructor() {
    this.calls = [];
    this.played = false;
    FakeSequence.instances.push(this);
  }

  _record(name, args) {
    this.calls.push([name, ...args]);
    return this;
  }

  effect(...a) { return this._record('effect', a); }
  file(...a) { return this._record('file', a); }
  atLocation(...a) { return this._record('atLocation', a); }
  rotateTowards(...a) { return this._record('rotateTowards', a); }
  stretchTo(...a) { return this._record('stretchTo', a); }
  scaleToObject(...a) { return this._record('scaleToObject', a); }
  scale(...a) { return this._record('scale', a); }
  tint(...a) { return this._record('tint', a); }

  play() {
    this.played = true;
    return Promise.resolve();
  }
}
FakeSequence.instances = [];

// One call's arguments from a recorded sequence, or undefined.
const callArgs = (seq, name) => seq.calls.find(([n]) => n === name)?.slice(1);

// Encounter world: attacker PC + goblin, both resolvable by combatant entryId.
function encounterWorld() {
  const pc = makeActor({ id: 'actor-pellias', name: 'Pellias' });
  const gob = makeActor({ id: 'actor-gob', name: 'Goblin Warrior' });
  const tokPc = makeToken({ id: 'tok-pellias', actor: pc });
  const tokGob = makeToken({ id: 'tok-gob', actor: gob });
  global.game.combat = makeCombat({
    combatants: [
      makeCombatant({ id: 'cbt-pellias', actorId: 'actor-pellias', tokenId: 'tok-pellias' }),
      makeCombatant({ id: 'cbt-gob', actorId: 'actor-gob', tokenId: 'tok-gob' }),
    ],
  });
  global.canvas.tokens.placeables = [tokPc, tokGob];
  return { tokPc, tokGob };
}

const meleeEvent = (over = {}) => ({
  id: 'fx-1',
  shape: 'melee',
  file: 'jb2a.melee_generic.slashing.one_handed',
  source: 'cbt-pellias',
  targets: ['cbt-gob'],
  ts: 1,
  ...over,
});

beforeEach(() => {
  FakeSequence.instances = [];
  global.Sequence = FakeSequence;
  _resetSequencerWarning();
});

afterEach(() => {
  delete global.Sequence;
});

describe('handleFxPlay', () => {
  test('melee: swing plays on the target, rotated towards the attacker', async () => {
    const { tokPc, tokGob } = encounterWorld();
    await handleFxPlay(meleeEvent());

    expect(FakeSequence.instances).toHaveLength(1);
    const seq = FakeSequence.instances[0];
    expect(seq.played).toBe(true);
    expect(callArgs(seq, 'file')).toEqual(['jb2a.melee_generic.slashing.one_handed']);
    expect(callArgs(seq, 'atLocation')).toEqual([tokGob]);
    expect(callArgs(seq, 'rotateTowards')).toEqual([tokPc]);
    expect(callArgs(seq, 'scaleToObject')).toEqual([2]);
  });

  test('projectile: stretches from the attacker to the target', async () => {
    const { tokPc, tokGob } = encounterWorld();
    await handleFxPlay(meleeEvent({ shape: 'projectile', file: 'jb2a.some.projectile' }));

    const seq = FakeSequence.instances[0];
    expect(seq.played).toBe(true);
    expect(callArgs(seq, 'atLocation')).toEqual([tokPc]);
    expect(callArgs(seq, 'stretchTo')).toEqual([tokGob]);
  });

  test('projectile accepts a raw {x,y} point target', async () => {
    encounterWorld();
    await handleFxPlay(meleeEvent({ shape: 'projectile', targets: [{ x: 300, y: 450 }] }));

    const seq = FakeSequence.instances[0];
    expect(seq.played).toBe(true);
    expect(callArgs(seq, 'stretchTo')).toEqual([{ x: 300, y: 450 }]);
  });

  test('one sequence per target; unresolved entryIds are skipped', async () => {
    const { tokGob } = encounterWorld();
    await handleFxPlay(meleeEvent({ targets: ['cbt-gob', 'cbt-missing', { x: 1, y: 2 }] }));

    expect(FakeSequence.instances).toHaveLength(2);
    expect(callArgs(FakeSequence.instances[0], 'atLocation')).toEqual([tokGob]);
    expect(callArgs(FakeSequence.instances[1], 'atLocation')).toEqual([{ x: 1, y: 2 }]);
  });

  test('opts.scale and opts.tint pass through', async () => {
    encounterWorld();
    await handleFxPlay(meleeEvent({ opts: { scale: 3.5, tint: '#ffd700' } }));

    const seq = FakeSequence.instances[0];
    expect(callArgs(seq, 'scaleToObject')).toEqual([3.5]);
    expect(callArgs(seq, 'tint')).toEqual(['#ffd700']);
  });

  test('unknown shape and missing file are silent no-ops', async () => {
    encounterWorld();
    await handleFxPlay(meleeEvent({ shape: 'confetti' }));
    await handleFxPlay(meleeEvent({ file: '' }));
    await handleFxPlay(null);

    expect(FakeSequence.instances).toHaveLength(0);
  });

  test('unresolved source token is a silent no-op', async () => {
    encounterWorld();
    await handleFxPlay(meleeEvent({ source: 'cbt-missing' }));

    expect(FakeSequence.instances).toHaveLength(0);
  });

  test('Sequencer absent: warns once across events, never throws', async () => {
    delete global.Sequence;
    encounterWorld();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});

    await handleFxPlay(meleeEvent());
    await handleFxPlay(meleeEvent({ id: 'fx-2' }));

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/Sequencer module not active/);
    warn.mockRestore();
  });

  test('a play() rejection is caught and later targets still play', async () => {
    const { tokPc } = encounterWorld();
    const err = jest.spyOn(console, 'error').mockImplementation(() => {});
    let first = true;
    FakeSequence.prototype.playOk = FakeSequence.prototype.play;
    FakeSequence.prototype.play = function play() {
      this.played = true;
      if (first) { first = false; return Promise.reject(new Error('boom')); }
      return Promise.resolve();
    };
    try {
      await handleFxPlay(meleeEvent({ shape: 'projectile', targets: [{ x: 1, y: 2 }, { x: 3, y: 4 }] }));
      expect(FakeSequence.instances).toHaveLength(2);
      expect(FakeSequence.instances[1].played).toBe(true);
      expect(callArgs(FakeSequence.instances[1], 'atLocation')).toEqual([tokPc]);
      expect(err).toHaveBeenCalledTimes(1);
    } finally {
      FakeSequence.prototype.play = FakeSequence.prototype.playOk;
      delete FakeSequence.prototype.playOk;
      err.mockRestore();
    }
  });
});
