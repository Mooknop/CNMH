// First behavioral tests for LoreContext (#1319) — the lore-drawer open/close
// + wiki-style history navigation state that LoreDrawer, Dashboard, and the
// bestiary pages drive through useLore(). Uses the real LoreProvider (no
// session/content dependency — it is pure local UI state).
import React from 'react';
import { renderHook, act } from '@testing-library/react';
import { LoreProvider, useLore } from './LoreContext';

const wrapper = ({ children }) => <LoreProvider>{children}</LoreProvider>;
const renderLore = () => renderHook(() => useLore(), { wrapper });

describe('LoreContext', () => {
  it('useLore throws outside a LoreProvider', () => {
    // Silence React's error boundary noise for the intentional throw.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useLore())).toThrow('useLore must be used within LoreProvider');
    spy.mockRestore();
  });

  it('starts closed with no entry and no history', () => {
    const { result } = renderLore();
    expect(result.current.isOpen).toBe(false);
    expect(result.current.currentEntryId).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it('openLore opens the drawer on the entry with fresh history', () => {
    const { result } = renderLore();
    act(() => result.current.openLore('sandpoint'));
    expect(result.current.isOpen).toBe(true);
    expect(result.current.currentEntryId).toBe('sandpoint');
    expect(result.current.canGoBack).toBe(false);
  });

  it('navigateTo moves to the linked entry and records where you came from', () => {
    const { result } = renderLore();
    act(() => result.current.openLore('sandpoint'));
    act(() => result.current.navigateTo('hinterlands'));
    expect(result.current.currentEntryId).toBe('hinterlands');
    expect(result.current.canGoBack).toBe(true);
  });

  it('goBack walks the trail in reverse, one hop at a time', () => {
    const { result } = renderLore();
    act(() => result.current.openLore('a'));
    act(() => result.current.navigateTo('b'));
    act(() => result.current.navigateTo('c'));

    act(() => result.current.goBack());
    expect(result.current.currentEntryId).toBe('b');
    expect(result.current.canGoBack).toBe(true);

    act(() => result.current.goBack());
    expect(result.current.currentEntryId).toBe('a');
    expect(result.current.canGoBack).toBe(false);
  });

  it('goBack with no history is a safe no-op', () => {
    const { result } = renderLore();
    act(() => result.current.openLore('a'));
    act(() => result.current.goBack());
    expect(result.current.currentEntryId).toBe('a');
    expect(result.current.isOpen).toBe(true);
  });

  it('closeLore resets everything', () => {
    const { result } = renderLore();
    act(() => result.current.openLore('a'));
    act(() => result.current.navigateTo('b'));
    act(() => result.current.closeLore());
    expect(result.current.isOpen).toBe(false);
    expect(result.current.currentEntryId).toBeNull();
    expect(result.current.canGoBack).toBe(false);
  });

  it('re-opening on a new entry discards the previous trail', () => {
    const { result } = renderLore();
    act(() => result.current.openLore('a'));
    act(() => result.current.navigateTo('b'));
    act(() => result.current.openLore('c'));
    expect(result.current.currentEntryId).toBe('c');
    expect(result.current.canGoBack).toBe(false);
  });

  it('navigateTo before any entry is open sets the entry without recording history', () => {
    const { result } = renderLore();
    act(() => result.current.navigateTo('a'));
    expect(result.current.currentEntryId).toBe('a');
    expect(result.current.canGoBack).toBe(false);
  });
});
