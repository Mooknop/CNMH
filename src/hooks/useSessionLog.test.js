// First behavioral tests for useSessionLog (#1319) — the shared out-of-combat
// event log synced on cnmh_sessionlog_global. Every consumer (loot drops, shop
// checkout, daily prep, sweeps…) calls appendEvent({ type, text }) and trusts
// the hook to stamp id/ts, prepend newest-first, cap at 50 entries, and fan the
// whole array out to every device. Runs against the real provider stack + the
// in-memory session bus.
import { act } from '@testing-library/react';
import { renderHookWithProviders } from '../test/renderWithProviders';
import { useSessionLog } from './useSessionLog';

beforeEach(() => window.localStorage.clear());

const logWrites = (session) => session.sent.filter((s) => s.stateType === 'sessionlog');

describe('useSessionLog', () => {
  it('exposes an empty log when nothing has been recorded', () => {
    const { result } = renderHookWithProviders(() => useSessionLog());
    expect(result.current.log).toEqual([]);
  });

  it('seeds from the synced server state', () => {
    const seeded = [{ id: 'slog-1', ts: 1, type: 'action', text: 'Aria bought a dagger' }];
    const { result } = renderHookWithProviders(() => useSessionLog(), {
      session: { state: { global: { sessionlog: seeded } } },
    });
    expect(result.current.log).toEqual(seeded);
  });

  it('appendEvent stamps id + ts onto the entry and syncs the log to cnmh_sessionlog_global', () => {
    const { result, session } = renderHookWithProviders(() => useSessionLog());

    act(() => result.current.appendEvent({ type: 'action', text: 'Aria claimed Acid Flask' }));

    expect(result.current.log).toHaveLength(1);
    const entry = result.current.log[0];
    expect(entry).toMatchObject({ type: 'action', text: 'Aria claimed Acid Flask' });
    expect(entry.id).toMatch(/^slog-/);
    expect(entry.ts).toEqual(expect.any(Number));

    const write = logWrites(session).at(-1);
    expect(write.characterId).toBe('global');
    expect(write.value).toEqual(result.current.log);
  });

  it('prepends — the newest entry is always first', () => {
    const { result } = renderHookWithProviders(() => useSessionLog());

    act(() => result.current.appendEvent({ type: 'action', text: 'first' }));
    act(() => result.current.appendEvent({ type: 'expire', text: 'second' }));

    expect(result.current.log.map((e) => e.text)).toEqual(['second', 'first']);
  });

  it('gives entries unique ids even within the same millisecond', () => {
    const { result } = renderHookWithProviders(() => useSessionLog());

    act(() => {
      result.current.appendEvent({ text: 'a' });
      result.current.appendEvent({ text: 'b' });
    });

    const [b, a] = result.current.log;
    expect(a.id).not.toBe(b.id);
  });

  it('caps the log at 50 entries, dropping the oldest', () => {
    // Seeded newest-first: index 0 is the most recent, index 49 the oldest.
    const seeded = Array.from({ length: 50 }, (_, i) => ({
      id: `slog-seed-${i}`,
      ts: 50 - i,
      text: `entry ${i}`,
    }));
    const { result } = renderHookWithProviders(() => useSessionLog(), {
      session: { state: { global: { sessionlog: seeded } } },
    });

    act(() => result.current.appendEvent({ type: 'action', text: 'the 51st event' }));

    expect(result.current.log).toHaveLength(50);
    expect(result.current.log[0].text).toBe('the 51st event');
    expect(result.current.log.at(-1).text).toBe('entry 48'); // oldest ('entry 49') dropped
  });

  it('reflects a remote peer’s update', () => {
    const { result, session } = renderHookWithProviders(() => useSessionLog());
    const remote = [{ id: 'slog-remote', ts: 9, type: 'rest', text: 'Vestri made daily preparations' }];

    act(() => session.push('global', 'sessionlog', remote));

    expect(result.current.log).toEqual(remote);
  });

  it('still appends in the offline sandbox — global keys survive the write freeze', () => {
    const { result, session } = renderHookWithProviders(() => useSessionLog(), {
      session: { connected: true, foundryConnected: false },
    });

    act(() => result.current.appendEvent({ type: 'action', text: 'GM prep note' }));

    expect(result.current.log).toHaveLength(1);
    expect(logWrites(session)).toHaveLength(1);
  });
});
