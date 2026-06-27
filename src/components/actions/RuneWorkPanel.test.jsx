import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RuneWorkPanel from './RuneWorkPanel';

let mockOrders = [];
let mockNow = 0;
let mockLocation = 'sandpoint';
const mockCollect = vi.fn();
vi.mock('../../hooks/useRuneWork', () => ({
  useRuneWork: () => ({ orders: mockOrders, collect: mockCollect, nowSeconds: mockNow, locationId: mockLocation }),
}));

const order = (over = {}) => ({
  id: 'o1', weaponName: 'Longsword', runeName: 'Flaming',
  readyAtSeconds: 100, readyLocationId: 'sandpoint', ...over,
});

beforeEach(() => {
  mockOrders = []; mockNow = 0; mockLocation = 'sandpoint'; mockCollect.mockClear();
});

describe('RuneWorkPanel', () => {
  it('renders nothing with no orders', () => {
    const { container } = render(<RuneWorkPanel character={{ id: 'a' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('disables Collect while etching (turnaround not elapsed)', () => {
    mockOrders = [order()];
    mockNow = 50; // < readyAtSeconds
    render(<RuneWorkPanel character={{ id: 'a' }} />);
    expect(screen.getByText('Longsword')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();
  });

  it('disables Collect when ready but in the wrong town', () => {
    mockOrders = [order()];
    mockNow = 200; mockLocation = 'magnimar';
    render(<RuneWorkPanel character={{ id: 'a' }} />);
    expect(screen.getByRole('button', { name: 'Collect' })).toBeDisabled();
  });

  it('enables Collect and wires it when ready in town', () => {
    mockOrders = [order()];
    mockNow = 200; mockLocation = 'sandpoint';
    render(<RuneWorkPanel character={{ id: 'a' }} />);
    const btn = screen.getByRole('button', { name: 'Collect' });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    expect(mockCollect).toHaveBeenCalledWith('o1');
  });
});
