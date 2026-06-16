import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LingeringCompositionModal from './LingeringCompositionModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useCastingResources } from '../../hooks/useCastingResources';
import { resolveActionRoll } from '../../utils/rollResolution';

vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        <button onClick={onClose}>×</button>
        {children}
      </div>
    );
  },
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useEffects', () => ({ useEffects: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useCastingResources', () => ({ useCastingResources: vi.fn() }));
vi.mock('../../utils/rollResolution', () => ({ resolveActionRoll: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

const mockGetState = vi.fn(() => null);
const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: (...a) => mockGetState(...a), sendUpdate: (...a) => mockSendUpdate(...a) }),
}));

const spell = {
  id: 'lingering-composition',
  name: 'Lingering Composition',
  traits: ['Bard', 'Cantrip', 'Composition', 'Manipulate'],
  duration: '1 round',
};
const character = { id: 'izzy', name: 'Izzy', level: 5, abilities: {}, skills: {} };

let appendLog, spendFocus;

beforeEach(() => {
  appendLog = vi.fn();
  spendFocus = vi.fn();
  mockGetState.mockReturnValue(null);
  mockSendUpdate.mockClear();

  useCharacter.mockReturnValue({ flags: {} });
  useEffects.mockReturnValue({ effects: [] });
  useSyncedState.mockImplementation(() => [[], vi.fn()]);
  useEncounter.mockReturnValue({ appendLog });
  useCastingResources.mockReturnValue({ focus: { max: 3, remaining: 2, spend: spendFocus } });
  resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 10 });
  localStorage.clear();
});

const open = () =>
  render(<LingeringCompositionModal isOpen onClose={() => {}} spell={spell} character={character} />);

const setRoll = (d20, dc) => {
  fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: String(d20) } });
  fireEvent.change(screen.getByLabelText('DC'), { target: { value: String(dc) } });
};

describe('LingeringCompositionModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <LingeringCompositionModal isOpen={false} onClose={() => {}} spell={spell} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('success → sets a 3-round pending flag, spends focus, and logs', () => {
    open();
    // d20 10 + 10 = 20 vs DC 18 → success (not crit: 20 < 28)
    setRoll(10, 18);
    fireEvent.click(screen.getByRole('button', { name: /Cast Lingering Composition/ }));

    expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'lingering', expect.objectContaining({ rounds: 3 }));
    expect(JSON.parse(localStorage.getItem('cnmh_lingering_izzy'))).toMatchObject({ rounds: 3 });
    expect(spendFocus).toHaveBeenCalledTimes(1);
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('next composition lasts 3 rounds') })
    );
  });

  it('critical success → 4-round pending flag', () => {
    open();
    // d20 18 + 10 = 28 vs DC 18 → total beats DC by 10 → critical success
    setRoll(18, 18);
    fireEvent.click(screen.getByRole('button', { name: /Cast Lingering Composition/ }));

    expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'lingering', expect.objectContaining({ rounds: 4 }));
    expect(spendFocus).toHaveBeenCalledTimes(1);
  });

  it('failure → no flag, no focus spend, reminder logged', () => {
    open();
    // d20 2 + 10 = 12 vs DC 25 → failure
    setRoll(2, 25);
    fireEvent.click(screen.getByRole('button', { name: /Cast Lingering Composition/ }));

    expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'lingering', null);
    expect(JSON.parse(localStorage.getItem('cnmh_lingering_izzy'))).toBeNull();
    expect(spendFocus).not.toHaveBeenCalled();
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('focus point not spent') })
    );
  });
});
