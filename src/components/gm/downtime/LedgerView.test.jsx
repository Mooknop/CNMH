import React from 'react';
import { screen, within } from '@testing-library/react';
import LedgerView from './LedgerView';
import { renderWithProviders, makeCharacter } from '../../../test/renderWithProviders';
import { DOWNTIME_ACTIVITIES } from '../../../data/downtimeActivities';

beforeEach(() => window.localStorage.clear());

const PERIOD = { day: 12, month: 5, year: 4725 };

const block = { active: true, days: 7, startedAt: PERIOD };

const pcA = makeCharacter({ id: 'pc-a', name: 'Ashka Gosh', class: 'Thaumaturge' });
const pcB = makeCharacter({ id: 'pc-b', name: 'Blu Kakke', class: 'Monk' });

const stamp = (patch) => ({ periodStartedAt: PERIOD, plan: {}, status: 'planning', paired: {}, ...patch });

function renderLedger({ characters = [pcA, pcB], downtime = {}, blockDoc = block } = {}) {
  return renderWithProviders(<LedgerView />, {
    content: { character: characters },
    session: {
      state: {
        global: { downtimeblock: blockDoc },
        ...Object.fromEntries(characters.map((c) => [c.id, { downtime: downtime[c.id] }])),
      },
    },
  });
}

describe('LedgerView', () => {
  it('renders the no-block placeholder when there is no open block', () => {
    renderLedger({ blockDoc: null });
    expect(screen.getByRole('status')).toHaveTextContent(/period view/i);
    expect(screen.queryByTestId('dock-dt-ledger-row-pc-a')).not.toBeInTheDocument();
  });

  it('renders the no-block placeholder when the block is inactive', () => {
    renderLedger({ blockDoc: { ...block, active: false } });
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders a legend entry per activity plus Free', () => {
    renderLedger();
    const legend = document.querySelector('.dock-dt-ledger-legend');
    const items = within(legend).getAllByRole('listitem');
    expect(items).toHaveLength(DOWNTIME_ACTIVITIES.length + 1);
    expect(within(legend).getByText('Free')).toBeInTheDocument();
    DOWNTIME_ACTIVITIES.forEach((a) => {
      expect(within(legend).getByText(a.name)).toBeInTheDocument();
    });
  });

  it('renders a day header cell per day of the granted block', () => {
    renderLedger();
    const days = document.querySelectorAll('.dock-dt-ledger-day');
    expect(days).toHaveLength(7);
    expect(days[0]).toHaveTextContent('1');
    expect(days[6]).toHaveTextContent('7');
  });

  it('renders one row per roster PC with name and class', () => {
    renderLedger();
    const rowA = screen.getByTestId('dock-dt-ledger-row-pc-a');
    expect(within(rowA).getByText('Ashka Gosh')).toBeInTheDocument();
    expect(within(rowA).getByText('Thaumaturge')).toBeInTheDocument();
    const rowB = screen.getByTestId('dock-dt-ledger-row-pc-b');
    expect(within(rowB).getByText('Blu Kakke')).toBeInTheDocument();
    expect(within(rowB).getByText('Monk')).toBeInTheDocument();
  });

  it('builds segments proportional to each committed activity plus a trailing free block', () => {
    renderLedger({
      downtime: { 'pc-a': stamp({ plan: { Research: 3, 'Earn Income': 1 } }) },
    });
    const row = screen.getByTestId('dock-dt-ledger-row-pc-a');
    const segs = row.querySelectorAll('.dock-dt-ledger-seg');
    // Earn Income 1 + Research 3 = 4 used, 3 free ⇒ 3 segments total.
    expect(segs).toHaveLength(3);
    expect(row.querySelectorAll('.dock-dt-ledger-seg--free')).toHaveLength(1);

    const researchSeg = within(row).getByText('Research').closest('.dock-dt-ledger-seg');
    expect(researchSeg.style.flexGrow).toBe('3');
    expect(within(researchSeg).getByText('3d')).toBeInTheDocument();
    expect(researchSeg).toHaveAttribute('title', 'Research · 3d');

    const freeSeg = row.querySelector('.dock-dt-ledger-seg--free');
    expect(within(freeSeg).getByText('Free')).toBeInTheDocument();
    expect(within(freeSeg).getByText('3d')).toBeInTheDocument();
    expect(freeSeg).toHaveAttribute('title', '3 free');
  });

  it('renders a single free segment spanning the whole block for an empty plan', () => {
    renderLedger();
    const row = screen.getByTestId('dock-dt-ledger-row-pc-a');
    const segs = row.querySelectorAll('.dock-dt-ledger-seg');
    expect(segs).toHaveLength(1);
    expect(segs[0].classList.contains('dock-dt-ledger-seg--free')).toBe(true);
    expect(segs[0].style.flexGrow).toBe('7');
  });

  it('reflects a shorter granted period in both the day header and the free block', () => {
    renderLedger({
      blockDoc: { active: true, days: 3, startedAt: PERIOD },
      downtime: { 'pc-a': stamp({ plan: { Research: 2 } }) },
    });
    expect(document.querySelectorAll('.dock-dt-ledger-day')).toHaveLength(3);
    const row = screen.getByTestId('dock-dt-ledger-row-pc-a');
    const freeSeg = row.querySelector('.dock-dt-ledger-seg--free');
    expect(freeSeg.style.flexGrow).toBe('1'); // 3 - 2 = 1 free day
  });
});
