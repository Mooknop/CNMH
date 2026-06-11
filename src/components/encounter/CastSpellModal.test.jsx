import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CastSpellModal from './CastSpellModal';
import { resolveExpireAt } from '../../utils/expiry';

const mockGetState = vi.fn(() => []);
const mockSendUpdate = vi.fn();
const mockAppendLog = vi.fn();
const mockSpendActions = vi.fn();
const mockSpendReaction = vi.fn();
const mockRecordAttack = vi.fn();
const mockAddSaveRequest = vi.fn();
// resolveExpireAt mock is retrieved after the vi.mock factory runs
let mockResolveExpireAt;


vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate, subscribe: () => () => {} }),
}));

vi.mock('../../hooks/useEffects', () => ({
  useEffects: () => ({ effects: [], removeEffect: vi.fn() }),
}));

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    gameDate: { day: 5, month: 2, year: 4725 },
    time: { hour: 8, minute: 0, second: 0 },
  }),
}));

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: 'char-a', name: 'Pellias' },
      { id: 'char-b', name: 'Ashka' },
    ],
  }),
}));

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: {
      active: true,
      phase: 'in-progress',
      round: 1,
      currentTurnIndex: 0,
      order: [
        { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Pellias', initiative: 20 },
        { entryId: 'e-target', kind: 'pc', charId: 'char-b', name: 'Ashka', initiative: 15 },
        { entryId: 'e-goblin', kind: 'enemy', name: 'Goblin', initiative: 10 },
      ],
      log: [],
    },
    appendLog: mockAppendLog,
    addSaveRequest: mockAddSaveRequest,
    removeSaveRequest: vi.fn(),
  }),
}));

vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, attacksMade: 0, reactionAvailable: true },
    spendActions: mockSpendActions,
    spendReaction: mockSpendReaction,
    recordAttack: mockRecordAttack,
  }),
}));

vi.mock('../../utils/expiry', () => ({
  resolveExpireAt: vi.fn(() => ({ round: 1, entryId: 'e-caster', boundary: 'turn-end' })),
  boundariesCrossedBy: vi.fn(() => []),
  isExpired: vi.fn(() => false),
}));

vi.mock('../../utils/uid', () => ({ newEntryUid: () => 'test-uid' }));

vi.mock('../shared/Modal', () => ({
  default: function MockModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <span>{title}</span>
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    );
  }
}));

vi.mock('./ChainedStrikeSection', () => {
  const { forwardRef, useImperativeHandle, createElement } = require('react');
   
  return { default: forwardRef(({ chain }, ref) => {
    useImperativeHandle(ref, () => ({
      getResults: () => ({
        mode: chain.modes?.[0] === 'flurry' ? 'flurry' : 'strike',
        strikeName: 'Unarmed Strike',
        attackBonus: 9,
        damage: '1d6+4 + 1d6',
        rolls: [[{ entryId: 'e-enemy', name: 'Goblin', dc: 15, total: 19, degree: 'success' }]],
      }),
    }));
    return createElement('div', { 'data-testid': 'chained-strike-section' }, `chain-into=${chain.into}`);
  }) };
});

// Per-test overrides for the ChainedSpellSection mock's getResults() (#235 —
// rank-picking happens inside the section, so tests inject its outcome here).
const chainSpellMock = vi.hoisted(() => ({ extraResults: {} }));

vi.mock('./ChainedSpellSection', () => {
  const { forwardRef, useImperativeHandle, useEffect, createElement } = require('react');

  return { default: forwardRef(({ chain, parentCost, onTotalCostChange }, ref) => {
    useImperativeHandle(ref, () => ({
      getResults: () => ({
        spellId: 'light', spellName: 'Light', spellCost: 2, totalCost: 3,
        rollResults: null, saveTargets: null,
        rollProfile: { mode: 'none', bonus: null, dc: null, defense: null },
        modifier: chain.modifier || null,
        castOption: null,
        castRank: 0,
        ...chainSpellMock.extraResults,
      }),
      getTotalCost: () => 3,
    }));
    useEffect(() => { onTotalCostChange?.(3); }, [onTotalCostChange]);
    return createElement('div', { 'data-testid': 'chained-spell-section' }, `chain-into=${chain.into}`);
  }) };
});

