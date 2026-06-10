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
  global.fetch = vi.fn(impl);
};

beforeEach(() => {
  MockWS.instances = [];
  MockWS.last = null;
  global.WebSocket = MockWS;
});

afterEach(() => {
  vi.restoreAllMocks();
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
    vi.useFakeTimers();
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Probe /></ContentProvider>);
    expect(MockWS.instances).toHaveLength(1);
    act(() => { MockWS.last._error(); });
    act(() => { vi.advanceTimersByTime(3000); });
    expect(MockWS.instances).toHaveLength(2);
    vi.useRealTimers();
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

  it('sources lore and traits from the server when present', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: {
              lore: [
                { id: 'l1', title: 'Server Lore', category: 'Location' },
                { id: 'l2', title: 'Known Lore', category: 'Location', visibility: 'revealed' },
              ],
              trait: [{ id: 'agile', name: 'Agile', description: 'd' }],
            },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    // Entries without an explicit 'revealed' flag are GM-only: present in the
    // full list (stamped visibility 'gm'), absent from the player-facing one.
    expect(val.allLoreEntries).toEqual([
      { id: 'l1', title: 'Server Lore', category: 'Location', visibility: 'gm' },
      { id: 'l2', title: 'Known Lore', category: 'Location', visibility: 'revealed' },
    ]);
    expect(val.loreEntries).toEqual([
      { id: 'l2', title: 'Known Lore', category: 'Location', visibility: 'revealed' },
    ]);
    expect(val.traits).toEqual([{ id: 'agile', name: 'Agile', description: 'd' }]);
  });

  it('falls back to bundled lore and traits with no provider', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    // Bundled lore predates the visibility flag, so every entry defaults to
    // GM-only: the full list is populated, the player view starts empty.
    expect(Array.isArray(val.allLoreEntries)).toBe(true);
    expect(val.allLoreEntries.length).toBeGreaterThan(0);
    expect(Array.isArray(val.loreEntries)).toBe(true);
    expect(val.loreEntries.length).toBe(0);
    expect(Array.isArray(val.traits)).toBe(true);
    expect(val.traits.length).toBeGreaterThan(0);
  });

  it('sources characters from the server when present, else bundled', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: { character: [{ id: 'Pellias', name: 'Pellias', level: 5 }] },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    expect(val.characters).toEqual([{ id: 'Pellias', name: 'Pellias', level: 5 }]);
  });

  it('exposes bundled characters on the no-provider fallback', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    expect(Array.isArray(val.characters)).toBe(true);
    expect(val.characters.length).toBeGreaterThan(0);
  });

  it('exposes the item catalog and resolves character inventory refs against it', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: {
              item: [
                { id: 'elixir', name: 'Minor Elixir of Life', price: 3, weight: 0.1, traits: ['Healing'] },
              ],
              character: [
                { id: 'Pellias', name: 'Pellias', inventory: [{ ref: 'elixir', quantity: 2 }] },
              ],
            },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    expect(val.items).toEqual([
      { id: 'elixir', name: 'Minor Elixir of Life', price: 3, weight: 0.1, traits: ['Healing'] },
    ]);
    expect(val.characters[0].inventory[0]).toMatchObject({
      name: 'Minor Elixir of Life',
      price: 3,
      weight: 0.1,
      quantity: 2,
      id: 'elixir',
    });
  });

  it('exposes an item catalog array on the no-provider fallback', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    expect(Array.isArray(val.items)).toBe(true);
  });

  it('exposes rawCharacters with refs intact alongside the resolved characters', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: {
              item: [{ id: 'elixir', name: 'Minor Elixir of Life', price: 3, weight: 0.1 }],
              character: [
                { id: 'Pellias', name: 'Pellias', inventory: [{ ref: 'elixir', quantity: 2 }] },
              ],
            },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    // Raw keeps the authored reference (GM editor edits this).
    expect(val.rawCharacters[0].inventory[0]).toEqual({ ref: 'elixir', quantity: 2 });
    // Resolved expands it for players.
    expect(val.characters[0].inventory[0]).toMatchObject({
      name: 'Minor Elixir of Life',
      quantity: 2,
    });
  });

  it('exposes a rawCharacters array on the no-provider fallback', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    expect(Array.isArray(val.rawCharacters)).toBe(true);
    expect(val.rawCharacters.length).toBeGreaterThan(0);
  });

  it('exposes images as an array on the no-provider fallback', () => {
    let val;
    const C = () => { val = useContent(); return null; };
    render(<C />);
    expect(Array.isArray(val.images)).toBe(true);
  });

  it('sources images from the server image collection when present', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            payload: { image: [{ id: 'img_abc.jpg', name: 'Pellias', folder: 'portraits', mimeType: 'image/jpeg', createdAt: 1700000000000 }] },
          }),
      })
    );
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('server'));
    expect(val.images).toEqual([
      { id: 'img_abc.jpg', name: 'Pellias', folder: 'portraits', mimeType: 'image/jpeg', createdAt: 1700000000000 },
    ]);
  });

  it('falls back to snapshot images when offline', async () => {
    let val;
    const Cap = () => { val = useContent(); return null; };
    mockFetch(() => Promise.reject(new Error('offline')));
    render(<ContentProvider><Cap /></ContentProvider>);
    await waitFor(() => expect(val.source).toBe('fallback'));
    expect(Array.isArray(val.images)).toBe(true);
  });
});
