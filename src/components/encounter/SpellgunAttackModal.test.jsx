import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import SpellgunAttackModal from './SpellgunAttackModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useIwrReveal } from '../../hooks/useIwrReveal';
import { SessionContext } from '../../contexts/SessionContext';

// RollEntry's 1-20 tap pad (#1692 — replaces FoundryDiceInput's d20-input text
// field). `exact: true` matters: a loose '1' also matches 10-19.
const rollPad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) => fireEvent.click(within(rollPad()).getByRole('button', { name: String(n), exact: true }));

// The RollSheet migration (Roll Resolution redesign successor arc): the
// proficiency/target/night picks live in the sheet's edit disclosure; the
// commit pill is "Fire" ("Fire (2 act)" in encounter — the `($| \()` guard
// keeps it from matching the "Firearm attack" proficiency button); on a hit
// the log + damage relay wait for the amount step (Roll damage → Apply
// damage), exactly like UseAbilityModal's attack path (#1687).
const openEdit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
const firePill = () => screen.getByRole('button', { name: /^Fire($| \()/ });
const walkAmount = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apply damage' }));
};

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
// useTargeting, useSyncedState, useAttackRollSheet, RollSheet, the spellgun
// spine, damage and damageRelay all run for real so the test exercises the
// true pipeline.

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
    openEdit();
    expect(screen.getByRole('button', { name: /Spell attack \+21/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Firearm attack \+16/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('lists only enemies as targets', () => {
    renderModal();
    openEdit();
    expect(screen.getByRole('button', { name: 'Ogre' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Petra' })).not.toBeInTheDocument();
  });

  it('uses the chosen proficiency bonus in the die entry', () => {
    renderModal();
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    // default spell +21
    expect(screen.getByText('your d20 · attack +21')).toBeInTheDocument();
    // switch to firearm → +16
    fireEvent.click(screen.getByRole('button', { name: /Firearm attack/ }));
    expect(screen.getByText('your d20 · attack +16')).toBeInTheDocument();
  });

  it('blocks the commit until a target is picked', () => {
    renderModal();
    expect(screen.getByText('Pick a target first — open Edit.')).toBeInTheDocument();
    expect(firePill()).toBeDisabled();
  });

  it('logs the hit + Speed-penalty rider, consumes the gun, and spends 2 actions', () => {
    renderModal();
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    tapFace(10); // 10 + 21 = 31 vs AC 25 → Hit
    fireEvent.click(firePill());

    // The consume + action spend are commit-time; the log waits for the total.
    // Uid-keyed consumed ledger (#1659) — here the spellgun's authored id.
    expect(sendUpdate).toHaveBeenCalledWith('petra', 'consumed', { 'howl-of-winter': 1 }, { force: false });
    expect(spendActions).toHaveBeenCalledWith(2, 'Fire Howl of Winter (Greater)');
    expect(appendLog).not.toHaveBeenCalled();

    walkAmount(); // no total entered — the log line carries no damage suffix

    expect(appendLog).toHaveBeenCalledTimes(1);
    const howlText = appendLog.mock.calls[0][0].text;
    expect(howlText).toMatch(/Petra fires Howl of Winter \(Greater\) vs Ogre \(AC 25\): 31 /);
    expect(howlText).toMatch(/Hit/);
    expect(howlText).toMatch(/5 ft status penalty to Speed for 1 minute/);
  });

  it('relays raw typed damage to the bridge when a total is entered', () => {
    renderModal();
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    tapFace(10);
    fireEvent.click(firePill());
    fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));
    fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '40' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply damage' }));

    const relay = sendUpdate.mock.calls.find(([id, type]) => id === 'global' && type === 'dmgapply');
    expect(relay).toBeTruthy();
    expect(relay[2].sourceName).toBe('Howl of Winter (Greater)');
    expect(relay[2].hits[0]).toMatchObject({ entryId: 'e-a', amount: 40, type: 'cold' });
  });

  it('resolves the Verdant Bola vs Reflex DC and logs grabbed on a success (no damage relay)', () => {
    renderModal(bola);
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    tapFace(10); // 10 + 21 = 31 vs Reflex DC 25 → Success
    fireEvent.click(firePill());

    // No damage profile → no amount phase: the log fires at the commit.
    const bolaText = appendLog.mock.calls[0][0].text;
    expect(bolaText).toMatch(/fires Verdant Bola vs Ogre \(Reflex DC 25\): 31 /);
    expect(bolaText).toMatch(/Success/);
    expect(bolaText).toMatch(/grabbed/);
    expect(sendUpdate.mock.calls.some(([id, type]) => id === 'global' && type === 'dmgapply')).toBe(false);
    expect(sendUpdate).toHaveBeenCalledWith('petra', 'consumed', { 'verdant-bola': 1 }, { force: false });
  });

  it('clears the absorbed binding when the fired spellgun was in gloves (#1208)', () => {
    const bound = { ...howlGreater, uid: 'gun-uid' };
    useEncounter.mockReturnValue({ encounter: { order, active: true, phase: 'in-progress' }, appendLog });
    useTurnState.mockReturnValue({ spendActions });
    useSessionLog.mockReturnValue({ appendEvent });
    useIwrReveal.mockReturnValue({ revealFiredIwr });
    const sess = {
      connected: true,
      foundryConnected: true,
      getState: (id, type) => (id === 'petra' && type === 'absorbed' ? { 'gun-uid': 'glove-uid' } : undefined),
      getAllState: () => ({}),
      sendUpdate,
      subscribe: () => () => {},
    };
    render(
      <SessionContext.Provider value={sess}>
        <SpellgunAttackModal isOpen onClose={() => {}} item={bound} character={petra} />
      </SessionContext.Provider>
    );
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    tapFace(10);
    fireEvent.click(firePill());

    // Commit-time: the binding clears whether or not the amount step is walked.
    const absorbedCall = sendUpdate.mock.calls.find(([id, type]) => id === 'petra' && type === 'absorbed');
    expect(absorbedCall).toBeTruthy();
    expect(absorbedCall[2]).toEqual({}); // gun-uid binding removed
  });

  it('does not spend actions out of encounter (logs to the session log instead)', () => {
    renderModal(howlGreater, { active: false });
    openEdit();
    fireEvent.click(screen.getByRole('button', { name: 'Ogre' }));
    tapFace(10);
    fireEvent.click(firePill());
    walkAmount();

    expect(spendActions).not.toHaveBeenCalled();
    expect(appendEvent).toHaveBeenCalledTimes(1);
    expect(appendLog).not.toHaveBeenCalled();
  });
});
