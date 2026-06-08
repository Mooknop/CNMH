import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SetDateTimeModal from './SetDateTimeModal';

const mockSetSpecificDate = vi.fn();
const mockGameDate = { day: 5, month: 2, year: 4725 };
const mockTime = { hour: 8, minute: 0, second: 0 };

const GOLARION_MONTHS = [
  { name: 'Abadius', days: 31, index: 0 },
  { name: 'Calistril', days: 28, index: 1 },
  { name: 'Pharast', days: 31, index: 2 },
  { name: 'Gozran', days: 30, index: 3 },
  { name: 'Desnus', days: 31, index: 4 },
  { name: 'Sarenith', days: 30, index: 5 },
  { name: 'Erastus', days: 31, index: 6 },
  { name: 'Arodus', days: 31, index: 7 },
  { name: 'Rova', days: 30, index: 8 },
  { name: 'Lamashan', days: 31, index: 9 },
  { name: 'Neth', days: 30, index: 10 },
  { name: 'Kuthona', days: 31, index: 11 },
];

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: mockGameDate,
    time: mockTime,
    GOLARION_MONTHS,
    setSpecificDate: mockSetSpecificDate,
  }),
}));

const onClose = vi.fn();

const renderOpen = () => render(<SetDateTimeModal isOpen={true} onClose={onClose} />);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('SetDateTimeModal', () => {
  it('renders when isOpen is true', () => {
    renderOpen();
    expect(screen.getByRole('heading', { name: 'Set date & time' })).toBeInTheDocument();
  });

  it('does not render when isOpen is false', () => {
    render(<SetDateTimeModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByRole('heading', { name: 'Set date & time' })).not.toBeInTheDocument();
  });

  it('seeds fields from the current clock', () => {
    renderOpen();
    expect(screen.getByLabelText('Day')).toHaveValue(5);
    expect(screen.getByLabelText('Year')).toHaveValue(4725);
    expect(screen.getByLabelText('Hour')).toHaveValue(8);
    expect(screen.getByLabelText('Minute')).toHaveValue(0);
    expect(screen.getByLabelText('Month')).toHaveValue('2');
  });

  it('lists all 12 Golarion months in the select', () => {
    renderOpen();
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(12);
    expect(options[0]).toHaveTextContent('Abadius');
    expect(options[11]).toHaveTextContent('Kuthona');
  });

  it('clicking Set calls setSpecificDate with entered values and closes', () => {
    renderOpen();
    fireEvent.change(screen.getByLabelText('Day'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Month'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Year'), { target: { value: '4726' } });
    fireEvent.change(screen.getByLabelText('Hour'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('Minute'), { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    expect(mockSetSpecificDate).toHaveBeenCalledWith(15, 5, 4726, 14, 30);
    expect(onClose).toHaveBeenCalled();
  });

  it('clicking Cancel closes without calling setSpecificDate', () => {
    renderOpen();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(mockSetSpecificDate).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('Set button is present and enabled with valid default values', () => {
    renderOpen();
    expect(screen.getByRole('button', { name: 'Set' })).not.toBeDisabled();
  });
});
