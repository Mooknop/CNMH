import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';

vi.mock('../shared/Modal', () => ({
  default: ({ isOpen, title, children }) =>
    isOpen ? <div data-testid="modal"><h2>{title}</h2>{children}</div> : null,
}));

vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => { store[key] = typeof u === 'function' ? u(store[key]) : u; subs.forEach((f) => f()); };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
    __set: (k, v) => { store[k] = v; subs.forEach((f) => f()); },
    __get: (k) => store[k],
  };
});

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
const mockSend = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSend }),
}));

import { __reset, __set, __get } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import AddSummonModal from './AddSummonModal';

const SPELLS = [{
  id: 'sp-su', name: 'Summon Undead', level: 1,
  heightened: { '2nd': 'up to Level 1.', '5th': 'The creature can be up to Level 5.' },
}];
const POOL = [{
  key: 'a-zombie', name: 'Zombie Shambler', level: 1, hp: { max: 24 },
  defenses: { ac: 12, saves: { fortitude: 7, reflex: 2, will: 4 } }, traits: ['undead'], img: null,
}];
const SUSTAIN = { id: 's1', spellId: 'sp-su', spellName: 'Summon Undead', castRank: 5, lastSustainedRound: 1 };

beforeEach(() => {
  __reset();
  mockSend.mockClear();
  useContent.mockReturnValue({ characters: [{ id: 'Izzy', name: 'Izzy' }], spells: SPELLS });
});

const open = () => render(<AddSummonModal isOpen onClose={() => {}} />);

describe('AddSummonModal (#261)', () => {
  it('refresh requests a fresh pool when the Summons folder is empty', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(mockSend).toHaveBeenCalledWith('global', 'summonpoolreq', expect.anything());
  });

  it('shows the heightening level cap for the linked sustain', () => {
    act(() => {
      __set('cnmh_summonpool_global', POOL);
      __set('cnmh_sustains_Izzy', [SUSTAIN]);
    });
    open();
    fireEvent.change(screen.getByLabelText('summon caster'), { target: { value: 'Izzy' } });
    fireEvent.change(screen.getByLabelText('linked sustain'), { target: { value: 's1' } });
    // Summon Undead cast at rank 5 → "up to Level 5"
    expect(screen.getByText(/up to Level 5/i)).toBeInTheDocument();
  });

  it('adds a summon copying the pool creature stats, linked to the sustain', () => {
    act(() => {
      __set('cnmh_summonpool_global', POOL);
      __set('cnmh_sustains_Izzy', [SUSTAIN]);
    });
    open();
    fireEvent.change(screen.getByLabelText('summon caster'), { target: { value: 'Izzy' } });
    fireEvent.change(screen.getByLabelText('linked sustain'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('summon creature'), { target: { value: 'a-zombie' } });
    fireEvent.click(screen.getByLabelText('Add summon to encounter'));

    const summons = __get('cnmh_summons_global');
    expect(summons).toHaveLength(1);
    expect(summons[0]).toMatchObject({
      kind: 'summon', name: 'Zombie Shambler', level: 1,
      casterId: 'Izzy', casterName: 'Izzy', sustainId: 's1', spellName: 'Summon Undead',
    });
    expect(summons[0].defenses.ac).toBe(12);
    expect(summons[0].bestiary.hp).toEqual({ current: 24, max: 24 });
  });
});
