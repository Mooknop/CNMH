import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ReloadSheet from './ReloadSheet';

const mockLoad = vi.fn();
const mockStateFor = vi.fn();
vi.mock('../../hooks/useChambers', () => ({
  useChambers: () => ({ load: mockLoad, stateFor: mockStateFor }),
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions: mockSpendActions }),
}));

const mockAppendLog = vi.fn();
const mockAppendEvent = vi.fn();
let encounterValue;
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: encounterValue, appendLog: mockAppendLog }),
}));
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent }),
}));

let inventory;
vi.mock('../../hooks/useCharacter', () => ({
  useCharacter: () => ({ inventory }),
}));

const strike = {
  name: 'Crescent Cross Bolt',
  type: 'ranged',
  capacity: 3,
  reload: 1,
  ammoType: 'bolt',
  traits: ['Capacity 3'],
};

const beaconShot = {
  uid: 'beacon-1',
  name: 'Beacon Shot',
  quantity: 2,
  ammunition: { types: ['bolt'], activate: 1, effectId: 'beacon-shot', onHit: true },
};

const reload = {
  kind: 'reload',
  weaponUid: 'cc-1',
  weaponName: 'Crescent Cross',
  capacity: 3,
  reloadCost: 1,
  strike,
};

const character = { id: 'p1', name: 'Ashka' };

const renderSheet = () =>
  render(
    <ReloadSheet
      isOpen
      onClose={vi.fn()}
      reload={reload}
      character={character}
      themeColor="#abc"
      actionCost={1}
    />
  );

describe('ReloadSheet', () => {
  beforeEach(() => {
    mockLoad.mockReset();
    mockSpendActions.mockReset();
    mockAppendLog.mockReset();
    mockAppendEvent.mockReset();
    mockStateFor.mockReturnValue({ chambers: [null, null, null], pointer: 0 });
    inventory = [beaconShot];
    encounterValue = { active: true, phase: 'in-progress' };
  });

  it('lists the default bolt plus carried eligible special ammo', () => {
    renderSheet();
    expect(screen.getByText('Crescent Cross Bolt')).toBeInTheDocument();
    expect(screen.getByText('Beacon Shot')).toBeInTheDocument();
    expect(screen.getByText('×2')).toBeInTheDocument();
  });

  it('loads the default infinite bolt into the next empty chamber and spends the action', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Reload \(1 act\)/ }));
    expect(mockLoad).toHaveBeenCalledWith('cc-1', 0, expect.objectContaining({ default: true, name: 'Crescent Cross Bolt' }), 3);
    expect(mockSpendActions).toHaveBeenCalledWith(1, 'Reload Crescent Cross');
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka Reloaded the Crescent Cross (Crescent Cross Bolt)',
    }));
  });

  it('loads selected special ammo as a non-default ref without consuming it', () => {
    renderSheet();
    fireEvent.click(screen.getByRole('button', { name: /Beacon Shot/ }));
    fireEvent.click(screen.getByRole('button', { name: /Reload/ }));
    expect(mockLoad).toHaveBeenCalledWith('cc-1', 0, expect.objectContaining({
      name: 'Beacon Shot', default: false, activate: 1, effectId: 'beacon-shot',
    }), 3);
  });

  it('targets the first empty chamber when earlier ones are loaded', () => {
    mockStateFor.mockReturnValue({ chambers: [{ name: 'Bolt' }, null, null], pointer: 0 });
    renderSheet();
    expect(screen.getByText('Chamber 2 of 3 · choose ammunition')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reload/ }));
    expect(mockLoad).toHaveBeenCalledWith('cc-1', 1, expect.anything(), 3);
  });

  it('logs to the session (not combat) and skips the action spend out of encounter', () => {
    encounterValue = { active: false };
    render(
      <ReloadSheet isOpen onClose={vi.fn()} reload={reload} character={character} themeColor="#abc" actionCost={0} />
    );
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka Reloaded the Crescent Cross (Crescent Cross Bolt)',
    }));
    expect(mockSpendActions).not.toHaveBeenCalled();
  });
});

describe('ReloadSheet nock mode (#1270, AA1)', () => {
  const bowStrike = { name: 'Shortbow', type: 'ranged', reload: 0, ammoType: 'arrow' };
  const sleepArrow = {
    uid: 'arrow-1',
    name: 'Sleep Arrow',
    quantity: 1,
    ammunition: { types: ['arrow'], activate: 0, effectId: 'sleep-arrow', onHit: true },
  };
  const nockReload = {
    kind: 'reload',
    weaponUid: 'bow-1',
    weaponName: 'Shortbow',
    capacity: 1,
    reloadCost: 0,
    nock: true,
    strike: bowStrike,
  };

  const renderNock = () =>
    render(
      <ReloadSheet isOpen onClose={vi.fn()} reload={nockReload} character={character} themeColor="#abc" actionCost={0} />
    );

  beforeEach(() => {
    mockStateFor.mockReturnValue({ chambers: [null], pointer: 0 });
    inventory = [sleepArrow];
    encounterValue = { active: true, phase: 'in-progress' };
  });

  it('lists only carried specials — no infinite default — with the first preselected', () => {
    renderNock();
    expect(screen.queryByText('∞')).not.toBeInTheDocument();
    const pick = screen.getByRole('button', { name: /Sleep Arrow/ });
    expect(pick).toHaveAttribute('aria-pressed', 'true');
  });

  it('nocks the selected special into the single slot and logs the Nock verb', () => {
    renderNock();
    fireEvent.click(screen.getByRole('button', { name: 'Nock' }));
    expect(mockLoad).toHaveBeenCalledWith('bow-1', 0, expect.objectContaining({
      name: 'Sleep Arrow', default: false, effectId: 'sleep-arrow',
    }), 1);
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Ashka Nocked the Shortbow (Sleep Arrow)',
    }));
    expect(mockSpendActions).not.toHaveBeenCalled(); // reload 0 — no action spend
  });

  it('disables the confirm when no eligible special is carried', () => {
    inventory = [];
    renderNock();
    expect(screen.getByRole('button', { name: 'Nock' })).toBeDisabled();
  });
});
