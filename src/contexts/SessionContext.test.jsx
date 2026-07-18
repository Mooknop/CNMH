import React, { useEffect, useState } from 'react';
import { render, screen, act } from '@testing-library/react';
import { SessionProvider, useSession, isSandboxWritable } from './SessionContext';

describe('isSandboxWritable', () => {
  it('allows reversible inventory organization, including affix/attach bindings', () => {
    ['loadout', 'invested', 'affixed', 'attached'].forEach((t) => {
      expect(isSandboxWritable(t, 'pellias')).toBe(true);
    });
  });

  it('freezes per-character resource burns', () => {
    ['consumed', 'gold', 'focus', 'hp', 'itemeffects'].forEach((t) => {
      expect(isSandboxWritable(t, 'pellias')).toBe(false);
    });
  });

  it('keeps the focus target interactive — a UI pointer, not a resource (#1502)', () => {
    // The dossier/plays pivot on tap-to-focus; the sandbox must not freeze it.
    // (`focus` above stays frozen — that key is the focus-POINTS pool.)
    expect(isSandboxWritable('focustarget', 'pellias')).toBe(true);
  });

  it('always allows global (GM-authored) writes', () => {
    expect(isSandboxWritable('shops', 'global')).toBe(true);
  });
});

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
  vi.useFakeTimers();
});

afterEach(() => {
  vi.runOnlyPendingTimers();
  vi.useRealTimers();
});

