import React from 'react';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ContentProvider, useContent } from './ContentContext';

// jsdom has no WebSocket — same controllable fake used by SessionContext.test.
class MockWS {
  constructor(url) {
    this.url = url;
    this.readyState = 0;
    MockWS.instances.push(this);
    MockWS.last = this;
  }
  send() {}
  close() { this.readyState = 3; if (this.onclose) this.onclose(); }
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

const Probe = () => {
  const { quests, source, loading } = useContent();
  return (
    <div>
      <span data-testid="source">{source}</span>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="titles">{quests.map((q) => q.title).join('|')}</span>
      <span data-testid="ids">{quests.map((q) => q.id).join('|')}</span>
    </div>
  );
};

const mockFetch = (impl) => {
  global.fetch = jest.fn(impl);
};

beforeEach(() => {
  MockWS.instances = [];
  MockWS.last = null;
  global.WebSocket = MockWS;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('ContentContext', () => {
  it('falls back to bundled quests (with derived ids) when the snapshot fetch fails', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Probe /></ContentProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('source').textContent).toBe('fallback');
    expect(screen.getByTestId('titles').textContent).toContain("Deliver Uncle Milton's Package");
    // bundled quests have no id; the layer derives a kebab slug
    expect(screen.getByTestId('ids').textContent).toContain('deliver-uncle-miltons-package');
  });

  it('uses the server snapshot when /api/content returns quests', async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ payload: { quest: [{ id: 'q1', title: 'Server Quest' }] } }),
      })
    );
    render(<ContentProvider><Probe /></ContentProvider>);
    await waitFor(() => expect(screen.getByTestId('source').textContent).toBe('server'));
    expect(screen.getByTestId('titles').textContent).toBe('Server Quest');
  });

  it('applies a live FULL_CONTENT message', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Probe /></ContentProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    act(() => {
      MockWS.last._msg({ type: 'FULL_CONTENT', payload: { quest: [{ id: 'l1', title: 'Live Quest' }] } });
    });
    expect(screen.getByTestId('source').textContent).toBe('server');
    expect(screen.getByTestId('titles').textContent).toBe('Live Quest');
  });

  it('upserts and deletes quests from live messages', async () => {
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ payload: { quest: [{ id: 'a', title: 'A' }] } }),
      })
    );
    render(<ContentProvider><Probe /></ContentProvider>);
    await waitFor(() => expect(screen.getByTestId('titles').textContent).toBe('A'));

    act(() => {
      MockWS.last._msg({ type: 'CONTENT_UPDATE', collection: 'quest', id: 'a', data: { id: 'a', title: 'A-edited' } });
    });
    expect(screen.getByTestId('titles').textContent).toBe('A-edited');

    act(() => {
      MockWS.last._msg({ type: 'CONTENT_UPDATE', collection: 'quest', id: 'b', data: { id: 'b', title: 'B' } });
    });
    expect(screen.getByTestId('titles').textContent).toBe('A-edited|B');

    act(() => {
      MockWS.last._msg({ type: 'CONTENT_DELETE', collection: 'quest', id: 'a' });
    });
    expect(screen.getByTestId('titles').textContent).toBe('B');
  });

  it('ignores malformed live messages', async () => {
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Probe /></ContentProvider>);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(() => act(() => { MockWS.last._msg('not-json'); })).not.toThrow();
    expect(screen.getByTestId('source').textContent).toBe('fallback');
  });

  it('reconnects the live socket after it closes', async () => {
    jest.useFakeTimers();
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Probe /></ContentProvider>);
    expect(MockWS.instances).toHaveLength(1);
    act(() => { MockWS.last._error(); });
    act(() => { jest.advanceTimersByTime(3000); });
    expect(MockWS.instances).toHaveLength(2);
    jest.useRealTimers();
  });

  it('useContent returns a safe fallback default with no provider', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    expect(val.source).toBe('fallback');
    expect(Array.isArray(val.quests)).toBe(true);
    expect(val.quests.length).toBeGreaterThan(0);
    expect(Array.isArray(val.reputation.Factions)).toBe(true);
    expect(val.reputation.Factions.length).toBeGreaterThan(0);
  });

  it('sources reputation from the server faction collection when present', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: { faction: [{ id: 'f1', name: 'Live Faction', reputation: 7, ranks: [] }] },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    expect(val.reputation.Factions).toEqual([
      { id: 'f1', name: 'Live Faction', reputation: 7, ranks: [] },
    ]);
  });

  it('falls back to bundled reputation when the store has no factions', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('fallback'));
    expect(val.reputation.Factions.length).toBeGreaterThan(0);
  });

  it('sources calendar events from the server when present, else bundled', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: {
              calendar: [{ id: 'c1', title: 'Server Event', date: { month: 0, day: 1 } }],
            },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    expect(val.calendarEvents).toEqual([
      { id: 'c1', title: 'Server Event', date: { month: 0, day: 1 } },
    ]);
  });

  it('exposes bundled calendar on the no-provider fallback', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    expect(Array.isArray(val.calendarEvents)).toBe(true);
    expect(val.calendarEvents.length).toBeGreaterThan(0);
  });
});
