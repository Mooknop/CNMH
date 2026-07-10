import React from 'react';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { useFxChannel, useFxBloom, FX_BUFFER_CAP, FX_EVENT_FRESH_MS } from './useFxChannel';
import { FX_FLASH_MS } from './useValueFlash';
import { APP } from '../sync/keys';

let emit;
const Harness = ({ onEvent }) => {
  const { emitFx } = useFxChannel(onEvent);
  emit = emitFx;
  return null;
};

const BloomHarness = ({ charId }) => {
  const bloom = useFxBloom(charId);
  return <div data-testid="bloom-node" data-fx={bloom ? 'bloom' : undefined} />;
};

const evt = (id, overrides) => ({
  id, kind: 'ability', charId: 'izzy', ts: Date.now(), ...overrides,
});

beforeEach(() => {
  window.localStorage.clear();
  emit = undefined;
});

describe('useFxChannel — emit', () => {
  it('emitFx appends a structured { id, kind, charId, ts } event', () => {
    const { session } = renderWithProviders(<Harness />);
    act(() => emit({ kind: 'ability', charId: 'izzy' }));
    const buffer = session.getState('global', APP.FX);
    expect(buffer).toHaveLength(1);
    expect(buffer[0]).toMatchObject({ kind: 'ability', charId: 'izzy' });
    expect(typeof buffer[0].id).toBe('string');
    expect(typeof buffer[0].ts).toBe('number');
  });

  it('the ring buffer caps at FX_BUFFER_CAP', () => {
    const { session } = renderWithProviders(<Harness />);
    act(() => {
      for (let i = 0; i < FX_BUFFER_CAP + 3; i++) emit({ kind: 'ability', charId: `pc-${i}` });
    });
    const buffer = session.getState('global', APP.FX);
    expect(buffer).toHaveLength(FX_BUFFER_CAP);
    expect(buffer.at(-1).charId).toBe(`pc-${FX_BUFFER_CAP + 2}`); // newest kept
  });

  it("the emitter's own device receives its event (self-suppression is a non-goal)", () => {
    const onEvent = vi.fn();
    renderWithProviders(<Harness onEvent={onEvent} />);
    act(() => emit({ kind: 'ability', charId: 'izzy' }));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(expect.objectContaining({ charId: 'izzy' }));
  });
});

describe('useFxChannel — receive guard', () => {
  it('a fresh pushed event fires the subscriber exactly once', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />);
    const e = evt('fx-1');
    act(() => session.push('global', APP.FX, [e]));
    act(() => session.push('global', APP.FX, [e])); // reconnect re-delivery
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(e);
  });

  it('only unseen entries of a grown buffer fire', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />);
    const first = evt('fx-1');
    act(() => session.push('global', APP.FX, [first]));
    act(() => session.push('global', APP.FX, [first, evt('fx-2', { charId: 'thorn' })]));
    expect(onEvent).toHaveBeenCalledTimes(2);
    expect(onEvent).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'fx-2' }));
  });

  it('stale events are consumed silently (reconnect-replay case)', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />);
    act(() =>
      session.push('global', APP.FX, [evt('fx-old', { ts: Date.now() - FX_EVENT_FRESH_MS - 1 })])
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('a buffer hydrated at mount is history, never events — even when fresh', () => {
    const onEvent = vi.fn();
    renderWithProviders(<Harness onEvent={onEvent} />, {
      session: { state: { global: { [APP.FX]: [evt('fx-hydrated')] } } },
    });
    expect(onEvent).not.toHaveBeenCalled();
  });
});

describe('useFxBloom', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('blooms on a fresh matching ability event, then self-clears', () => {
    const { session, getByTestId } = renderWithProviders(<BloomHarness charId="izzy" />);
    act(() => session.push('global', APP.FX, [evt('fx-1')]));
    expect(getByTestId('bloom-node')).toHaveAttribute('data-fx', 'bloom');
    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    expect(getByTestId('bloom-node')).not.toHaveAttribute('data-fx');
  });

  it('ignores events for other characters and other kinds', () => {
    const { session, getByTestId } = renderWithProviders(<BloomHarness charId="izzy" />);
    act(() => session.push('global', APP.FX, [evt('fx-1', { charId: 'thorn' })]));
    act(() => session.push('global', APP.FX, [evt('fx-2', { kind: 'crit' })]));
    expect(getByTestId('bloom-node')).not.toHaveAttribute('data-fx');
  });
});
