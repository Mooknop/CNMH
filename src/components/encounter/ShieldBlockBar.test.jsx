import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

let mockShield;
const mockLowerShield = vi.fn();
const mockApplyBlock = vi.fn();
vi.mock('../../hooks/useShield', () => ({
  useShield: () => ({ ...mockShield, lowerShield: mockLowerShield, applyBlock: mockApplyBlock }),
}));

let mockTurnState;
const mockSpendReaction = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ turnState: mockTurnState, spendReaction: mockSpendReaction }),
}));

const mockAppendLog = vi.fn();
const mockAddSaveRequest = vi.fn();
// Two enemies in the order: one with captured saves, one without (#1055 S2).
const enemyOrder = [
  { entryId: 'e1', kind: 'enemy', name: 'Skeleton', defenses: { saves: { reflex: 8 } } },
  { entryId: 'e2', kind: 'enemy', name: 'Ghoul' },
  { entryId: 'p1', kind: 'pc', charId: 'Pellias', name: 'Pellias' },
];
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: { order: enemyOrder },
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
  }),
}));

// The rune follow-up shares the item activation's hourly ledger (#1055 S2);
// gate availability + the record spend are all the bar reads.
let mockGateAvailable;
const mockRecord = vi.fn();
vi.mock('../../hooks/useFrequency', () => ({
  useFrequency: () => ({
    gateFor: () => ({ available: mockGateAvailable }),
    record: mockRecord,
  }),
}));

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: {}, time: {} }),
}));

import ShieldBlockBar from './ShieldBlockBar';

beforeEach(() => {
  mockShield = {
    heldShield: { uid: 'u1', name: 'Steel Shield', shield: { hardness: 5, hp: 20 } },
    raised: true,
    broken: false,
  };
  mockTurnState = { hasStartedFirstTurn: true, reactionAvailable: true, reactionSpent: false };
  mockGateAvailable = true;
});

const setup = () =>
  render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={[]} />);

