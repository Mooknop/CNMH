import React from 'react';
import { render, screen, within } from '@testing-library/react';
import ExplorationPartyBoard from './ExplorationPartyBoard';
import { usePartyActivity } from '../../hooks/usePartyActivity';

vi.mock('../../hooks/usePartyActivity', () => ({ usePartyActivity: vi.fn() }));

const character = { id: 'b', name: 'Blu Kakke' };
const party = [
  { char: { id: 'b', name: 'Blu Kakke', class: 'Monk' }, color: '#64b5f6', isYou: true, state: 'Scout', status: 'ready' },
  { char: { id: 'a', name: 'Ashka Gosh', class: 'Thaumaturge' }, color: '#9aa7b4', isYou: false, state: null, status: 'planning' },
];

beforeEach(() => {
  vi.clearAllMocks();
  usePartyActivity.mockReturnValue({ party, readyCount: 1, total: 2 });
});

describe('ExplorationPartyBoard', () => {
  it('subscribes to the exploration state with a pick-is-ready status', () => {
    render(<ExplorationPartyBoard character={character} />);
    const [stateType, opts] = usePartyActivity.mock.calls[0];
    expect(stateType).toBe('exploration');
    expect(opts.youId).toBe('b');
    expect(opts.deriveStatus('Scout')).toBe('ready');
    expect(opts.deriveStatus(null)).toBe('planning');
  });

  it('shows the presence rail tally with the "chosen" label', () => {
    const { container } = render(<ExplorationPartyBoard character={character} />);
    expect(container.querySelectorAll('.ppr-avatar')).toHaveLength(2);
    expect(container.querySelector('.ppr-count-n b').textContent).toBe('1');
    expect(screen.getByText('chosen')).toBeInTheDocument();
  });

  it('renders one row per PC, the viewer first, with the chosen-activity chip', () => {
    const { container } = render(<ExplorationPartyBoard character={character} />);
    const rows = container.querySelectorAll('.plr');
    expect(rows).toHaveLength(2);
    expect(rows[0].classList.contains('is-you')).toBe(true);
    expect(within(rows[0]).getByText('Scout')).toBeInTheDocument();
    expect(within(rows[0]).getByText('You')).toBeInTheDocument();
  });

  it('shows a muted placeholder for a PC who has not chosen', () => {
    const { container } = render(<ExplorationPartyBoard character={character} />);
    const theirRow = container.querySelectorAll('.plr')[1];
    expect(within(theirRow).getByText('deciding…')).toBeInTheDocument();
    expect(theirRow.querySelector('.epb-chip--empty')).not.toBeNull();
  });

  it('renders nothing when there is no party', () => {
    usePartyActivity.mockReturnValue({ party: [], readyCount: 0, total: 0 });
    const { container } = render(<ExplorationPartyBoard character={character} />);
    expect(container.firstChild).toBeNull();
  });
});
