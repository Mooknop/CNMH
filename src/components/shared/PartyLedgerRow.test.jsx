import React from 'react';
import { render, screen, within } from '@testing-library/react';
import PartyLedgerRow from './PartyLedgerRow';

const char = { id: 'b', name: 'Blu Kakke' };

describe('PartyLedgerRow', () => {
  it('renders the mono initial, first name, and meta beside the body slot', () => {
    const { container } = render(
      <PartyLedgerRow char={char} color="#64b5f6" isYou={false} meta="Monk">
        <div data-testid="body">ribbon</div>
      </PartyLedgerRow>,
    );
    expect(container.querySelector('.plr-mono').textContent).toBe('B');
    expect(screen.getByText('Blu')).toBeInTheDocument();
    expect(screen.getByText('Monk')).toBeInTheDocument();
    expect(within(container.querySelector('.plr-body')).getByTestId('body')).toBeInTheDocument();
  });

  it('adds the You tag and is-you emphasis for the viewer', () => {
    const { container } = render(
      <PartyLedgerRow char={char} color="#64b5f6" isYou meta="Monk"><span /></PartyLedgerRow>,
    );
    expect(container.querySelector('.plr').classList.contains('is-you')).toBe(true);
    expect(screen.getByText('You')).toBeInTheDocument();
  });

  it('omits the meta line when none is given', () => {
    const { container } = render(
      <PartyLedgerRow char={char} color="#64b5f6" isYou={false}><span /></PartyLedgerRow>,
    );
    expect(container.querySelector('.plr-meta')).toBeNull();
    expect(screen.queryByText('You')).not.toBeInTheDocument();
  });
});
