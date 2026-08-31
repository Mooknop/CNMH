import React from 'react';
import { act, fireEvent, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { saveDocument } from '../../../utils/gmApi';
import ReputationView from './ReputationView';

// Downtime dock — Reputation view, no-scroll ladder re-layout (#1855). Moved
// out of DockDowntimePane.test.jsx (which covered the pre-redesign row list,
// #1850) now that the view has its own real markup worth testing on its own —
// the shell/rail-switching coverage stays in DockDowntimePane.test.jsx.
//
// Everything runs against the REAL provider stack (renderWithProviders): the
// `faction` collection rides ContentProvider's initialContent seam, the
// session log rides the in-memory session bus through the real
// useSyncedState, and the rank/tone/ladder math is the real
// utils/reputation.js. The only mock is the GM content API (spread from the
// original module so a new export can't break this factory); `fetch` is
// stubbed because the commit handler calls ContentContext's real `refresh()`.
vi.mock('../../../utils/gmApi', async (importOriginal) => ({
  ...(await importOriginal()),
  saveDocument: vi.fn(),
}));

// Same ladder as utils/reputation.test.js's fixture — covers a NON-GMG rank
// name ("Neutral", not "Ignored") so the abbreviation-derivation test proves
// it reads the faction's own ranks rather than hard-coding the GMG table.
const FACTION = {
  id: 'scarnetti-consortium',
  name: 'Scarnetti Consortium',
  reputation: 0,
  ranks: [
    { name: 'Hunted', min: -50, max: -30 },
    { name: 'Disliked', min: -29, max: -10, effect: 'Prices rise 10% at Consortium-run shops.' },
    { name: 'Neutral', min: -9, max: 9 },
    { name: 'Friendly', min: 10, max: 29 },
    { name: 'Revered', min: 30, max: 50 },
  ],
};

const mount = ({ factions = [FACTION], ...rest } = {}) =>
  renderWithProviders(<ReputationView />, {
    content: { faction: factions },
    ...rest,
  });

const factionRow = (result, id = FACTION.id) =>
  within(result.container).getByTestId(`dock-dt-faction-${id}`);

const ladderSegs = (row) => row.querySelectorAll('.dock-dt-ladder-seg');
const activeSeg = (row) => row.querySelector('.dock-dt-ladder-seg--active');
const marker = (row) => row.querySelector('.dock-dt-ladder-marker');

const lastLogWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'sessionlog')?.value ?? [];

beforeEach(() => {
  window.localStorage.clear();
  saveDocument.mockResolvedValue({});
  // See header note — the commit handler's refresh() hits this.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ReputationView — ladder segments (#1855)', () => {
  it('derives segments from the faction\'s own ranks, worst to best, with 3-letter abbreviations', () => {
    const r = mount();
    const segs = ladderSegs(factionRow(r));

    expect(segs).toHaveLength(5);
    expect([...segs].map((s) => s.textContent)).toEqual(['Hun', 'Dis', 'Neu', 'Fri', 'Rev']);
    expect([...segs].map((s) => s.getAttribute('title'))).toEqual([
      'Hunted',
      'Disliked',
      'Neutral',
      'Friendly',
      'Revered',
    ]);
  });

  it('falls back to the 7-band GMG ladder for a faction authored with no ranks', () => {
    const r = mount({ factions: [{ id: 'unaligned', name: 'Unaligned', reputation: 0 }] });
    const segs = ladderSegs(factionRow(r, 'unaligned'));

    expect([...segs].map((s) => s.textContent)).toEqual([
      'Hun', 'Hat', 'Dis', 'Ign', 'Lik', 'Adm', 'Rev',
    ]);
  });

  it('marks the segment containing the score active, tinted by that band\'s own sign', () => {
    // Neutral (interior band) — active, neutral tone.
    const neutral = mount({ factions: [{ ...FACTION, reputation: 0 }] });
    const neutralActive = activeSeg(factionRow(neutral));
    expect(neutralActive).toHaveAttribute('title', 'Neutral');
    expect(neutralActive).toHaveClass('dock-dt-ladder-seg--neutral');

    // Friendly (min >= 5) — active, positive tone.
    const friendly = mount({ factions: [{ ...FACTION, reputation: 12 }] });
    const friendlyActive = activeSeg(factionRow(friendly));
    expect(friendlyActive).toHaveAttribute('title', 'Friendly');
    expect(friendlyActive).toHaveClass('dock-dt-ladder-seg--positive');

    // Hunted (max <= -5) — active, negative tone.
    const hunted = mount({ factions: [{ ...FACTION, reputation: -40 }] });
    const huntedActive = activeSeg(factionRow(hunted));
    expect(huntedActive).toHaveAttribute('title', 'Hunted');
    expect(huntedActive).toHaveClass('dock-dt-ladder-seg--negative');
  });

  it('places the marker by the score\'s position in the ladder\'s outer bounds, at the boundary scores', () => {
    // FACTION's ladder spans -50..50 (its ranks cover the full GMG span).
    const bottom = mount({ factions: [{ ...FACTION, reputation: -50 }] });
    expect(marker(factionRow(bottom)).style.left).toBe('0%');

    const mid = mount({ factions: [{ ...FACTION, reputation: 0 }] });
    expect(marker(factionRow(mid)).style.left).toBe('50%');

    const top = mount({ factions: [{ ...FACTION, reputation: 50 }] });
    expect(marker(factionRow(top)).style.left).toBe('100%');
  });
});

