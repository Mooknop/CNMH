import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import GiveGoldModal from './GiveGoldModal';

const mockGive = vi.fn();
let myGold = 100;
vi.mock('../../hooks/useGiveGold', () => ({
  useGiveGold: () => ({ myGold, give: mockGive }),
}));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

let roster = [];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: roster }),
}));

const giver = { id: 'a', name: 'Ashka' };

beforeEach(() => {
  vi.clearAllMocks();
  myGold = 100;
  roster = [
    { id: 'a', name: 'Ashka' },
    { id: 'b', name: 'Pellias' },
    { id: 'c', name: 'Jade' },
  ];
  mockGive.mockReturnValue(true);
});

const open = (props = {}) =>
  render(<GiveGoldModal isOpen onClose={vi.fn()} character={giver} {...props} />);

describe('GiveGoldModal', () => {
  it('shows the giver balance', () => {
    open();
    expect(screen.getByText(/100 gp/)).toBeInTheDocument();
  });

  it('lists every party member except the giver as a recipient', () => {
    open();
    expect(screen.getByRole('button', { name: 'Pellias' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Jade' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ashka' })).not.toBeInTheDocument();
  });

  it('disables Give until a recipient and a valid amount are chosen', () => {
    open();
    const submit = screen.getByTestId('give-gold-submit');
    expect(submit).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Pellias' }));
    expect(submit).toBeDisabled(); // still no amount

    fireEvent.change(screen.getByLabelText('Amount to give'), { target: { value: '20' } });
    expect(submit).toBeEnabled();
  });

  it('keeps Give disabled when the amount exceeds the balance', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Pellias' }));
    fireEvent.change(screen.getByLabelText('Amount to give'), { target: { value: '500' } });
    expect(screen.getByTestId('give-gold-submit')).toBeDisabled();
  });

  it('gives, logs, and closes on submit', () => {
    const onClose = vi.fn();
    open({ onClose });
    fireEvent.click(screen.getByRole('button', { name: 'Jade' }));
    fireEvent.change(screen.getByLabelText('Amount to give'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('give-gold-submit'));

    expect(mockGive).toHaveBeenCalledWith('c', 15);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'action', text: 'Ashka gave 15 gp to Jade' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('does not log when the transfer is rejected by the hook', () => {
    mockGive.mockReturnValue(false);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Pellias' }));
    fireEvent.change(screen.getByLabelText('Amount to give'), { target: { value: '15' } });
    fireEvent.click(screen.getByTestId('give-gold-submit'));
    expect(mockAppendEvent).not.toHaveBeenCalled();
  });

  it('shows an empty-state message when the giver is the only party member', () => {
    roster = [{ id: 'a', name: 'Ashka' }];
    open();
    expect(screen.getByText(/No other party members/)).toBeInTheDocument();
    expect(screen.queryByTestId('give-gold-submit')).not.toBeInTheDocument();
  });
});
