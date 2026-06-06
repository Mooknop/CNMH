import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeControl from './DowntimeControl';

const mockAdvanceHours = jest.fn();
const mockAdvanceDays = jest.fn();

jest.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    advanceHours: mockAdvanceHours,
    advanceDays: mockAdvanceDays,
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
  }),
}));

beforeEach(() => {
  jest.clearAllMocks();
});

describe('DowntimeControl', () => {
  it('renders the three quick-advance buttons', () => {
    render(<DowntimeControl />);
    expect(screen.getByRole('button', { name: '+1 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+8 hr' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+1 day' })).toBeInTheDocument();
  });

  it('+1 hr calls advanceHours(1)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '+1 hr' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(1);
  });

  it('+8 hr calls advanceHours(8)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '+8 hr' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(8);
  });

  it('+1 day calls advanceDays(1)', () => {
    render(<DowntimeControl />);
    fireEvent.click(screen.getByRole('button', { name: '+1 day' }));
    expect(mockAdvanceDays).toHaveBeenCalledWith(1);
  });

  it('Apply button is disabled when input is empty', () => {
    render(<DowntimeControl />);
    expect(screen.getByRole('button', { name: 'Apply' })).toBeDisabled();
  });

  it('custom hours: entering a value and clicking Apply calls advanceHours', () => {
    render(<DowntimeControl />);
    fireEvent.change(screen.getByLabelText('Custom duration'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mockAdvanceHours).toHaveBeenCalledWith(3);
  });

  it('custom days: switching unit to days and applying calls advanceDays', () => {
    render(<DowntimeControl />);
    fireEvent.change(screen.getByLabelText('Custom duration'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Duration unit'), { target: { value: 'days' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(mockAdvanceDays).toHaveBeenCalledWith(5);
  });

  it('pressing Enter in the input applies the custom value', () => {
    render(<DowntimeControl />);
    const input = screen.getByLabelText('Custom duration');
    fireEvent.change(input, { target: { value: '2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(mockAdvanceHours).toHaveBeenCalledWith(2);
  });

  it('clears the input after applying', () => {
    render(<DowntimeControl />);
    const input = screen.getByLabelText('Custom duration');
    fireEvent.change(input, { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect(input.value).toBe('');
  });

  it('shows the current date and time', () => {
    render(<DowntimeControl />);
    expect(screen.getByText(/5 Pharast.*08:00/)).toBeInTheDocument();
  });
});
