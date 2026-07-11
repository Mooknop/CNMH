import React from 'react';
import { render, screen, within } from '@testing-library/react';
import DowntimePartyLedger from './DowntimePartyLedger';
import { usePartyDowntime } from '../../hooks/usePartyDowntime';

vi.mock('../../hooks/usePartyDowntime', () => ({ usePartyDowntime: vi.fn() }));

const block = { days: 7, active: true, startedAt: 'P1' };
const character = { id: 'b', name: 'Blu Kakke' };

const party = [
  {
    char: { id: 'b', name: 'Blu Kakke', class: 'Monk' }, color: '#64b5f6', isYou: true,
    plan: { Research: 3, 'Earn Income': 1 }, status: 'planning', paired: {},
  },
  {
    char: { id: 'a', name: 'Ashka Gosh', class: 'Thaumaturge' }, color: '#9aa7b4', isYou: false,
    plan: { Crafting: 4 }, status: 'ready', paired: { Crafting: true },
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  usePartyDowntime.mockReturnValue({ party, readyCount: 1, total: 2 });
});

describe('DowntimePartyLedger', () => {
  it('renders a presence avatar per PC with the right lock status', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    expect(container.querySelectorAll('.ppr-avatar')).toHaveLength(2);
    expect(container.querySelectorAll('.ppr-status.ready')).toHaveLength(1);
    expect(container.querySelectorAll('.ppr-status.planning')).toHaveLength(1);
  });

  it('shows the locked-in tally', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    expect(screen.getByText('locked in')).toBeInTheDocument();
    const tally = container.querySelector('.ppr-count-n');
    expect(tally.querySelector('b').textContent).toBe('1'); // readyCount
    expect(tally.textContent).toContain('/2');
  });

  it('renders a day ruler spanning the block budget', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    expect(container.querySelectorAll('.dpl-tick')).toHaveLength(7);
  });

  it('renders one row per PC, the viewer first with a You tag', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    const rows = container.querySelectorAll('.plr');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('is-you')).toBe(true);
    expect(within(rows[0]).getByText('You')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Blu')).toBeInTheDocument();
    expect(within(rows[0]).getByText('Monk')).toBeInTheDocument();
  });

  it('builds a ribbon: assigned blocks with labels + a trailing free block', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    const myRibbon = container.querySelectorAll('.plr')[0].querySelector('.dpl-ribbon');
    // Research 3 + Earn Income 1 = 4 used, 3 free ⇒ 3 segments
    expect(myRibbon.querySelectorAll('.dpl-seg')).toHaveLength(3);
    expect(myRibbon.querySelectorAll('.dpl-seg.assigned')).toHaveLength(2);
    expect(myRibbon.querySelectorAll('.dpl-seg.free')).toHaveLength(1);
    expect(within(myRibbon).getByText('Research')).toBeInTheDocument();
  });

  it('marks a paired block with the ✦ thread', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    const theirRibbon = container.querySelectorAll('.plr')[1].querySelector('.dpl-ribbon');
    expect(theirRibbon.querySelector('.dpl-seg.paired')).not.toBeNull();
    expect(theirRibbon.querySelector('.dpl-seg-mark')).not.toBeNull();
  });

  it('renders a legend entry for each activity plus Free', () => {
    const { container } = render(<DowntimePartyLedger character={character} block={block} />);
    // 5 activities + Free
    expect(container.querySelectorAll('.dpl-legend-item')).toHaveLength(6);
    expect(screen.getByText('Free')).toBeInTheDocument();
  });
});