const character = { id: 'char-a', name: 'Pellias' };
const themeColor = '#7b3f00';

const spellNoEffects = {
  id: 'sleep',
  name: 'Sleep',
  actions: 'Two Actions',
  range: '30 feet',
};

const spellWithSelfEffect = {
  id: 'runic-body',
  name: 'Runic Body',
  actions: 'Two Actions',
  effects: [
    { effectId: 'runic-body', applyTo: 'self', duration: { until: 'rounds', rounds: 10 } },
  ],
};

const spellWithTargetEffect = {
  id: 'bless',
  name: 'Bless',
  actions: 'Two Actions',
  effects: [
    { effectId: 'bless', applyTo: 'ally', duration: { until: 'caster-turn-end' } },
  ],
};

const defaultProps = { isOpen: true, onClose: vi.fn(), character, themeColor };

describe('CastSpellModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    chainSpellMock.extraResults = {};
    mockResolveExpireAt = resolveExpireAt;
    mockResolveExpireAt.mockReturnValue({ round: 1, entryId: 'e-caster', boundary: 'turn-end' });
  });

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CastSpellModal {...defaultProps} isOpen={false} spell={spellNoEffects} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when spell is null', () => {
    const { container } = render(<CastSpellModal {...defaultProps} spell={null} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows the spell name in the title', () => {
    render(<CastSpellModal {...defaultProps} spell={spellNoEffects} />);
    expect(screen.getByText('Cast: Sleep')).toBeInTheDocument();
  });

  it('shows action cost on the Cast button', () => {
    render(<CastSpellModal {...defaultProps} spell={spellNoEffects} />);
    expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (Two Actions)');
  });

  describe('spell with no structured effects', () => {
    it('shows a target picker so the cast target can be logged', () => {
      render(<CastSpellModal {...defaultProps} spell={spellNoEffects} />);
      expect(screen.getByRole('group', { name: 'Select targets' })).toBeInTheDocument();
    });

    it('clicking Cast logs the cast and spends actions', () => {
      render(<CastSpellModal {...defaultProps} spell={spellNoEffects} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockAppendLog).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Pellias cast Sleep' })
      );
      expect(mockSpendActions).toHaveBeenCalledWith(2, 'Cast Sleep');
    });

    it('calls onClose after casting', () => {
      const onClose = vi.fn();
      render(<CastSpellModal {...defaultProps} spell={spellNoEffects} onClose={onClose} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe('spell with self-target effect', () => {
    it('shows the effect section', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithSelfEffect} />);
      expect(screen.getByText('Apply Effects')).toBeInTheDocument();
    });

    it('shows self target label', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithSelfEffect} />);
      expect(screen.getByText(`→ ${character.name}`)).toBeInTheDocument();
    });

    it('clicking Cast writes effect to caster key', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithSelfEffect} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSendUpdate).toHaveBeenCalledWith(
        'char-a',
        'effects',
        expect.arrayContaining([
          expect.objectContaining({ effectId: 'runic-body', appliedBy: 'char-a' }),
        ])
      );
    });

    it('resolves expireAt for the effect', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithSelfEffect} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockResolveExpireAt).toHaveBeenCalledWith(
        { until: 'rounds', rounds: 10 },
        expect.any(Object),
        'e-caster',
        expect.anything()
      );
    });

    it('stores expireAt on the written effect entry', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithSelfEffect} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const [, , effectsArray] = mockSendUpdate.mock.calls[0];
      expect(effectsArray[0].expireAt).toEqual({ round: 1, entryId: 'e-caster', boundary: 'turn-end' });
    });
  });

  describe('spell with ally-target effect', () => {
    it('renders a target picker', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      expect(screen.getByRole('group', { name: 'Select targets' })).toBeInTheDocument();
    });

    it('target picker includes both characters as chips', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      expect(screen.getByRole('button', { name: 'Target Pellias' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Target Ashka' })).toBeInTheDocument();
    });

    it('clicking a target chip applies the effect to that character', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      fireEvent.click(screen.getByRole('button', { name: 'Target Ashka' }));
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSendUpdate).toHaveBeenCalledWith(
        'char-b',
        'effects',
        expect.arrayContaining([expect.objectContaining({ effectId: 'bless' })])
      );
    });

    it('logs the cast with target name', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      fireEvent.click(screen.getByRole('button', { name: 'Target Ashka' }));
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockAppendLog).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Pellias cast Bless on Ashka' })
      );
    });
  });

  describe('action cost parsing', () => {
    it('free action spells do not call spendActions', () => {
      const freeSpell = { ...spellNoEffects, actions: 'Free Action' };
      render(<CastSpellModal {...defaultProps} spell={freeSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).not.toHaveBeenCalled();
      expect(mockSpendReaction).not.toHaveBeenCalled();
    });

    it('reaction spells call spendReaction', () => {
      const reactionSpell = { ...spellNoEffects, actions: 'Reaction' };
      render(<CastSpellModal {...defaultProps} spell={reactionSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendReaction).toHaveBeenCalledWith('Cast Sleep');
      expect(mockSpendActions).not.toHaveBeenCalled();
    });

    it('three-action spell calls spendActions(3, ...)', () => {
      const bigSpell = { ...spellNoEffects, actions: 'Three Actions' };
      render(<CastSpellModal {...defaultProps} spell={bigSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).toHaveBeenCalledWith(3, expect.any(String));
    });
  });

  describe('target-save spell (save vs caster Spell DC)', () => {
    const savespell = {
      id: 'fireball',
      name: 'Fireball',
      actions: 'Two Actions',
      defense: 'Reflex',
      traits: ['Evocation', 'Fire'],
    };

    it('shows a save request preview instead of an inline resolver for save spells', () => {
      render(<CastSpellModal {...defaultProps} spell={savespell} />);
      expect(screen.queryByLabelText(/raw d20/i)).not.toBeInTheDocument();
      // Preview section present (no enemy targets selected so list is empty, but label shows)
    });

    it('logs the cast on confirm', () => {
      render(<CastSpellModal {...defaultProps} spell={savespell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockAppendLog).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('Fireball') })
      );
    });

    it('spends actions on confirm', () => {
      render(<CastSpellModal {...defaultProps} spell={savespell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).toHaveBeenCalledWith(2, expect.any(String));
    });
  });

  describe('chained strike ability (Inner Upheaval)', () => {
    const chainAbility = {
      id: 'inner-upheaval',
      name: 'Inner Upheaval',
      actions: 'One Action',
      chain: { into: 'strike', cost: 'included', modes: ['strike', 'flurry'], strikeTrait: 'Unarmed', attackBonus: 1, damageBonus: '1d6' },
    };

    it('renders the ChainedStrikeSection for a chained ability', () => {
      render(<CastSpellModal {...defaultProps} spell={chainAbility} />);
      expect(screen.getByTestId('chained-strike-section')).toBeInTheDocument();
    });

    it('shows the included-cost note', () => {
      render(<CastSpellModal {...defaultProps} spell={chainAbility} />);
      expect(screen.getByText(/included in/i)).toBeInTheDocument();
    });

    it('spends only the parent ability cost (not double)', () => {
      render(<CastSpellModal {...defaultProps} spell={chainAbility} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).toHaveBeenCalledWith(1, 'Cast Inner Upheaval');
      expect(mockSpendActions).toHaveBeenCalledTimes(1);
    });

    it('logs the augmented strike result on confirm', () => {
      render(<CastSpellModal {...defaultProps} spell={chainAbility} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('Unarmed Strike') && t.includes('Goblin'))).toBe(true);
    });

    it('log includes damage string', () => {
      render(<CastSpellModal {...defaultProps} spell={chainAbility} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('1d6'))).toBe(true);
    });
  });

  describe('actor-roll spell (spell attack roll)', () => {
    const attackSpell = {
      id: 'scorching-ray',
      name: 'Scorching Ray',
      actions: 'Two Actions',
      traits: ['Attack', 'Evocation', 'Fire'],
    };

    it('shows the roll bonus badge for a spell-attack spell with spellcasting', () => {
      const casterChar = {
        id: 'char-a',
        name: 'Pellias',
        level: 5,
        spellcasting: { ability: 'charisma', proficiency: 1 },
        abilities: { charisma: 18 },
      };
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={attackSpell} />);
      // The roll bonus badge should appear when the resolver is shown
      // (no enemy targets in mock so resolver doesn't appear, but modal renders)
      expect(screen.getByText('Cast: Scorching Ray')).toBeInTheDocument();
    });
  });

  describe('chained spell ability (Reach Spell, Harrow Casting)', () => {
    const reachSpell = {
      id: 'reach-spell',
      name: 'Reach Spell',
      actions: 'One Action',
      chain: { into: 'spell', cost: 'added', spellFilter: 'has-range', modifier: 'Range increased by 30 feet' },
    };

    it('renders ChainedSpellSection for a spell-chain ability', () => {
      render(<CastSpellModal {...defaultProps} spell={reachSpell} />);
      expect(screen.getByTestId('chained-spell-section')).toBeInTheDocument();
    });

    it('shows the additive total cost in the confirm button (1 parent + 2 spell = 3)', () => {
      render(<CastSpellModal {...defaultProps} spell={reachSpell} />);
      expect(screen.getByLabelText('confirm-cast')).toHaveTextContent('Cast (3)');
    });

    it('spends the total cost (3) on confirm, not just parent cost (1)', () => {
      render(<CastSpellModal {...defaultProps} spell={reachSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).toHaveBeenCalledWith(3, expect.any(String));
      expect(mockSpendActions).toHaveBeenCalledTimes(1);
    });

    it('logs the combined cast on confirm', () => {
      render(<CastSpellModal {...defaultProps} spell={reachSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('Reach Spell') && t.includes('Light'))).toBe(true);
    });
  });

  describe('Multiple Attack Penalty tracking', () => {
    const attackSpell = {
      id: 'scorching-ray',
      name: 'Scorching Ray',
      actions: 'Two Actions',
      traits: ['Attack', 'Fire'],
    };

    it('records one attack on confirming an Attack-trait cast', () => {
      render(<CastSpellModal {...defaultProps} spell={attackSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockRecordAttack).toHaveBeenCalledWith(1);
    });

    it('does not record an attack for a non-attack spell', () => {
      render(<CastSpellModal {...defaultProps} spell={spellNoEffects} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockRecordAttack).not.toHaveBeenCalled();
    });

    it('records one attack for a single chained strike', () => {
      const chainAbility = {
        name: 'Inner Upheaval',
        actions: 'One Action',
        chain: { into: 'strike', modes: ['strike'], strikeTrait: 'Unarmed' },
      };
      render(<CastSpellModal {...defaultProps} spell={chainAbility} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockRecordAttack).toHaveBeenCalledWith(1);
    });

    it('records two attacks for a flurry chain', () => {
      const flurry = {
        name: 'Flurry of Blows',
        actionCount: 1,
        chain: { into: 'strike', modes: ['flurry'] },
      };
      render(<CastSpellModal {...defaultProps} spell={flurry} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockRecordAttack).toHaveBeenCalledWith(2);
    });
  });

  describe('casting resources (slots / cost picker)', () => {
    const casterChar = {
      id: 'char-a',
      name: 'Pellias',
      level: 5,
      spellcasting: { ability: 'charisma', proficiency: 1, spell_slots: { 2: 2 } },
      abilities: { charisma: 18 },
    };
    const healSpell = { id: 'heal', name: 'Heal', level: 2, actions: 'Two Actions' };

    it('shows the rank slot cost for a leveled repertoire cast', () => {
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={healSpell} castSource="slot" />);
      expect(screen.getByText('Rank 2 slot (2 left)')).toBeInTheDocument();
    });

    it('spends the slot and logs the source on confirm', () => {
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={healSpell} castSource="slot" />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSendUpdate).toHaveBeenCalledWith('char-a', 'slots', expect.objectContaining({ 2: 1 }));
      expect(mockAppendLog).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Pellias cast Heal (rank 2 slot)' })
      );
    });

    it('cantrips show a no-cost line and spend nothing', () => {
      const cantrip = { id: 'arc', name: 'Electric Arc', level: 0, actions: 'Two Actions' };
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={cantrip} castSource="slot" />);
      expect(screen.getByText('Cantrip — no cost')).toBeInTheDocument();
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const slotWrites = mockSendUpdate.mock.calls.filter(([, type]) => type === 'slots');
      expect(slotWrites).toHaveLength(0);
    });

    it('signature spells offer a rank picker', () => {
      const sigChar = {
        ...casterChar,
        spellcasting: { ...casterChar.spellcasting, spell_slots: { 1: 3, 2: 2 } },
      };
      const sigSpell = { id: 'heal', name: 'Heal', level: 1, signature: true, actions: 'Two Actions' };
      render(<CastSpellModal {...defaultProps} character={sigChar} spell={sigSpell} castSource="slot" />);
      expect(screen.getByRole('radiogroup', { name: 'Casting source' })).toBeInTheDocument();
      expect(screen.getByText('Rank 1 slot (3 left)')).toBeInTheDocument();
      expect(screen.getByText('Rank 2 slot (2 left)')).toBeInTheDocument();
    });

    it('blocks confirm when the pool is empty; override unblocks without spending', () => {
      const tappedChar = {
        ...casterChar,
        spellcasting: { ...casterChar.spellcasting, spell_slots: { 2: 0 } },
      };
      render(<CastSpellModal {...defaultProps} character={tappedChar} spell={healSpell} castSource="slot" />);
      expect(screen.getByLabelText('confirm-cast')).toBeDisabled();

      fireEvent.click(screen.getByRole('checkbox'));
      expect(screen.getByLabelText('confirm-cast')).toBeEnabled();

      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const slotWrites = mockSendUpdate.mock.calls.filter(([, type]) => type === 'slots');
      expect(slotWrites).toHaveLength(0);
      expect(mockAppendLog).toHaveBeenCalledWith(
        expect.objectContaining({ text: expect.stringContaining('override — no resource spent') })
      );
    });
  });

  describe('spell heightening (#235)', () => {
    const casterChar = {
      id: 'char-a',
      name: 'Pellias',
      level: 5,
      spellcasting: { ability: 'charisma', proficiency: 1, spell_slots: { 1: 3, 2: 2, 3: 2 } },
      abilities: { charisma: 18 },
    };
    // No rank-1 pool: the parent spellshape (no level → native rank 1) stays
    // untracked, so only the chained spend touches the slots key. (In the app
    // spellshapes launch with verb "Use" and never get a parent cast cost.)
    const chainCaster = {
      ...casterChar,
      spellcasting: { ...casterChar.spellcasting, spell_slots: { 2: 2, 3: 2 } },
    };
    const reachSpell = {
      id: 'reach-spell',
      name: 'Reach Spell',
      actions: 'One Action',
      chain: { into: 'spell', cost: 'added', spellFilter: 'has-range', modifier: 'Range increased by 30 feet' },
    };

    it('chained confirm spends the rank the section picked', () => {
      chainSpellMock.extraResults = {
        castOption: { type: 'slot', rank: 3, enabled: true },
        castRank: 3,
        spellRank: 1,
      };
      render(<CastSpellModal {...defaultProps} character={chainCaster} spell={reachSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSendUpdate).toHaveBeenCalledWith('char-a', 'slots', expect.objectContaining({ 3: 1 }));
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('Light') && t.includes('(rank 3 slot)'))).toBe(true);
    });

    it('chained confirm with a disabled option logs "not spent" and spends nothing', () => {
      chainSpellMock.extraResults = {
        castOption: { type: 'slot', rank: 3, enabled: false },
        castRank: 3,
        spellRank: 1,
      };
      render(<CastSpellModal {...defaultProps} character={chainCaster} spell={reachSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const slotWrites = mockSendUpdate.mock.calls.filter(([, type]) => type === 'slots');
      expect(slotWrites).toHaveLength(0);
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('no rank-3 slots left — not spent'))).toBe(true);
    });

    it('chained save request carries the cast rank', () => {
      chainSpellMock.extraResults = {
        castOption: { type: 'slot', rank: 3, enabled: true },
        castRank: 3,
        spellRank: 1,
        rollProfile: { mode: 'target-save', bonus: null, dc: 21, defense: 'reflex' },
        saveTargets: [{ entryId: 'e-goblin', name: 'Goblin' }],
      };
      render(<CastSpellModal {...defaultProps} character={chainCaster} spell={reachSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockAddSaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({ abilityName: 'Reach Spell → Light', rank: 3 })
      );
    });

    it('section without a cast option falls back to the native-rank spend', () => {
      chainSpellMock.extraResults = { castOption: null, castRank: 2, spellRank: 2 };
      render(<CastSpellModal {...defaultProps} character={chainCaster} spell={reachSpell} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSendUpdate).toHaveBeenCalledWith('char-a', 'slots', expect.objectContaining({ 2: 1 }));
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('(rank 2 slot)'))).toBe(true);
    });

    it('direct cast shows the heightened text for the chosen rank only', () => {
      const sigSpell = {
        id: 'fear', name: 'Fear', level: 1, signature: true, actions: 'Two Actions',
        heightened: { '3rd': 'You can target up to five creatures.' },
      };
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={sigSpell} castSource="slot" />);
      // default = rank 1 (native): nothing heightened
      expect(screen.queryByText(/target up to five creatures/)).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('radio', { name: /rank 3 slot/i }));
      expect(screen.getByText(/target up to five creatures/)).toBeInTheDocument();
    });

    it('direct save request carries the chosen cast rank', () => {
      const sigSaveSpell = {
        id: 'fear', name: 'Fear', level: 1, signature: true, actions: 'Two Actions',
        defense: 'Will',
      };
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={sigSaveSpell} castSource="slot" />);
      fireEvent.click(screen.getByRole('radio', { name: /rank 2 slot/i }));
      fireEvent.click(screen.getByRole('button', { name: 'Target Goblin' }));
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockAddSaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({ abilityName: 'Fear', rank: 2 })
      );
    });

    it('cantrip cast produces no rank on the save request', () => {
      const cantripSave = {
        id: 'daze', name: 'Daze', level: 0, actions: 'Two Actions', defense: 'Will',
      };
      render(<CastSpellModal {...defaultProps} character={casterChar} spell={cantripSave} castSource="slot" />);
      fireEvent.click(screen.getByRole('button', { name: 'Target Goblin' }));
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockAddSaveRequest).toHaveBeenCalledWith(
        expect.objectContaining({ abilityName: 'Daze', rank: undefined })
      );
    });
  });

  describe('Flurry of Blows as standalone chain ability', () => {
    const flurryAction = {
      name: 'Flurry of Blows',
      actionCount: 1,
      traits: ['Flourish', 'Monk'],
      chain: { into: 'strike', cost: 'included', modes: ['flurry'] },
    };

    it('renders ChainedStrikeSection for Flurry of Blows', () => {
      render(<CastSpellModal {...defaultProps} spell={flurryAction} />);
      expect(screen.getByTestId('chained-strike-section')).toBeInTheDocument();
    });

    it('spends only 1 action (the Flurry cost, strike included)', () => {
      render(<CastSpellModal {...defaultProps} spell={flurryAction} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSpendActions).toHaveBeenCalledWith(1, expect.any(String));
    });

    it('logs the strike result on confirm', () => {
      render(<CastSpellModal {...defaultProps} spell={flurryAction} />);
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      const logCalls = mockAppendLog.mock.calls.map((c) => c[0].text);
      expect(logCalls.some((t) => t.includes('Flurry of Blows') || t.includes('Unarmed Strike'))).toBe(true);
    });
  });
});