describe('ShieldBlockBar', () => {
  it('renders nothing when the shield is not raised', () => {
    mockShield.raised = false;
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing without a held shield', () => {
    mockShield.heldShield = null;
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('blocking runs applyBlock, spends the reaction, logs the split, and ends the raise', () => {
    mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 13, broken: false });
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));

    expect(mockApplyBlock).toHaveBeenCalledWith(12, { hardnessBonus: 0 });
    expect(mockSpendReaction).toHaveBeenCalledWith('Shield Block');
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      charId: 'Pellias',
      text: expect.stringContaining('5 prevented, shield → 13 HP'),
    }));
    expect(screen.getByLabelText('Shield Block damage')).toHaveValue(null); // cleared
    // Table rule: a raised-shield reaction consumes the raise even when the
    // shield survives intact.
    expect(mockLowerShield).toHaveBeenCalled();
  });

  it('a breaking block lowers the shield and logs the break', () => {
    mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 0, broken: true });
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '40' } });
    fireEvent.click(screen.getByLabelText('Shield Block'));

    expect(mockLowerShield).toHaveBeenCalled();
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('shield broke!'),
    }));
  });

  it('is disabled once the reaction is spent', () => {
    mockTurnState = { ...mockTurnState, reactionSpent: true };
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  it('is disabled before the PC has started their first turn', () => {
    mockTurnState = { hasStartedFirstTurn: false, reactionAvailable: false, reactionSpent: false };
    setup();
    fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
    expect(screen.getByLabelText('Shield Block')).toBeDisabled();
  });

  // ── Deflecting shields (#1196 G1) ──
  describe('deflecting +2 Hardness vs ranged', () => {
    const RANGED_LABEL = 'Triggering attack was ranged (deflecting +2 Hardness)';
    // Host inventory entry carrying the Deflecting trait, matched to the held
    // shield by uid (heldShield is the normalized view without traits).
    const deflectingInventory = [{ uid: 'u1', name: 'Kite Shield', traits: ['Deflecting'] }];
    const renderDeflecting = () =>
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={deflectingInventory} />);

    it('shows no ranged toggle for a non-deflecting shield', () => {
      setup(); // inventory [] → no host item → no trait
      expect(screen.queryByLabelText(RANGED_LABEL)).not.toBeInTheDocument();
    });

    it('shows the ranged toggle when the held shield is deflecting', () => {
      renderDeflecting();
      expect(screen.getByLabelText(RANGED_LABEL)).toBeInTheDocument();
    });

    it('unchecked ranged toggle passes no Hardness bonus', () => {
      mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 13, broken: false });
      renderDeflecting();
      fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Shield Block'));
      expect(mockApplyBlock).toHaveBeenCalledWith(12, { hardnessBonus: 0 });
    });

    it('checking ranged passes +2 Hardness and notes it in the log', () => {
      mockApplyBlock.mockReturnValue({ prevented: 7, shieldHpAfter: 15, broken: false });
      renderDeflecting();
      fireEvent.click(screen.getByLabelText(RANGED_LABEL));
      fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Shield Block'));
      expect(mockApplyBlock).toHaveBeenCalledWith(12, { hardnessBonus: 2 });
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('deflecting +2 Hardness (ranged)'),
      }));
    });
  });

  // ── Accessory-rune onBlock rider (#1033 S2) ──
  describe('accessory-rune onBlock rider (#1033)', () => {
    const retaliationShield = {
      uid: 'u1',
      name: 'Steel Shield',
      shield: { hardness: 5, hp: 20 },
      runes: {
        accessory: {
          id: 'retaliation-lesser', name: 'Retaliation (Lesser)', type: 'property', target: 'accessory',
          onBlock: 'activate to deal 1d6 force damage to the attacker (once per hour)',
        },
      },
    };
    const setupWithRune = () =>
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={[retaliationShield]} />);

    it('shows the follow-up reminder while the runed shield is raised', () => {
      setupWithRune();
      expect(screen.getByTestId('shieldblock-rune-rider')).toHaveTextContent(
        'Retaliation (Lesser): activate to deal 1d6 force damage'
      );
    });

    it('appends the rune note to the block log line', () => {
      mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 13, broken: false });
      setupWithRune();
      fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Shield Block'));
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('· Retaliation (Lesser): activate to deal 1d6 force damage'),
      }));
    });

    it('renders no rider for a rune without onBlock, or when the entry is absent', () => {
      render(
        <ShieldBlockBar
          charId="Pellias"
          characterName="Pellias"
          inventory={[{ uid: 'u1', name: 'Steel Shield', shield: {}, runes: { accessory: { id: 'x', name: 'X' } } }]}
        />
      );
      expect(screen.queryByTestId('shieldblock-rune-rider')).not.toBeInTheDocument();
      setup(); // empty inventory — heldShield uid unmatched
      expect(screen.queryByTestId('shieldblock-rune-rider')).not.toBeInTheDocument();
    });

    it('a legacy prose rider never arms a follow-up', () => {
      mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 13, broken: false });
      setupWithRune();
      fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Shield Block'));
      expect(screen.queryByTestId('shieldblock-rune-followup')).not.toBeInTheDocument();
    });
  });

  // ── Live structured riders (#1055 S2) ──
  describe('structured onBlock follow-up (#1055 S2)', () => {
    const withRune = (accessory) => [{
      uid: 'u1', name: 'Steel Shield', shield: { hardness: 5, hp: 20 },
      runes: { accessory },
    }];
    const retaliation = {
      id: 'retaliation-lesser', name: 'Retaliation (Lesser)', type: 'property', target: 'accessory',
      actuated: { cost: 'none', name: 'Retaliation', frequency: 'once per hour' },
      onBlock: {
        summary: 'Free action (once per hour): 4d4 force damage to the attacker (DC 20 basic Reflex).',
        damage: { expression: '4d4', typeLabel: 'force' },
        save: 'reflex', dc: 20, basic: true,
      },
    };
    const catching = {
      id: 'catching', name: 'Catching', type: 'property', target: 'accessory',
      actuated: { cost: 'none', name: 'Catching Rune', frequency: 'once per hour' },
      onBlock: {
        summary: 'Free action (once per hour): attempt to Disarm the weapon you blocked.',
        check: { skill: 'athletics', action: 'Disarm', bonus: 1 },
      },
    };
    const block = () => {
      mockApplyBlock.mockReturnValue({ prevented: 5, shieldHpAfter: 13, broken: false });
      fireEvent.change(screen.getByLabelText('Shield Block damage'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Shield Block'));
    };

    it('arms Retaliation after a block and pushes a save request with the rolled damage', () => {
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={withRune(retaliation)} />);
      expect(screen.queryByTestId('shieldblock-rune-followup')).not.toBeInTheDocument();
      block();
      const followup = screen.getByTestId('shieldblock-rune-followup');
      expect(followup).toBeInTheDocument();
      // only enemies are offered as attackers
      expect(screen.queryByRole('option', { name: 'Pellias' })).not.toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('Retaliation (Lesser) target'), { target: { value: 'e1' } });
      fireEvent.change(screen.getByLabelText('Retaliation (Lesser) rolled damage'), { target: { value: '9' } });
      fireEvent.click(screen.getByLabelText('use Retaliation (Lesser)'));

      expect(mockRecord).toHaveBeenCalled(); // hourly ledger ticked
      expect(mockAddSaveRequest).toHaveBeenCalledWith({
        casterId: 'Pellias',
        casterName: 'Pellias',
        abilityName: 'Retaliation (Lesser)',
        save: 'reflex',
        dc: 20,
        basic: true,
        targets: [{ entryId: 'e1', name: 'Skeleton', saveMod: 8 }],
        damage: { entered: 9, expression: '4d4', typeLabel: 'force', riders: [] },
      });
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('unleashes Retaliation (Lesser) at Skeleton'),
      }));
      expect(screen.queryByTestId('shieldblock-rune-followup')).not.toBeInTheDocument();
    });

    it('Catching logs the Disarm outcome against a captured Reflex DC and never requests a save', () => {
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={withRune(catching)} />);
      block();
      fireEvent.change(screen.getByLabelText('Catching target'), { target: { value: 'e1' } });
      fireEvent.change(screen.getByLabelText('Catching check total'), { target: { value: '24' } });
      fireEvent.click(screen.getByLabelText('use Catching'));

      expect(mockRecord).toHaveBeenCalled();
      expect(mockAddSaveRequest).not.toHaveBeenCalled();
      // Reflex DC 18 (10 + 8), total 24 → Success
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining(
          'Disarm attempt vs Skeleton — Athletics 24 (incl. +1 circumstance) vs Reflex DC 18 → Success'
        ),
      }));
    });

    it('Catching against an uncaptured enemy logs the total for the GM to adjudicate', () => {
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={withRune(catching)} />);
      block();
      fireEvent.change(screen.getByLabelText('Catching target'), { target: { value: 'e2' } });
      fireEvent.change(screen.getByLabelText('Catching check total'), { target: { value: '24' } });
      fireEvent.click(screen.getByLabelText('use Catching'));
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('Disarm attempt vs Ghoul — Athletics 24 (incl. +1 circumstance) (GM adjudicates)'),
      }));
    });

    it('skip disarms the follow-up without spending the free action', () => {
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={withRune(retaliation)} />);
      block();
      fireEvent.click(screen.getByLabelText('skip Retaliation (Lesser)'));
      expect(screen.queryByTestId('shieldblock-rune-followup')).not.toBeInTheDocument();
      expect(mockRecord).not.toHaveBeenCalled();
      expect(mockAddSaveRequest).not.toHaveBeenCalled();
    });

    it('a spent hourly gate blocks arming and says so on the rider line', () => {
      mockGateAvailable = false;
      render(<ShieldBlockBar charId="Pellias" characterName="Pellias" inventory={withRune(retaliation)} />);
      expect(screen.getByTestId('shieldblock-rune-rider')).toHaveTextContent('used — the clock frees it up');
      block();
      expect(screen.queryByTestId('shieldblock-rune-followup')).not.toBeInTheDocument();
    });
  });
});
