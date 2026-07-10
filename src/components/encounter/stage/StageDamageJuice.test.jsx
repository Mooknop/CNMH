import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { buildDamageApply } from '../../../utils/damageRelay';
import { FX_FLASH_MS } from '../../../hooks/useValueFlash';
import { RELAY } from '../../../sync/keys';
import StageDamageJuice from './StageDamageJuice';

const ORDER = [
  { kind: 'pc', entryId: 'e-thorn', charId: 'thorn' },
  { kind: 'pc', entryId: 'e-lira', charId: 'lira' },
  { kind: 'enemy', entryId: 'e-skel', name: 'Skeleton Guard' },
];
const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira', name: 'Lira' },
];

const HP = (overrides) => ({ current: 30, max: 40, temp: 0, ...overrides });

const setup = () => {
  const view = renderWithProviders(
    <StageDamageJuice order={ORDER} characters={CHARACTERS} viewerCharId="thorn" />,
    { session: { connected: true } }
  );
  return {
    ...view,
    dealt: (apply) => act(() => view.session.push('global', RELAY.DMGAPPLY, apply)),
    hp: (charId, value) => act(() => view.session.push(charId, RELAY.HP, value)),
  };
};

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('StageDamageJuice — dealt bursts', () => {
  it('a confirmed damage relay shows a typed burst with amount and target, then clears', () => {
    const { dealt } = setup();
    dealt(buildDamageApply({
      sourceName: 'Thorn — Longbow',
      hits: [{ entryId: 'e-skel', name: 'Skeleton Guard', amount: 14, type: 'fire' }],
    }));
    const card = screen.getByTestId('juice-dealt');
    expect(card).toHaveTextContent('14');
    expect(card).toHaveTextContent('Skeleton Guard');
    expect(card).toHaveTextContent('Thorn — Longbow');
    expect(card.querySelector('[data-fx-sym="fire"]')).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    expect(screen.queryByTestId('juice-dealt')).toBeNull();
  });

  it('multi-instance hits render one packet per damage type', () => {
    const { dealt } = setup();
    dealt(buildDamageApply({
      hits: [{
        entryId: 'e-skel', name: 'Skeleton Guard', amount: 17, type: 'piercing',
        instances: [{ amount: 13, type: 'piercing' }, { amount: 4, type: 'fire' }],
      }],
    }));
    const card = screen.getByTestId('juice-dealt');
    expect(card.querySelector('[data-fx-sym="piercing"]')).toBeInTheDocument();
    expect(card.querySelector('[data-fx-sym="fire"]')).toBeInTheDocument();
    expect(card).toHaveTextContent('13');
    expect(card).toHaveTextContent('4');
  });

  it('re-delivery of the same event id never re-fires (replay guard)', () => {
    const { dealt } = setup();
    const apply = buildDamageApply({
      hits: [{ entryId: 'e-skel', name: 'Skeleton Guard', amount: 9, type: '' }],
    });
    dealt(apply);
    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    dealt({ ...apply });
    expect(screen.queryByTestId('juice-dealt')).toBeNull();
  });

  it('a stale relay (reconnect replay) shows nothing', () => {
    const { dealt } = setup();
    const apply = buildDamageApply({
      hits: [{ entryId: 'e-skel', name: 'Skeleton Guard', amount: 9, type: '' }],
    });
    dealt({ ...apply, ts: Date.now() - 60_000 });
    expect(screen.queryByTestId('juice-dealt')).toBeNull();
  });

  it('untyped hits fall back to the generic burst glyph', () => {
    const { dealt } = setup();
    dealt(buildDamageApply({
      hits: [{ entryId: 'e-skel', name: 'Skeleton Guard', amount: 9, type: '' }],
    }));
    expect(
      screen.getByTestId('juice-dealt').querySelector('[data-fx-sym="untyped"]')
    ).toBeInTheDocument();
  });
});

describe('StageDamageJuice — taken bursts', () => {
  it('a PC hp drop shows a sinking card with name, typed glyph and −N', () => {
    const { hp } = setup();
    hp('lira', HP({ current: 30 }));
    hp('lira', HP({ current: 22, damageType: 'acid' }));
    const card = screen.getByTestId('juice-taken');
    expect(card).toHaveTextContent('Lira');
    expect(card).toHaveTextContent('−8');
    expect(card.querySelector('[data-fx-sym="acid"]')).toBeInTheDocument();
    expect(card).not.toHaveClass('stage-juice-card--self');
    act(() => vi.advanceTimersByTime(FX_FLASH_MS));
    expect(screen.queryByTestId('juice-taken')).toBeNull();
  });

  it("the viewer's own PC gets the self variant", () => {
    const { hp } = setup();
    hp('thorn', HP({ current: 30 }));
    hp('thorn', HP({ current: 18 }));
    const card = screen.getByTestId('juice-taken');
    expect(card).toHaveClass('stage-juice-card--self');
    expect(card.querySelector('[data-fx-sym="untyped"]')).toBeInTheDocument();
  });

  it('healing never bursts', () => {
    const { hp } = setup();
    hp('lira', HP({ current: 22 }));
    hp('lira', HP({ current: 30 }));
    expect(screen.queryByTestId('juice-taken')).toBeNull();
  });

  it('the first hp value after mount is baseline — no burst on hydration', () => {
    const { hp } = setup();
    hp('lira', HP({ current: 12 }));
    expect(screen.queryByTestId('juice-taken')).toBeNull();
  });
});

describe('StageDamageJuice — reduced motion', () => {
  it('renders nothing under prefers-reduced-motion', () => {
    const original = window.matchMedia;
    window.matchMedia = vi.fn(() => ({ matches: true }));
    try {
      const { dealt, hp } = setup();
      dealt(buildDamageApply({
        hits: [{ entryId: 'e-skel', name: 'Skeleton Guard', amount: 14, type: 'fire' }],
      }));
      hp('lira', HP({ current: 30 }));
      hp('lira', HP({ current: 20 }));
      expect(screen.queryByTestId('juice-dealt')).toBeNull();
      expect(screen.queryByTestId('juice-taken')).toBeNull();
    } finally {
      window.matchMedia = original;
    }
  });
});
