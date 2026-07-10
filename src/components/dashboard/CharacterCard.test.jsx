import React from 'react';
import { act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { FX_FLASH_MS } from '../../hooks/useValueFlash';
import { APP } from '../../sync/keys';
import CharacterCard from './CharacterCard';

const IZZY = { id: 'izzy', name: 'Izzy', level: 5, ancestry: 'Poppet', class: 'Bard' };
const THORN = { id: 'thorn', name: 'Thorn', level: 5 };

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('CharacterCard — ability-use bloom (#1346)', () => {
  it('a fresh fx event blooms the matching card only, then clears', () => {
    const { session, container } = renderWithProviders(
      <>
        <CharacterCard character={IZZY} accent="#c03030" />
        <CharacterCard character={THORN} accent="#3060c0" />
      </>
    );
    act(() =>
      session.push('global', APP.FX, [
        { id: 'fx-1', kind: 'ability', charId: 'izzy', ts: Date.now() },
      ])
    );
    const cards = container.querySelectorAll('.sigil-card-inner');
    expect(cards[0]).toHaveAttribute('data-fx', 'bloom');
    expect(cards[1]).not.toHaveAttribute('data-fx');

    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    expect(container.querySelector('[data-fx="bloom"]')).toBeNull();
  });

  it('renders the signature flourish overlay when the event carries one, and clears it (#1347)', () => {
    const { session, container } = renderWithProviders(
      <CharacterCard character={IZZY} accent="#c03030" />
    );
    act(() =>
      session.push('global', APP.FX, [
        { id: 'fx-1', kind: 'ability', charId: 'izzy', ts: Date.now(), flourish: 'composition-burst' },
      ])
    );
    expect(container.querySelector('[data-flourish="composition-burst"]')).toBeInTheDocument();

    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    expect(container.querySelector('.fx-flourish')).toBeNull();
  });
});
