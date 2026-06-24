import React from 'react';
import { render, screen } from '@testing-library/react';
import PartyPresenceRail from './PartyPresenceRail';

const party = [
  { char: { id: 'b', name: 'Blu Kakke' }, color: '#64b5f6', isYou: true, status: 'planning' },
  { char: { id: 'a', name: 'Ashka Gosh' }, color: '#9aa7b4', isYou: false, status: 'ready' },
];

describe('PartyPresenceRail', () => {
  it('renders an avatar per PC with the right status dot', () => {
    const { container } = render(<PartyPresenceRail party={party} readyCount={1} total={2} />);
    expect(container.querySelectorAll('.ppr-avatar')).toHaveLength(2);
    expect(container.querySelectorAll('.ppr-status.ready')).toHaveLength(1);
    expect(container.querySelectorAll('.ppr-status.planning')).toHaveLength(1);
  });

  it('rings the viewer avatar', () => {
    const { container } = render(<PartyPresenceRail party={party} readyCount={1} total={2} />);
    const avatars = container.querySelectorAll('.ppr-avatar');
    expect(avatars[0].classList.contains('is-you')).toBe(true);
    expect(avatars[1].classList.contains('is-you')).toBe(false);
  });

  it('shows the tally with the given label', () => {
    const { container } = render(<PartyPresenceRail party={party} readyCount={1} total={2} label="locked in" />);
    const tally = container.querySelector('.ppr-count-n');
    expect(tally.querySelector('b').textContent).toBe('1');
    expect(tally.textContent).toContain('/2');
    expect(screen.getByText('locked in')).toBeInTheDocument();
  });

  it('defaults the label to "ready"', () => {
    render(<PartyPresenceRail party={party} readyCount={1} total={2} />);
    expect(screen.getByText('ready')).toBeInTheDocument();
  });
});
