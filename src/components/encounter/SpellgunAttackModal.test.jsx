import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SpellgunAttackModal from './SpellgunAttackModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useIwrReveal } from '../../hooks/useIwrReveal';
import { SessionContext } from '../../contexts/SessionContext';

// Inline dummy modal so queries work without a portal.
vi.mock('../shared/Modal', () => ({
  default: function DummyModal({ isOpen, title, children }) {
    if (!isOpen) return null;
    return <div data-testid="modal"><h2>{title}</h2>{children}</div>;
  },
}));

vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useTurnState', () => ({ useTurnState: vi.fn() }));
vi.mock('../../hooks/useSessionLog', () => ({ useSessionLog: vi.fn() }));
vi.mock('../../hooks/useIwrReveal', () => ({ useIwrReveal: vi.fn() }));
// useTargeting, useSyncedState, TargetRollResolver, the spellgun spine, damage
// and damageRelay all run for real so the test exercises the true pipeline.

// A rank-8 caster: spell attack Cha 20 (+5) legendary (rank 4 → +8) + level 8 = +21;
// firearm Dex 18 (+4) simple expert (rank 2 → +4) + level 8 = +16. Spell is higher.
const petra = {
  id: 'petra', name: 'Petra', level: 8,
  abilities: { dexterity: 18, charisma: 20 },
  spellcasting: { ability: 'charisma', proficiency: 4 },
  proficiencies: { weapons: { simple: { proficiency: 2 }, martial: { proficiency: 4 } } },
};

const howlGreater = {
  id: 'howl-of-winter', name: 'Howl of Winter (Greater)', quantity: 1,
  traits: ['Attack', 'Cold', 'Consumable', 'Magical', 'Spellgun', '3rd Party'],
  spellgun: { rangeIncrement: 30, against: 'ac', damageType: 'cold', actionCount: 2, attackChoice: true },
  dice: '12d6', penalty: 'for 1 minute',
};

const bola = {
  id: 'verdant-bola', name: 'Verdant Bola', quantity: 1,
  traits: ['Attack', 'Consumable', 'Magical', 'Plant', 'Spellgun', '3rd Party'],
  spellgun: { rangeIncrement: 20, against: 'reflex-dc', actionCount: 2, attackChoice: true },
};

const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Ogre', defenses: { ac: 25, saves: { reflex: 15 } } },
  { entryId: 'p-1', kind: 'pc', charId: 'petra', name: 'Petra' },
];

let appendLog, appendEvent, spendActions, sendUpdate, revealFiredIwr;

const session = () => ({
  connected: true,
  foundryConnected: true, // avoid the offline-sandbox write freeze (#553)
  getState: () => undefined,
  getAllState: () => ({}),
  sendUpdate,
  subscribe: () => () => {},
});

const renderModal = (item = howlGreater, { active = true } = {}) => {
  useEncounter.mockReturnValue({
    encounter: { order, active, phase: active ? 'in-progress' : 'idle' },
    appendLog,
  });
  useTurnState.mockReturnValue({ spendActions });
  useSessionLog.mockReturnValue({ appendEvent });
  useIwrReveal.mockReturnValue({ revealFiredIwr });
  return render(
    <SessionContext.Provider value={session()}>
      <SpellgunAttackModal isOpen onClose={() => {}} item={item} character={petra} />
    </SessionContext.Provider>
  );
};

beforeEach(() => {
  window.localStorage.clear(); // spellgun proficiency choice persists via useSyncedState
  appendLog = vi.fn();
  appendEvent = vi.fn();
  spendActions = vi.fn();
  sendUpdate = vi.fn();
  revealFiredIwr = vi.fn();
});

describe('SpellgunAttackModal', () => {
  it('offers both attack-roll options, defaulting to the higher bonus', () => {
    renderModal();
    expect(screen.getByRole('button', { name: /Spell attack \+21/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Firearm attack \+16/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lists only enemies as targets', () => {
    renderModal();
    expect(screen.getByRole('button', { name: 'Ogre' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Petra' })).not.toBeInTheDocument();
  });

  it('uses the chosen proficiency bonus in the resolver', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    // default spell +21
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+21');
    // switch to firearm → +16
    fireEvent.click(screen.getByRole('button', { name: /Firearm attack/ }));
    expect(screen.getByLabelText('roll bonus')).toHaveTextContent('+16');
  });

  it('logs the hit + Speed-penalty rider, consumes the gun, and spends 2 actions', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } }); // 10 + 21 = 31 vs AC 25 → Hit
    fireEvent.click(screen.getByTestId('sgm-fire'));

    expect(appendLog).toHaveBeenCalledTimes(1);
    const howlText = appendLog.mock.calls[0][0].text;
    expect(howlText).toMatch(/Petra fires Howl of Winter \(Greater\) vs Ogre \(AC 25\): 31 /);
    expect(howlText).toMatch(/Hit/);
    expect(howlText).toMatch(/5 ft status penalty to Speed for 1 minute/);
    // consumed overlay incremented for the graded name
    expect(sendUpdate).toHaveBeenCalledWith('petra', 'consumed', { 'Howl of Winter (Greater)': 1 }, { force: false });
    // 2-action activation spent in encounter
    expect(spendActions).toHaveBeenCalledWith(2, 'Fire Howl of Winter (Greater)');
  });

  it('relays raw typed damage to the bridge when a total is entered', () => {
    renderModal();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '40' } });
    fireEvent.click(screen.getByTestId('sgm-fire'));

    const relay = sendUpdate.mock.calls.find(([id, type]) => id === 'global' && type === 'dmgapply');
    expect(relay).toBeTruthy();
    expect(relay[2].sourceName).toBe('Howl of Winter (Greater)');
    expect(relay[2].hits[0]).toMatchObject({ entryId: 'e-a', amount: 40, type: 'cold' });
  });

  it('resolves the Verdant Bola vs Reflex DC and logs grabbed on a success (no damage relay)', () => {
    renderModal(bola);
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } }); // 10 + 21 = 31 vs Reflex DC 25 → Success
    fireEvent.click(screen.getByTestId('sgm-fire'));

    const bolaText = appendLog.mock.calls[0][0].text;
    expect(bolaText).toMatch(/fires Verdant Bola vs Ogre \(Reflex DC 25\): 31 /);
    expect(bolaText).toMatch(/Success/);
    expect(bolaText).toMatch(/grabbed/);
    expect(sendUpdate.mock.calls.some(([id, type]) => id === 'global' && type === 'dmgapply')).toBe(false);
    expect(sendUpdate).toHaveBeenCalledWith('petra', 'consumed', { 'Verdant Bola': 1 }, { force: false });
  });

  it('does not spend actions out of encounter (logs to the session log instead)', () => {
    renderModal(howlGreater, { active: false });
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    fireEvent.change(screen.getByLabelText('raw d20'), { target: { value: '10' } });
    fireEvent.click(screen.getByTestId('sgm-fire'));

    expect(spendActions).not.toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendLog).not.toHaveBeenCalled();
  });
});
