import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const listeners = new Set();
  const useSyncedState = (key, init) => {
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const [, rerender] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => {
      listeners.add(rerender);
      return () => listeners.delete(rerender);
    }, []);
    const setValue = (updater) => {
      store[key] = typeof updater === 'function' ? updater(store[key]) : updater;
      listeners.forEach((fn) => fn());
    };
    return [store[key], setValue];
  };
  return {
    __esModule: true,
    useSyncedState,
    __store: store,
    __reset: () => { Object.keys(store).forEach((k) => delete store[k]); },
  };
});

vi.mock('../../hooks/usePartyGold', () => ({
  usePartyGold: vi.fn(() => ({ goldById: {}, total: 142 })),
}));

import { useContent } from '../../contexts/ContentContext';
import { __store, __reset } from '../../hooks/useSyncedState';
import PartyGoldModal from './PartyGoldModal';

const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
];

beforeEach(() => {
  __reset();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

describe('PartyGoldModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<PartyGoldModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders an editable row per character', () => {
    render(<PartyGoldModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Party Gold')).toBeInTheDocument();
    expect(screen.getByLabelText('Thorn gold')).toBeInTheDocument();
    expect(screen.getByLabelText('Lira gold')).toBeInTheDocument();
  });

  it('seeds each row from its cnmh_gold_<id> key', () => {
    __store['cnmh_gold_thorn'] = 50;
    render(<PartyGoldModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByLabelText('Thorn gold').value).toBe('50');
  });

  it('writes the edited value to the right synced key', () => {
    render(<PartyGoldModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Lira gold'), { target: { value: '120' } });
    expect(__store['cnmh_gold_lira']).toBe(120);
  });

  it('coerces an empty input to 0', () => {
    __store['cnmh_gold_thorn'] = 30;
    render(<PartyGoldModal isOpen={true} onClose={() => {}} />);
    fireEvent.change(screen.getByLabelText('Thorn gold'), { target: { value: '' } });
    expect(__store['cnmh_gold_thorn']).toBe(0);
  });

  it('shows the party total from usePartyGold', () => {
    render(<PartyGoldModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('142 gp')).toBeInTheDocument();
  });
});
