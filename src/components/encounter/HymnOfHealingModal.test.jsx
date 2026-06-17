import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import HymnOfHealingModal from './HymnOfHealingModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCastingResources } from '../../hooks/useCastingResources';

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

vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useTurnState', () => ({ useTurnState: vi.fn() }));
vi.mock('../../hooks/useCastingResources', () => ({ useCastingResources: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: 'izzy', name: 'Izzy', level: 8, maxHp: 28 },
      { id: 'blu', name: 'Blu', maxHp: 40 },
    ],
  }),
}));

const mockGetState = vi.fn(() => undefined);
const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: (...a) => mockGetState(...a), sendUpdate: (...a) => mockSendUpdate(...a) }),
}));

const character = { id: 'izzy', name: 'Izzy', level: 8 };
const spell = {
  id: 'hymn-of-healing',
  name: 'Hymn of Healing',
  traits: ['Bard', 'Composition', 'Healing'],
  duration: 'sustained up to 4 rounds',
};

let appendLog, spendActions, spendFocus;

beforeEach(() => {
  appendLog = vi.fn();
  spendActions = vi.fn();
  spendFocus = vi.fn();
  mockGetState.mockReturnValue(undefined);
  mockSendUpdate.mockClear();

  useEncounter.mockReturnValue({
    appendLog,
    encounter: {
      phase: 'in-progress',
      round: 2,
      order: [{ kind: 'pc', charId: 'izzy', entryId: 'e-izzy', name: 'Izzy' }],
    },
  });
  useTurnState.mockReturnValue({ spendActions });
  useCastingResources.mockReturnValue({ focus: { max: 3, remaining: 2, spend: spendFocus } });
});

const open = () =>
  render(<HymnOfHealingModal isOpen onClose={() => {}} spell={spell} character={character} />);

const hpCalls = () => mockSendUpdate.mock.calls.filter(([, key]) => key === 'hp');
const sustainCall = () => mockSendUpdate.mock.calls.find(([, key]) => key === 'sustains');

describe('HymnOfHealingModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <HymnOfHealingModal isOpen={false} onClose={() => {}} spell={spell} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('cast on self: grants temp HP, spends focus + 2 actions, registers the sustain, logs', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: /Cast Hymn of Healing/ }));

    // Level 8 → rank 4 → 8 temp HP / fast healing 8.
    expect(hpCalls()[0][0]).toBe('izzy');
    expect(hpCalls()[0][2]).toEqual(expect.objectContaining({ temp: 8 }));
    expect(spendFocus).toHaveBeenCalledTimes(1);
    expect(spendActions).toHaveBeenCalledWith(2, 'Cast Hymn of Healing');

    const [casterId, , ledger] = sustainCall();
    expect(casterId).toBe('izzy');
    expect(ledger[0]).toMatchObject({
      spellId: 'hymn-of-healing',
      heal: { targetId: 'izzy', fastHealing: 8, tempHp: 8 },
    });
    expect(appendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('fast healing 8, +8 temp HP') })
    );
  });

  it('cast targeting an ally routes temp HP + the heal payload to that ally', () => {
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Target Blu' }));
    fireEvent.click(screen.getByRole('button', { name: /Cast Hymn of Healing/ }));

    expect(hpCalls()[0][0]).toBe('blu');
    expect(sustainCall()[2][0].heal).toMatchObject({ targetId: 'blu', targetMaxHp: 40 });
  });

  it('blocks the cast with no focus points', () => {
    useCastingResources.mockReturnValue({ focus: { max: 3, remaining: 0, spend: spendFocus } });
    open();
    const btn = screen.getByRole('button', { name: /No focus points/ });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(spendFocus).not.toHaveBeenCalled();
    expect(hpCalls()).toHaveLength(0);
  });

  it('out of combat: still grants the buff but registers no sustain', () => {
    useEncounter.mockReturnValue({
      appendLog,
      encounter: { phase: 'idle', round: 0, order: [] },
    });
    open();
    fireEvent.click(screen.getByRole('button', { name: /Cast Hymn of Healing/ }));
    expect(hpCalls()[0][2]).toEqual(expect.objectContaining({ temp: 8 }));
    expect(spendActions).not.toHaveBeenCalled();
    expect(sustainCall()).toBeUndefined();
  });
});
