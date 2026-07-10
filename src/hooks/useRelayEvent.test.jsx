import React from 'react';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../test/renderWithProviders';
import { useRelayEvent, RELAY_EVENT_FRESH_MS } from './useRelayEvent';
import { RELAY, globalKey } from '../sync/keys';

const KEY = globalKey(RELAY.DMGAPPLY);

const Harness = ({ onEvent }) => {
  useRelayEvent(KEY, onEvent);
  return null;
};

const payload = (id, overrides) => ({ id, ts: Date.now(), ...overrides });

beforeEach(() => window.localStorage.clear());

describe('useRelayEvent', () => {
  it('fires once for a fresh unseen payload', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />);
    const p = payload('evt-1', { hits: [1] });
    act(() => session.push('global', RELAY.DMGAPPLY, p));
    expect(onEvent).toHaveBeenCalledTimes(1);
    expect(onEvent).toHaveBeenCalledWith(p);
  });

  it('re-delivery of a seen id (reconnect FULL_STATE) is skipped', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />);
    const p = payload('evt-1');
    act(() => session.push('global', RELAY.DMGAPPLY, p));
    act(() => session.push('global', RELAY.DMGAPPLY, { ...p }));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });

  it('a stale payload is consumed but never fired', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />);
    act(() =>
      session.push('global', RELAY.DMGAPPLY, payload('evt-old', { ts: Date.now() - RELAY_EVENT_FRESH_MS - 1 }))
    );
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('the value hydrated at mount is history, not an event — even when fresh', () => {
    const onEvent = vi.fn();
    const p = payload('evt-hydrated');
    renderWithProviders(<Harness onEvent={onEvent} />, {
      session: { state: { global: { [RELAY.DMGAPPLY]: p } } },
    });
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('a new event after a hydrated one still fires', () => {
    const onEvent = vi.fn();
    const { session } = renderWithProviders(<Harness onEvent={onEvent} />, {
      session: { state: { global: { [RELAY.DMGAPPLY]: payload('evt-hydrated') } } },
    });
    act(() => session.push('global', RELAY.DMGAPPLY, payload('evt-2')));
    expect(onEvent).toHaveBeenCalledTimes(1);
  });
});
