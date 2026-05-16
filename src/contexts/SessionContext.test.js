import React, { useEffect, useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { SessionProvider, useSession } from './SessionContext';

// jsdom has no WebSocket — hand-rolled controllable fake (no new deps).
class MockWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    MockWS.instances.push(this);
    MockWS.last = this;
  }
  send(data) { this.sent.push(data); }
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
  _open() { this.readyState = 1; if (this.onopen) this.onopen(); }
  _msg(payload) {
    if (this.onmessage) {
      this.onmessage({ data: typeof payload === 'string' ? payload : JSON.stringify(payload) });
    }
  }
  _error() { if (this.onerror) this.onerror(); }
}
MockWS.OPEN = 1;
MockWS.instances = [];
MockWS.last = null;

beforeEach(() => {
  MockWS.instances = [];
  MockWS.last = null;
  global.WebSocket = MockWS;
  jest.useFakeTimers();
});

afterEach(() => {
  jest.runOnlyPendingTimers();
  jest.useRealTimers();
});

const Probe = ({ onReady }) => {
  const session = useSession();
  useEffect(() => { if (onReady) onReady(session); }, [session, onReady]);
  return <div data-testid="connected">{String(session.connected)}</div>;
};

const Subscriber = ({ characterId, type }) => {
  const { subscribe } = useSession();
  const [v, setV] = useState('none');
  useEffect(() => subscribe(characterId, type, (val) => setV(String(val))), [subscribe, characterId, type]);
  return <div data-testid="sub">{v}</div>;
};

describe('SessionContext', () => {
  it('connects and flips connected=true on open', () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId('connected').textContent).toBe('false');
    act(() => { MockWS.last._open(); });
    expect(screen.getByTestId('connected').textContent).toBe('true');
  });

  it('FULL_STATE notifies existing subscribers', () => {
    render(<SessionProvider><Subscriber characterId="IzzyUncut" type="focus" /></SessionProvider>);
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'FULL_STATE', payload: { IzzyUncut: { focus: 3 } } });
    });
    expect(screen.getByTestId('sub').textContent).toBe('3');
  });

  it('UPDATE notifies subscribers and getState reflects it', () => {
    let api;
    render(
      <SessionProvider>
        <Probe onReady={(s) => { api = s; }} />
        <Subscriber characterId="Pellias" type="conditions" />
      </SessionProvider>
    );
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'UPDATE', characterId: 'Pellias', key: 'conditions', value: [1, 2] });
    });
    expect(screen.getByTestId('sub').textContent).toBe('1,2');
    expect(api.getState('Pellias', 'conditions')).toEqual([1, 2]);
  });

  it('sendUpdate sends JSON when open and records state locally', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { MockWS.last._open(); });
    act(() => { api.sendUpdate('IzzyUncut', 'focus', 5); });
    expect(MockWS.last.sent).toHaveLength(1);
    expect(JSON.parse(MockWS.last.sent[0])).toEqual({
      type: 'UPDATE', characterId: 'IzzyUncut', key: 'focus', value: 5,
    });
    expect(api.getState('IzzyUncut', 'focus')).toBe(5);
  });

  it('sendUpdate does not send while socket is not open but still records state', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { api.sendUpdate('IzzyUncut', 'staff', 2); });
    expect(MockWS.last.sent).toHaveLength(0);
    expect(api.getState('IzzyUncut', 'staff')).toBe(2);
  });

  it('ignores malformed messages', () => {
    render(<SessionProvider><Subscriber characterId="X" type="y" /></SessionProvider>);
    act(() => { MockWS.last._open(); MockWS.last._msg('not-json'); });
    expect(screen.getByTestId('sub').textContent).toBe('none');
  });

  it('unsubscribe stops further notifications', () => {
    const Unsubbing = () => {
      const { subscribe } = useSession();
      const [v, setV] = useState('none');
      useEffect(() => {
        const unsub = subscribe('A', 'b', (val) => setV(String(val)));
        unsub();
        return undefined;
      }, [subscribe]);
      return <div data-testid="u">{v}</div>;
    };
    render(<SessionProvider><Unsubbing /></SessionProvider>);
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'UPDATE', characterId: 'A', key: 'b', value: 9 });
    });
    expect(screen.getByTestId('u').textContent).toBe('none');
  });

  it('reconnects after the socket closes', () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    act(() => { MockWS.last._open(); });
    expect(MockWS.instances).toHaveLength(1);
    act(() => { MockWS.last._error(); }); // onerror -> close -> onclose
    expect(screen.getByTestId('connected').textContent).toBe('false');
    act(() => { jest.advanceTimersByTime(3000); });
    expect(MockWS.instances).toHaveLength(2);
  });

  it('does not reconnect after unmount', () => {
    const { unmount } = render(<SessionProvider><Probe /></SessionProvider>);
    act(() => { MockWS.last._open(); });
    unmount();
    const count = MockWS.instances.length;
    act(() => { jest.advanceTimersByTime(9000); });
    expect(MockWS.instances).toHaveLength(count);
  });

  it('schedules a retry when the WebSocket constructor throws', () => {
    global.WebSocket = function ThrowingWS() { throw new Error('blocked'); };
    expect(() => render(<SessionProvider><Probe /></SessionProvider>)).not.toThrow();
    expect(() => act(() => { jest.advanceTimersByTime(3000); })).not.toThrow();
  });

  it('useSession returns a safe no-op default with no provider', () => {
    let val;
    const C = () => { val = useSession(); return null; };
    render(<C />);
    expect(val.connected).toBe(false);
    expect(val.getState('a', 'b')).toBeUndefined();
    const unsub = val.subscribe('a', 'b', () => {});
    expect(typeof unsub).toBe('function');
    expect(() => { unsub(); val.sendUpdate('a', 'b', 1); }).not.toThrow();
  });
});
