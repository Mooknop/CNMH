import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const store = {};
const mockGetState = vi.fn((id, key) => store[id]?.[key]);
const mockSendUpdate = vi.fn((id, key, value) => {
  if (!store[id]) store[id] = {};
  store[id][key] = value;
});
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));
const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));
vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, children, title }) =>
    isOpen ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null,
}));

import DailyPrepModal from './DailyPrepModal';

const seed = (id, state) => { store[id] = { ...state }; };

const baseProps = { isOpen: true, onClose: vi.fn(), themeColor: '#4a90d9' };

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(store).forEach((k) => delete store[k]);
});

describe('DailyPrepModal', () => {
  const character = {
    id: 'char-izzy',
    name: 'Izzy',
    spellcasting: { eldPowers: [{ source: 'Ley Line' }, { source: 'Astral' }] },
  };

  it('lists the dirty resources that will be restored', () => {
    seed('char-izzy', { slots: { 1: 2 }, focus: 1 });
    render(<DailyPrepModal {...baseProps} character={character} />);
    expect(screen.getByText('spell slots')).toBeInTheDocument();
    expect(screen.getByText('focus points')).toBeInTheDocument();
  });

  it('shows the full-resources message when nothing is dirty', () => {
    render(<DailyPrepModal {...baseProps} character={character} />);
    expect(screen.getByText('All daily resources are already full.')).toBeInTheDocument();
  });

  it('renders the Eld attunement picker only for Eld characters', () => {
    render(<DailyPrepModal {...baseProps} character={character} />);
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Ley Line' })).toBeInTheDocument();
  });

  it('omits the Eld picker for a non-Eld character', () => {
    render(<DailyPrepModal {...baseProps} character={{ id: 'char-blu', name: 'Blu' }} />);
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('prepares a held staff and stores the day\'s charges on confirm', () => {
    const caster = {
      id: 'char-bard',
      name: 'Bard',
      spellcasting: { spell_slots: { 1: 4, 2: 4 } },
      staves: [{ id: 'lute', name: "Entertainer's Lute" }],
    };
    render(<DailyPrepModal {...baseProps} character={caster} />);
    fireEvent.change(screen.getByLabelText('Prepare a staff'), { target: { value: 'lute' } });
    fireEvent.click(screen.getByText('Prepare'));
    expect(store['char-bard'].staffprep).toEqual({ staffId: 'lute', charges: 2 });
    expect(store['char-bard'].staff).toBe(0);
  });

  it('omits the staff picker for a character holding no staves', () => {
    render(<DailyPrepModal {...baseProps} character={character} />);
    expect(screen.queryByLabelText('Prepare a staff')).toBeNull();
  });

  it('folds expended slots into the prepared staff\'s charges (#957 S6b)', () => {
    const caster = {
      id: 'char-bard',
      name: 'Bard',
      spellcasting: { spell_slots: { 1: 4, 2: 4 } },
      staves: [{ id: 'lute', name: "Entertainer's Lute" }],
    };
    render(<DailyPrepModal {...baseProps} character={caster} />);
    fireEvent.change(screen.getByLabelText('Prepare a staff'), { target: { value: 'lute' } });
    fireEvent.click(screen.getByLabelText('Expend one more rank 2 slot'));
    fireEvent.click(screen.getByText('Prepare'));
    // base 2 (highest rank) + one rank-2 slot = 4 charges; that slot is spent.
    expect(store['char-bard'].staffprep).toEqual({ staffId: 'lute', charges: 4 });
    expect(store['char-bard'].slots).toEqual({ 1: 0, 2: 1 });
  });

  it('runs the prep and logs a summary on confirm', () => {
    seed('char-izzy', { focus: 2 });
    const onClose = vi.fn();
    render(<DailyPrepModal {...baseProps} onClose={onClose} character={character} />);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Astral' } });
    fireEvent.click(screen.getByText('Prepare'));

    expect(store['char-izzy'].focus).toBe(0);
    expect(store['char-izzy'].eldattune).toBe('Astral');
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'rest',
      text: expect.stringContaining('Izzy made daily preparations'),
    });
    expect(onClose).toHaveBeenCalled();
  });
});
