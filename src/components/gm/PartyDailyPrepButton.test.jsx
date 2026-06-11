import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const store = {
  'char-izzy': { focus: 2, eldattune: 'Astral' },
  'char-blu':  { slots: { 1: 1 } },
};
const mockGetState = vi.fn((id, key) => store[id]?.[key]);
const mockSendUpdate = vi.fn((id, key, value) => {
  if (!store[id]) store[id] = {};
  store[id][key] = value;
});
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

const characters = [
  { id: 'char-izzy', name: 'Izzy', spellcasting: { eldPowers: [{ source: 'Ley Line' }, { source: 'Astral' }] } },
  { id: 'char-blu', name: 'Blu' },
];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters }),
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
vi.mock('../shared/ConfirmDialog', () => ({
  default: ({ isOpen, onConfirm, confirmLabel }) =>
    isOpen ? <button onClick={onConfirm}>{confirmLabel}</button> : null,
}));

import PartyDailyPrepButton from './PartyDailyPrepButton';

beforeEach(() => { vi.clearAllMocks(); });

describe('PartyDailyPrepButton', () => {
  it('confirms then runs daily prep for every character', () => {
    render(<PartyDailyPrepButton />);
    fireEvent.click(screen.getByText('Daily Preparations (party)'));
    fireEvent.click(screen.getByText('Prepare party'));

    // Izzy's focus reset, Blu's slots reset.
    expect(store['char-izzy'].focus).toBe(0);
    expect(store['char-blu'].slots).toEqual({ 1: 0 });
  });

  it('carries each character existing Eld attunement', () => {
    render(<PartyDailyPrepButton />);
    fireEvent.click(screen.getByText('Daily Preparations (party)'));
    fireEvent.click(screen.getByText('Prepare party'));

    // Izzy's attunement is re-written unchanged; Blu (no Eld) never gets the key.
    const izzyWrite = mockSendUpdate.mock.calls.find((c) => c[0] === 'char-izzy' && c[1] === 'eldattune');
    expect(izzyWrite[2]).toBe('Astral');
    expect(mockSendUpdate.mock.calls.some((c) => c[0] === 'char-blu' && c[1] === 'eldattune')).toBe(false);
  });

  it('logs exactly one party-level summary line', () => {
    render(<PartyDailyPrepButton />);
    fireEvent.click(screen.getByText('Daily Preparations (party)'));
    fireEvent.click(screen.getByText('Prepare party'));

    expect(mockAppendEvent).toHaveBeenCalledTimes(1);
    expect(mockAppendEvent).toHaveBeenCalledWith({
      type: 'rest',
      text: 'GM: party made daily preparations',
    });
  });
});
