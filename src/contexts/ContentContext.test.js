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
  });
});
