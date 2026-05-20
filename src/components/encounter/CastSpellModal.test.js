import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CastSpellModal from './CastSpellModal';

const mockGetState = jest.fn(() => []);
const mockSendUpdate = jest.fn();
const mockAppendLog = jest.fn();
const mockSpendActions = jest.fn();
const mockSpendReaction = jest.fn();
// resolveExpireAt mock is retrieved after the jest.mock factory runs
let mockResolveExpireAt;


jest.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

jest.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    characters: [
      { id: 'char-a', name: 'Pellias' },
      { id: 'char-b', name: 'Ashka' },
    ],
  }),
}));

jest.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({
    encounter: {
      active: true,
      phase: 'in-progress',
      round: 1,
      currentTurnIndex: 0,
      order: [
        { entryId: 'e-caster', kind: 'pc', charId: 'char-a', name: 'Pellias', initiative: 20 },
        { entryId: 'e-target', kind: 'pc', charId: 'char-b', name: 'Ashka', initiative: 15 },
      ],
      log: [],
    },
    appendLog: mockAppendLog,
  }),
}));

jest.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({
    turnState: { actionsSpent: 0, reactionAvailable: true },
    spendActions: mockSpendActions,
    spendReaction: mockSpendReaction,
  }),
}));

jest.mock('../../utils/expiry', () => ({
  resolveExpireAt: jest.fn(() => ({ round: 1, entryId: 'e-caster', boundary: 'turn-end' })),
  boundariesCrossedBy: jest.fn(() => []),
  isExpired: jest.fn(() => false),
}));

jest.mock('../../utils/uid', () => ({ newEntryUid: () => 'test-uid' }));

jest.mock('../shared/Modal', () =>
  function MockModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <span>{title}</span>
        <button onClick={onClose}>Close</button>
        {children}
      </div>
    );
  }
);

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

const defaultProps = { isOpen: true, onClose: jest.fn(), character, themeColor };

describe('CastSpellModal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    // Get the auto-mocked resolveExpireAt after jest.mock hoisting
    const expiry = require('../../utils/expiry');
    mockResolveExpireAt = expiry.resolveExpireAt;
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
    it('shows the no-effects message', () => {
      render(<CastSpellModal {...defaultProps} spell={spellNoEffects} />);
      expect(screen.getByText(/No structured effects/)).toBeInTheDocument();
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
      const onClose = jest.fn();
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
      expect(screen.getByLabelText('target-0')).toBeInTheDocument();
    });

    it('target picker includes both characters', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      expect(screen.getByRole('option', { name: 'Pellias (you)' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: 'Ashka' })).toBeInTheDocument();
    });

    it('changing target picker updates the target for the effect', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      fireEvent.change(screen.getByLabelText('target-0'), { target: { value: 'char-b' } });
      fireEvent.click(screen.getByLabelText('confirm-cast'));
      expect(mockSendUpdate).toHaveBeenCalledWith(
        'char-b',
        'effects',
        expect.arrayContaining([expect.objectContaining({ effectId: 'bless' })])
      );
    });

    it('logs the cast with target name', () => {
      render(<CastSpellModal {...defaultProps} spell={spellWithTargetEffect} />);
      fireEvent.change(screen.getByLabelText('target-0'), { target: { value: 'char-b' } });
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
});
