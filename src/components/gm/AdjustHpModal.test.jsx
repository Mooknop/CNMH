import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

// useEncounter is only used here for appendLog; isolate it from the session/
// content machinery and expose the spy for assertions (#275).
const { appendLogMock } = vi.hoisted(() => ({ appendLogMock: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({
  __esModule: true,
  useEncounter: () => ({ appendLog: appendLogMock }),
}));

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

import { useContent } from '../../contexts/ContentContext';
import { __store, __reset } from '../../hooks/useSyncedState';
import AdjustHpModal from './AdjustHpModal';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
];

const THORN_HP = { current: 20, max: 40, temp: 0, dying: 0, wounded: 0, doomed: 0 };
const THORN_HP_WITH_TEMP = { ...THORN_HP, temp: 5 };

// Ashka fields an animal companion (Zevira, hp 32) — exercises the #261 minion path.
const ASHKA = { id: 'ashka', name: 'Ashka', animalCompanion: { name: 'Zevira', hp: 32 } };

beforeEach(() => {
  __reset();
  appendLogMock.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

// ─── tests ───────────────────────────────────────────────────
describe('AdjustHpModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<AdjustHpModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows modal title and character picker when open', () => {
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Adjust HP')).toBeInTheDocument();
    expect(screen.getByLabelText('select character')).toBeInTheDocument();
    expect(screen.getByText('Thorn')).toBeInTheDocument();
    expect(screen.getByText('Lira')).toBeInTheDocument();
  });

  it('does not show HP section until a character is selected', () => {
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    expect(screen.queryByLabelText('current hp')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('hp amount')).not.toBeInTheDocument();
  });

  it('shows current/max HP after selecting a character', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    expect(screen.getByLabelText('current hp')).toBeInTheDocument();
    expect(screen.getByText('20')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
  });

  it('temp HP badge is hidden when temp is 0', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    expect(screen.queryByText(/temp/)).not.toBeInTheDocument();
  });

  it('shows temp HP badge when character has temp HP', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP_WITH_TEMP };
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    expect(screen.getByText('+5 temp')).toBeInTheDocument();
  });

  it('Apply button is disabled with no amount entered', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    expect(screen.getByLabelText('Apply heal')).toBeDisabled();
  });

  it('heal increases current HP, capped at max', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP }; // current 20, max 40
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '15' } });
    fireEvent.click(screen.getByLabelText('Apply heal'));

    expect(__store['cnmh_hp_thorn'].current).toBe(35);
  });

  it('heal does not exceed max HP', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP }; // current 20, max 40
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '99' } });
    fireEvent.click(screen.getByLabelText('Apply heal'));

    expect(__store['cnmh_hp_thorn'].current).toBe(40); // capped at max
  });

  it('damage reduces current HP, clamped at 0', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP }; // current 20, max 40
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Apply damage'));

    expect(__store['cnmh_hp_thorn'].current).toBe(12);
  });

  it('damage absorbs temp HP first, then reduces current', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP_WITH_TEMP }; // current 20, max 40, temp 5
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '8' } });
    fireEvent.click(screen.getByLabelText('Apply damage'));

    // 5 absorbed by temp, 3 from current (20 - 3 = 17); temp reduced to 0
    expect(__store['cnmh_hp_thorn'].temp).toBe(0);
    expect(__store['cnmh_hp_thorn'].current).toBe(17);
  });

  it('damage does not reduce current below 0', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP }; // current 20
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '999' } });
    fireEvent.click(screen.getByLabelText('Apply damage'));

    expect(__store['cnmh_hp_thorn'].current).toBe(0);
  });

  // ─── typed damage + Charged auto-clear (#275) ───────────────
  it('damage-type select shows in Damage mode and not in Heal mode', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    // Heal is the default mode — no damage-type picker.
    expect(screen.queryByLabelText('damage type')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    expect(screen.getByLabelText('damage type')).toBeInTheDocument();
  });

  it('applying electricity damage clears eld-charged and logs it', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    __store['cnmh_effects_thorn'] = [
      { id: 'c1', effectId: 'eld-charged' },
      { id: 'm1', effectId: 'mage-armor' },
    ];
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    fireEvent.change(screen.getByLabelText('damage type'), { target: { value: 'electricity' } });
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('Apply damage'));

    expect(__store['cnmh_effects_thorn'].map((e) => e.id)).toEqual(['m1']);
    expect(__store['cnmh_hp_thorn'].current).toBe(14);
    expect(appendLogMock).toHaveBeenCalledWith(
      expect.objectContaining({ charId: 'thorn', text: expect.stringContaining('electricity') })
    );
  });

  it('non-electricity damage leaves eld-charged in place', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    __store['cnmh_effects_thorn'] = [{ id: 'c1', effectId: 'eld-charged' }];
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    fireEvent.change(screen.getByLabelText('damage type'), { target: { value: 'fire' } });
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('Apply damage'));

    expect(__store['cnmh_effects_thorn'].map((e) => e.id)).toEqual(['c1']);
    expect(appendLogMock).not.toHaveBeenCalled();
  });

  it('untyped damage does not touch effects (no regression)', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    __store['cnmh_effects_thorn'] = [{ id: 'c1', effectId: 'eld-charged' }];
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.click(screen.getByRole('button', { name: /damage/i }));
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '6' } });
    fireEvent.click(screen.getByLabelText('Apply damage'));

    expect(__store['cnmh_effects_thorn'].map((e) => e.id)).toEqual(['c1']);
    expect(__store['cnmh_hp_thorn'].current).toBe(14);
    expect(appendLogMock).not.toHaveBeenCalled();
  });

  // ─── incoming typed resistance (#900 stretch) ───────────────
  describe('typed resistance on incoming damage (#900)', () => {
    // A live-catalog effect granting resistance 5 to fire — the GM HP-apply flow
    // resolves it from the character's active effects against the content catalog.
    const RES_CATALOG = [
      { id: 'fire-ward', name: 'Fire Ward', modifiers: [{ stat: 'resistance', amount: 5, vs: 'fire' }] },
    ];

    beforeEach(() => {
      useContent.mockReturnValue({ characters: CHARACTERS, effects: RES_CATALOG });
      __store['cnmh_hp_thorn'] = { ...THORN_HP }; // current 20
      __store['cnmh_effects_thorn'] = [{ id: 'e1', effectId: 'fire-ward' }];
    });

    const selectDamage = (type) => {
      act(() => {
        fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
      });
      fireEvent.click(screen.getByRole('button', { name: /damage/i }));
      if (type) fireEvent.change(screen.getByLabelText('damage type'), { target: { value: type } });
    };

    it('reduces matching typed damage by the resistance and logs it', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      selectDamage('fire');
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '8' } });
      fireEvent.click(screen.getByLabelText('Apply damage'));

      expect(__store['cnmh_hp_thorn'].current).toBe(17); // 20 - (8 - 5)
      expect(appendLogMock).toHaveBeenCalledWith(
        expect.objectContaining({ charId: 'thorn', text: expect.stringMatching(/resisted fire.*8 → 3.*resistance 5/) })
      );
    });

    it('floors the incoming damage at 0 when resistance exceeds it', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      selectDamage('fire');
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '3' } });
      fireEvent.click(screen.getByLabelText('Apply damage'));

      expect(__store['cnmh_hp_thorn'].current).toBe(20); // 3 - 5 → 0, unchanged
    });

    it('does not resist a non-matching damage type', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      selectDamage('cold');
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '8' } });
      fireEvent.click(screen.getByLabelText('Apply damage'));

      expect(__store['cnmh_hp_thorn'].current).toBe(12); // full 8
      expect(appendLogMock).not.toHaveBeenCalled();
    });

    it('does not resist untyped damage', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      selectDamage(); // no type
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '8' } });
      fireEvent.click(screen.getByLabelText('Apply damage'));

      expect(__store['cnmh_hp_thorn'].current).toBe(12); // full 8
    });

    it('previews the matching resistance beside the damage-type picker', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      selectDamage('fire');
      expect(screen.getByLabelText('resistance preview')).toHaveTextContent('resistance 5');
    });

    it('shows no preview for a non-matching type', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      selectDamage('cold');
      expect(screen.queryByLabelText('resistance preview')).not.toBeInTheDocument();
    });
  });

  it('amount field clears after applying', () => {
    __store['cnmh_hp_thorn'] = { ...THORN_HP };
    render(<AdjustHpModal isOpen={true} onClose={() => {}} />);

    act(() => {
      fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'thorn' } });
    });
    fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '10' } });
    fireEvent.click(screen.getByLabelText('Apply heal'));

    expect(screen.getByLabelText('hp amount').value).toBe('');
  });

  describe('allied minions (#261)', () => {
    beforeEach(() => {
      useContent.mockReturnValue({ characters: [...CHARACTERS, ASHKA] });
    });

    it('lists the owner and the companion as separate options', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      expect(screen.getByText('Ashka')).toBeInTheDocument();
      expect(screen.getByText('Ashka — Zevira')).toBeInTheDocument();
    });

    it('shows the companion HP from data max when unset (lazy default)', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      act(() => {
        fireEvent.change(screen.getByLabelText('select character'), {
          target: { value: 'minion:ashka:companion' },
        });
      });
      // current and max both read back as the data max (32) until something writes
      expect(screen.getAllByText('32')).toHaveLength(2);
    });

    it('damage writes to cnmh_minions_<owner>, not cnmh_hp', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      act(() => {
        fireEvent.change(screen.getByLabelText('select character'), {
          target: { value: 'minion:ashka:companion' },
        });
      });
      fireEvent.click(screen.getByRole('button', { name: /damage/i }));
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '10' } });
      fireEvent.click(screen.getByLabelText('Apply damage'));

      expect(__store['cnmh_minions_ashka'].companion.hp.current).toBe(22);
      expect(__store['cnmh_hp_minion:ashka:companion']).toBeUndefined();
    });

    it('heal on the companion is capped at its data max', () => {
      __store['cnmh_minions_ashka'] = { companion: { hp: { current: 30, max: 32, temp: 0 } } };
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      act(() => {
        fireEvent.change(screen.getByLabelText('select character'), {
          target: { value: 'minion:ashka:companion' },
        });
      });
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '99' } });
      fireEvent.click(screen.getByLabelText('Apply heal'));

      expect(__store['cnmh_minions_ashka'].companion.hp.current).toBe(32);
    });
  });

  describe('GM summons (#261)', () => {
    beforeEach(() => {
      __store['cnmh_summons_global'] = [
        { entryId: 'sum-1', kind: 'summon', name: 'Skeletal Champion', casterId: 'thorn', sustainId: 's1', bestiary: { hp: { current: 50, max: 60 } } },
      ];
    });

    it('lists active summons as options', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      expect(screen.getByText('Summon — Skeletal Champion')).toBeInTheDocument();
    });

    it('damage writes to cnmh_summons_global, not cnmh_hp', () => {
      render(<AdjustHpModal isOpen={true} onClose={() => {}} />);
      act(() => {
        fireEvent.change(screen.getByLabelText('select character'), { target: { value: 'summon:sum-1' } });
      });
      fireEvent.click(screen.getByRole('button', { name: /damage/i }));
      fireEvent.change(screen.getByLabelText('hp amount'), { target: { value: '15' } });
      fireEvent.click(screen.getByLabelText('Apply damage'));

      expect(__store['cnmh_summons_global'][0].bestiary.hp.current).toBe(35);
      expect(__store['cnmh_hp_summon:sum-1']).toBeUndefined();
    });
  });

  it('calls onClose when the modal is closed', () => {
    const onClose = vi.fn();
    render(<AdjustHpModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByRole('button', { name: /×/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
