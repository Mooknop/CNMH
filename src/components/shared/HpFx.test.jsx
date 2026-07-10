import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { useSyncedState } from '../../hooks/useSyncedState';
import { FX_FLASH_MS } from '../../hooks/useValueFlash';
import { RELAY, syncKey } from '../../sync/keys';
import HpFx from './HpFx';

// Exercises the real sync path: HpFx watching a live cnmh_hp_<charId> key fed
// by session.push(), exactly how every site consumes it (no matter which
// client wrote the HP).
const Harness = ({ charId }) => {
  const [hp] = useSyncedState(syncKey(RELAY.HP, charId), null);
  return (
    <HpFx hp={hp} data-testid="hpfx">
      <span>{hp?.current ?? '—'}</span>
      {hp?.temp > 0 && (
        <span className="hp-fx-temp" data-testid="temp">+{hp.temp}</span>
      )}
    </HpFx>
  );
};

const HP = (overrides) => ({ current: 30, max: 40, temp: 0, ...overrides });

const setup = () => {
  const view = renderWithProviders(<Harness charId="pc-1" />, {
    session: { connected: true },
  });
  const push = (hp) => act(() => view.session.push('pc-1', 'hp', hp));
  return { ...view, push };
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('HpFx', () => {
  it('hydration is baseline: seeding HP then pushing the same value never flashes', () => {
    const { push } = setup();
    push(HP());
    push(HP());
    const el = screen.getByTestId('hpfx');
    expect(el).not.toHaveAttribute('data-fx');
    expect(el.querySelector('.hp-fx-float')).toBeNull();
  });

  it('damage flashes bad with a floating −N, then self-clears', () => {
    const { push } = setup();
    push(HP({ current: 30 }));
    push(HP({ current: 24 }));
    const el = screen.getByTestId('hpfx');
    expect(el).toHaveAttribute('data-fx', 'damage');
    const float = el.querySelector('.hp-fx-float');
    expect(float).toHaveTextContent('−6');
    expect(float).toHaveClass('hp-fx-float--down');
    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    expect(el).not.toHaveAttribute('data-fx');
    expect(el.querySelector('.hp-fx-float')).toBeNull();
  });

  it('healing glows good with a floating +N', () => {
    const { push } = setup();
    push(HP({ current: 18 }));
    push(HP({ current: 25 }));
    const el = screen.getByTestId('hpfx');
    expect(el).toHaveAttribute('data-fx', 'heal');
    const float = el.querySelector('.hp-fx-float');
    expect(float).toHaveTextContent('+7');
    expect(float).toHaveClass('hp-fx-float--up');
  });

  it('damage ≥ 25% of max escalates to the big-hit shake', () => {
    const { push } = setup();
    push(HP({ current: 40 }));
    push(HP({ current: 28 })); // 12 ≥ 40 × 0.25
    expect(screen.getByTestId('hpfx')).toHaveAttribute('data-fx', 'bighit');
  });

  it('temp HP gained shimmers; temp HP spent does not', () => {
    const { push } = setup();
    push(HP({ temp: 0 }));
    push(HP({ temp: 8 }));
    const el = screen.getByTestId('hpfx');
    expect(el).toHaveAttribute('data-fx-temp', 'shimmer');
    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    push(HP({ temp: 3 }));
    expect(el).not.toHaveAttribute('data-fx-temp');
  });

  it('a damage write and a temp-HP write in quick succession do not eat each other', () => {
    const { push } = setup();
    push(HP({ current: 30, temp: 0 }));
    push(HP({ current: 22, temp: 0 }));
    push(HP({ current: 22, temp: 5 })); // whetstone trigger right after the hit
    const el = screen.getByTestId('hpfx');
    expect(el).toHaveAttribute('data-fx', 'damage');
    expect(el).toHaveAttribute('data-fx-temp', 'shimmer');
    expect(el.querySelector('.hp-fx-float')).toHaveTextContent('−8');
  });
});