describe('ReputationView — badge and score coloring (#1855)', () => {
  it('renders the rank name and a positive tone above +4', () => {
    const r = mount({ factions: [{ ...FACTION, reputation: 12 }] });
    const row = factionRow(r);
    expect(within(row).getByText('Friendly')).toHaveClass('dock-dt-rep-badge--positive');
    expect(within(row).getByText('+12')).toHaveClass('dock-dt-rep-score--positive');
  });

  it('renders a negative tone below -4', () => {
    const r = mount({ factions: [{ ...FACTION, reputation: -15 }] });
    const row = factionRow(r);
    expect(within(row).getByText('Disliked')).toHaveClass('dock-dt-rep-badge--negative');
    expect(within(row).getByText('-15')).toHaveClass('dock-dt-rep-score--negative');
  });

  it('renders a neutral tone in between, and 0 with no sign', () => {
    const r = mount({ factions: [{ ...FACTION, reputation: 0 }] });
    const row = factionRow(r);
    expect(within(row).getByText('Neutral')).toHaveClass('dock-dt-rep-badge--neutral');
    expect(within(row).getByText('0')).toHaveClass('dock-dt-rep-score--neutral');
  });

  it('shows "Off ladder" (not no badge) when the score falls outside every authored rank', () => {
    // FACTION's ranks stop at 50; 51 is off the end.
    const r = mount({ factions: [{ ...FACTION, reputation: 51 }] });
    const row = factionRow(r);
    // Still positive-toned (sign is a function of the score, not the rank).
    expect(within(row).getByText('Off ladder')).toHaveClass('dock-dt-rep-badge--positive');
  });

  it('shows the current rank\'s effect text, or the fallback when none is authored', () => {
    const disliked = mount({ factions: [{ ...FACTION, reputation: -15 }] });
    expect(
      within(factionRow(disliked)).getByText('Prices rise 10% at Consortium-run shops.')
    ).toBeInTheDocument();

    const neutral = mount({ factions: [{ ...FACTION, reputation: 0 }] });
    expect(
      within(factionRow(neutral)).getByText('No active effect at this rank.')
    ).toBeInTheDocument();
  });
});

describe('ReputationView — steppers and clamping (#1855)', () => {
  it('clamps the steppers at the ladder\'s outer bounds', () => {
    const top = mount({ factions: [{ ...FACTION, reputation: 50 }] });
    expect(
      within(factionRow(top)).getByRole('button', { name: `Raise ${FACTION.name} reputation` })
    ).toBeDisabled();

    const bottom = mount({ factions: [{ ...FACTION, reputation: -50 }] });
    expect(
      within(factionRow(bottom)).getByRole('button', { name: `Lower ${FACTION.name} reputation` })
    ).toBeDisabled();
  });

  it('falls back to a +-50 ladder for a faction authored with no ranks', () => {
    const r = mount({ factions: [{ id: 'unaligned', name: 'Unaligned', reputation: 0 }] });
    const row = factionRow(r, 'unaligned');
    expect(
      within(row).getByRole('button', { name: 'Raise Unaligned reputation' })
    ).toBeEnabled();
    expect(
      within(row).getByRole('button', { name: 'Lower Unaligned reputation' })
    ).toBeEnabled();
  });

  it('collapses a burst of taps into ONE debounced saveDocument call', () => {
    vi.useFakeTimers();
    try {
      const r = mount();
      const raise = within(factionRow(r)).getByRole('button', {
        name: `Raise ${FACTION.name} reputation`,
      });

      fireEvent.click(raise);
      fireEvent.click(raise);
      fireEvent.click(raise);
      // Each tap shows immediately (optimistic) — no write has landed yet.
      expect(within(factionRow(r)).getByText('+3')).toBeInTheDocument();
      expect(saveDocument).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(saveDocument).toHaveBeenCalledTimes(1);
      expect(saveDocument).toHaveBeenCalledWith(
        'faction',
        FACTION.id,
        expect.objectContaining({ id: FACTION.id, reputation: 3 })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a rank change once the committed value crosses a boundary', () => {
    vi.useFakeTimers();
    try {
      // Neutral, top edge.
      const r = mount({ factions: [{ ...FACTION, reputation: 9 }] });
      fireEvent.click(
        within(factionRow(r)).getByRole('button', { name: `Raise ${FACTION.name} reputation` })
      );

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(lastLogWrite(r.session)[0]).toEqual(
        expect.objectContaining({
          type: 'reputation',
          text: 'Reputation: Scarnetti Consortium rose to Friendly (10)',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays silent when a committed change lands in the same rank', () => {
    vi.useFakeTimers();
    try {
      // Neutral, interior.
      const r = mount({ factions: [{ ...FACTION, reputation: 0 }] });
      fireEvent.click(
        within(factionRow(r)).getByRole('button', { name: `Raise ${FACTION.name} reputation` })
      );

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(saveDocument).toHaveBeenCalledTimes(1);
      expect(lastLogWrite(r.session)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('ReputationView — no radar on this screen (#1855)', () => {
  it('never renders a radar toggle or the radar chart', () => {
    const r = mount();
    expect(
      within(r.container).queryByRole('button', { name: /radar/i })
    ).not.toBeInTheDocument();
    expect(within(r.container).queryByTestId('dock-dt-rep-radar')).not.toBeInTheDocument();
  });
});