const Probe = ({ onReady }) => {
  const session = useSession();
  useEffect(() => { if (onReady) onReady(session); }, [session, onReady]);
  return (
    <>
      <div data-testid="connected">{String(session.connected)}</div>
      <div data-testid="foundry">{String(session.foundryConnected)}</div>
    </>
  );
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

  it('counts hydrations per FULL_STATE (0 until the first snapshot)', () => {
    // useSyncedState keys its once-per-snapshot reconcile off this counter —
    // in particular, a key ABSENT from a snapshot is authoritative emptiness
    // (the stale-localStorage double-shield bug), so every FULL_STATE must
    // mint a new count, including a later one after a reconnect or reset.
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    expect(api.hydrations).toBe(0);
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'FULL_STATE', payload: { IzzyUncut: { focus: 3 } } });
    });
    expect(api.hydrations).toBe(1);
    act(() => { MockWS.last._msg({ type: 'FULL_STATE', payload: {} }); });
    expect(api.hydrations).toBe(2);
  });

  it('sendUpdate sends JSON when open and records state locally', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { MockWS.last._open(); MockWS.last._msg({ type: 'PRESENCE', foundry: true }); });
    act(() => { api.sendUpdate('IzzyUncut', 'focus', 5); });
    expect(MockWS.last.sent).toHaveLength(1);
    expect(JSON.parse(MockWS.last.sent[0])).toEqual({
      type: 'UPDATE', characterId: 'IzzyUncut', key: 'focus', value: 5,
    });
    expect(api.getState('IzzyUncut', 'focus')).toBe(5);
  });

  it('sendUpdate notifies local subscribers of the same key (same-client sync)', () => {
    // Regression: the server broadcast excludes the sender, so a local write
    // must notify other same-client consumers of the key directly — otherwise
    // useCharacter's effective tree / the Bulk bar never update while
    // HandsPanel writes the loadout on the acting player's own screen.
    let api;
    render(
      <SessionProvider>
        <Probe onReady={(s) => { api = s; }} />
        <Subscriber characterId="Pellias" type="loadout" />
      </SessionProvider>
    );
    act(() => { MockWS.last._open(); MockWS.last._msg({ type: 'PRESENCE', foundry: true }); });
    expect(screen.getByTestId('sub').textContent).toBe('none');
    act(() => { api.sendUpdate('Pellias', 'loadout', { x: 1 }); });
    expect(screen.getByTestId('sub').textContent).toBe('[object Object]');
    expect(api.getState('Pellias', 'loadout')).toEqual({ x: 1 });
  });

  it('sendUpdate notifies local subscribers even while the socket is closed', () => {
    let api;
    render(
      <SessionProvider>
        <Probe onReady={(s) => { api = s; }} />
        <Subscriber characterId="Blu" type="loadout" />
      </SessionProvider>
    );
    act(() => { api.sendUpdate('Blu', 'loadout', 7); });
    expect(MockWS.last.sent).toHaveLength(0);
    expect(screen.getByTestId('sub').textContent).toBe('7');
  });

  it('sendUpdate does not send while socket is not open but still records state', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { api.sendUpdate('IzzyUncut', 'staff', 2); });
    expect(MockWS.last.sent).toHaveLength(0);
    expect(api.getState('IzzyUncut', 'staff')).toBe(2);
  });

  // The Exploit Vulnerability write-loss incident: a write during the reconnect
  // window vanished — never sent, then wiped by the next FULL_STATE reconcile.
  describe('reconnect write queue', () => {
    it('queues a write made while CONNECTING and flushes it on open', () => {
      let api;
      render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
      act(() => { api.sendUpdate('Ashka', 'itemeffects', ['ev-combusted']); });
      expect(MockWS.last.sent).toHaveLength(0);
      expect(api.pendingWrites).toBe(1);
      act(() => { MockWS.last._open(); });
      expect(MockWS.last.sent).toHaveLength(1);
      expect(JSON.parse(MockWS.last.sent[0])).toEqual({
        type: 'UPDATE', characterId: 'Ashka', key: 'itemeffects', value: ['ev-combusted'],
      });
    });

    it('dedupes queued writes per characterId+key, keeping the newest value in order', () => {
      let api;
      render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
      act(() => {
        api.sendUpdate('Ashka', 'itemeffects', ['stale']);
        api.sendUpdate('Ashka', 'hp', { current: 12 });
        api.sendUpdate('Ashka', 'itemeffects', ['fresh']);
      });
      expect(api.pendingWrites).toBe(2);
      act(() => { MockWS.last._open(); });
      expect(MockWS.last.sent.map((f) => JSON.parse(f))).toEqual([
        { type: 'UPDATE', characterId: 'Ashka', key: 'itemeffects', value: ['fresh'] },
        { type: 'UPDATE', characterId: 'Ashka', key: 'hp', value: { current: 12 } },
      ]);
    });

    it('the sandbox freeze still drops writes — they are not queued for later', () => {
      let api;
      render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
      act(() => { MockWS.last._open(); }); // sandbox: connected, Foundry down
      act(() => { api.sendUpdate('Ashka', 'focus', 1); });
      expect(api.pendingWrites).toBe(0);
      // Reconnect cycle: a frozen write must not resurface as a flushed frame.
      act(() => { MockWS.last._error(); });
      act(() => { vi.advanceTimersByTime(3000); });
      act(() => { MockWS.last._open(); });
      expect(MockWS.last.sent).toHaveLength(0);
    });

    it('a queued write survives the hydration reconcile (overlaid onto FULL_STATE)', () => {
      // The DO snapshots on socket attach, BEFORE the flushed frames land, so
      // the snapshot arrives without the key — the raw #1476 reconcile would
      // treat that absence as authoritative and wipe the write we just flushed.
      let api;
      render(
        <SessionProvider>
          <Probe onReady={(s) => { api = s; }} />
          <Subscriber characterId="Ashka" type="itemeffects" />
        </SessionProvider>
      );
      act(() => { api.sendUpdate('Ashka', 'itemeffects', ['ev-combusted']); });
      act(() => { MockWS.last._open(); });
      act(() => { MockWS.last._msg({ type: 'FULL_STATE', payload: {} }); });
      expect(api.getState('Ashka', 'itemeffects')).toEqual(['ev-combusted']);
      expect(screen.getByTestId('sub').textContent).toBe('ev-combusted');
      expect(api.hydrations).toBe(1);
      expect(api.pendingWrites).toBe(0);
    });

    it('a newer OPEN-path write supersedes its queued value in the overlay', () => {
      // Queued A, flushed, then the user writes B before FULL_STATE arrives:
      // the overlay must carry B, not revert to A.
      let api;
      render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
      act(() => { api.sendUpdate('Ashka', 'itemeffects', ['old']); });
      act(() => {
        MockWS.last._open();
        MockWS.last._msg({ type: 'PRESENCE', foundry: true });
      });
      act(() => { api.sendUpdate('Ashka', 'itemeffects', ['new']); });
      act(() => { MockWS.last._msg({ type: 'FULL_STATE', payload: {} }); });
      expect(api.getState('Ashka', 'itemeffects')).toEqual(['new']);
    });

    it('re-flushes on the next reconnect if the socket dies before FULL_STATE confirms', () => {
      let api;
      render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
      act(() => { api.sendUpdate('Ashka', 'itemeffects', ['ev']); });
      act(() => { MockWS.last._open(); });
      expect(MockWS.last.sent).toHaveLength(1);
      act(() => { MockWS.last._error(); }); // died before any FULL_STATE
      act(() => { vi.advanceTimersByTime(3000); });
      act(() => { MockWS.last._open(); });
      // Same frame again on the fresh socket — UPDATE is full-value
      // last-write-wins, so the resend is harmless and the write can't be lost.
      expect(MockWS.last.sent).toHaveLength(1);
      expect(JSON.parse(MockWS.last.sent[0]).value).toEqual(['ev']);
      act(() => { MockWS.last._msg({ type: 'FULL_STATE', payload: {} }); });
      expect(api.pendingWrites).toBe(0);
    });
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

  it('freezes sendUpdate in the offline sandbox (DO up, Foundry down)', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { MockWS.last._open(); }); // connected=true, foundryConnected still false
    act(() => { api.sendUpdate('IzzyUncut', 'focus', 5); });
    // No socket write and no cached state change — the write is inert.
    expect(MockWS.last.sent).toHaveLength(0);
    expect(api.getState('IzzyUncut', 'focus')).toBeUndefined();
  });

  it('lets a forced write bypass the offline-sandbox freeze (authoritative GM write)', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { MockWS.last._open(); }); // sandbox: connected, Foundry down
    // `gold` is a normally-frozen per-character key; force makes the GM party-gold
    // write go through anyway — cached and broadcast.
    act(() => { api.sendUpdate('Thorn', 'gold', 120, { force: true }); });
    expect(api.getState('Thorn', 'gold')).toBe(120);
    expect(MockWS.last.sent).toHaveLength(1);
  });

  it('still allows inventory-organization writes in the sandbox (#554)', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { MockWS.last._open(); }); // sandbox: connected, Foundry down
    act(() => { api.sendUpdate('Jade', 'loadout', { uid1: { state: 'worn' } }); });
    act(() => { api.sendUpdate('Jade', 'invested', { eye: true }); });
    // Both go through — cached and broadcast — so a player can manage inventory.
    expect(api.getState('Jade', 'loadout')).toEqual({ uid1: { state: 'worn' } });
    expect(api.getState('Jade', 'invested')).toEqual({ eye: true });
    expect(MockWS.last.sent).toHaveLength(2);
    // …while a resource write stays frozen.
    act(() => { api.sendUpdate('Jade', 'focus', 5); });
    expect(api.getState('Jade', 'focus')).toBeUndefined();
    expect(MockWS.last.sent).toHaveLength(2);
  });

  it('still allows GM-authored global writes in the sandbox (always-on GM edits)', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => { MockWS.last._open(); }); // sandbox: connected, Foundry down
    act(() => { api.sendUpdate('global', 'shops', { 'red-dog-smithy': { wares: [{ ref: 'slick' }] } }); });
    // Campaign-level GM setup goes through — cached and broadcast — even offline.
    expect(api.getState('global', 'shops')).toEqual({ 'red-dog-smithy': { wares: [{ ref: 'slick' }] } });
    expect(MockWS.last.sent).toHaveLength(1);
  });

  it('resumes sendUpdate once Foundry presence arrives', () => {
    let api;
    render(<SessionProvider><Probe onReady={(s) => { api = s; }} /></SessionProvider>);
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'PRESENCE', foundry: true });
    });
    act(() => { api.sendUpdate('IzzyUncut', 'focus', 5); });
    expect(MockWS.last.sent).toHaveLength(1);
    expect(api.getState('IzzyUncut', 'focus')).toBe(5);
  });

  it('foundryConnected defaults to false until a PRESENCE signal', () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    expect(screen.getByTestId('foundry').textContent).toBe('false');
    act(() => { MockWS.last._open(); });
    expect(screen.getByTestId('foundry').textContent).toBe('false');
  });

  it('PRESENCE flips foundryConnected on and off', () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'PRESENCE', foundry: true });
    });
    expect(screen.getByTestId('foundry').textContent).toBe('true');
    act(() => { MockWS.last._msg({ type: 'PRESENCE', foundry: false }); });
    expect(screen.getByTestId('foundry').textContent).toBe('false');
  });

  it('resets foundryConnected to false when the DO link drops', () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    act(() => {
      MockWS.last._open();
      MockWS.last._msg({ type: 'PRESENCE', foundry: true });
    });
    expect(screen.getByTestId('foundry').textContent).toBe('true');
    act(() => { MockWS.last._error(); }); // onerror -> close -> onclose
    expect(screen.getByTestId('foundry').textContent).toBe('false');
  });

  it('reconnects after the socket closes', () => {
    render(<SessionProvider><Probe /></SessionProvider>);
    act(() => { MockWS.last._open(); });
    expect(MockWS.instances).toHaveLength(1);
    act(() => { MockWS.last._error(); }); // onerror -> close -> onclose
    expect(screen.getByTestId('connected').textContent).toBe('false');
    act(() => { vi.advanceTimersByTime(3000); });
    expect(MockWS.instances).toHaveLength(2);
  });

  it('does not reconnect after unmount', () => {
    const { unmount } = render(<SessionProvider><Probe /></SessionProvider>);
    act(() => { MockWS.last._open(); });
    unmount();
    const count = MockWS.instances.length;
    act(() => { vi.advanceTimersByTime(9000); });
    expect(MockWS.instances).toHaveLength(count);
  });

  it('schedules a retry when the WebSocket constructor throws', () => {
    global.WebSocket = function ThrowingWS() { throw new Error('blocked'); };
    expect(() => render(<SessionProvider><Probe /></SessionProvider>)).not.toThrow();
    expect(() => act(() => { vi.advanceTimersByTime(3000); })).not.toThrow();
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
