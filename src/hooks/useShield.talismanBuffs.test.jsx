// useShield × shield-talisman buffs (#1246): the held shield folds an active
// Adamantine Flake's Hardness bonus, carries the Heartstone temp-HP pool
// through applyBlock (spent before real HP, one overlay write), and surfaces a
// Prismatic Crystal's energy-block window + Tree Sap's granted traits. Runs
// the REAL provider stack via renderWithProviders (#1311) — the buff entries
// are seeded straight into the session's cnmh_effects_ state.
import React from 'react';
import { act } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../test/renderWithProviders';
import { useShield } from './useShield';

beforeEach(() => window.localStorage.clear());

let latest;
const Probe = ({ inventory }) => {
  latest = useShield('pc-1', inventory);
  return null;
};

const steel = {
  uid: 's1',
  name: 'Steel Shield',
  state: 'held1',
  shield: { hardness: 5, health: 20, breakThreshold: 10, bonus: 2 },
};

const buff = (over = {}) => ({
  id: 'fx1',
  name: 'Adamantine Flake (Steel Shield)',
  appliedBy: 'pc-1',
  source: 'Adamantine Flake',
  shieldBuff: { itemId: 'adamantine-flake', itemName: 'Adamantine Flake', shieldUid: 's1', shieldName: 'Steel Shield', ...over },
  ts: 1,
});

const mount = (state) =>
  renderWithProviders(<Probe inventory={[steel]} />, {
    content: { character: [makeCharacter({ id: 'pc-1' })] },
    session: { state: { 'pc-1': state }, connected: true, foundryConnected: true },
  });

describe('useShield × shield-talisman buffs (#1246)', () => {
  it('folds an active flake buff into the held shield Hardness', () => {
    mount({ effects: [buff({ hardnessBonus: 6 })] });
    expect(latest.heldShield.shield.hardness).toBe(11);
    expect(latest.heldShield.buffHardness).toBe(6);
  });

  it('reports no buffs on a bare shield', () => {
    mount({});
    expect(latest.heldShield.shield.hardness).toBe(5);
    expect(latest.heldShield.buffHardness).toBe(0);
    expect(latest.heldShield.tempHp).toBe(0);
    expect(latest.heldShield.energyBlock).toBeNull();
    expect(latest.heldShield.buffTraits).toEqual([]);
  });

  it('surfaces the crystal energy-block window and tree-sap granted traits', () => {
    mount({
      effects: [
        buff({ itemId: 'prismatic-crystal', energyBlock: 'fire' }),
        buff({ itemId: 'tree-sap', grantTraits: ['Grapple'] }),
      ],
    });
    expect(latest.heldShield.energyBlock).toBe('fire');
    expect(latest.heldShield.buffTraits).toEqual(['Grapple']);
  });

  it('applyBlock spends the Heartstone temp pool before real HP in one overlay write', () => {
    const { session } = mount({ itemhp: { s1: { hp: 20, tempHp: 12 } } });
    expect(latest.heldShield.tempHp).toBe(12);

    let result;
    act(() => {
      result = latest.applyBlock(15); // H5 → 10 through; 10 off the pool
    });
    expect(result.shieldTempHpAfter).toBe(2);
    expect(result.shieldHpAfter).toBe(20);
    const write = session.sent.filter((s) => s.stateType === 'itemhp').pop();
    expect(write.value).toEqual({ s1: { hp: 20, tempHp: 2 } });
  });

  it('applyBlock with shieldImmune (crystal) never touches shield HP or the pool', () => {
    const { session } = mount({
      itemhp: { s1: { hp: 20, tempHp: 12 } },
      effects: [buff({ itemId: 'prismatic-crystal', energyBlock: 'fire' })],
    });
    let result;
    act(() => {
      result = latest.applyBlock(15, { shieldImmune: true });
    });
    expect(result.characterTakes).toBe(10);
    expect(result.shieldHpAfter).toBe(20);
    expect(result.shieldTempHpAfter).toBe(12);
    const write = session.sent.filter((s) => s.stateType === 'itemhp').pop();
    expect(write.value).toEqual({ s1: { hp: 20, tempHp: 12 } });
  });
});
