import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RollActivityModal from './RollActivityModal';

jest.mock('../shared/Modal', () =>
  function DummyModal({ isOpen, onClose, title, children }) {
    if (!isOpen) return null;
    return (
      <div data-testid="modal">
        <h2>{title}</h2>
        <button onClick={onClose}>×</button>
        {children}
      </div>
    );
  }
);

jest.mock('../../hooks/useCharacter', () => ({ useCharacter: jest.fn() }));
jest.mock('../../hooks/useEffects',   () => ({ useEffects:   jest.fn() }));
jest.mock('../../hooks/useSyncedState', () => ({ useSyncedState: jest.fn() }));
jest.mock('../../utils/rollResolution',  () => ({ resolveActionRoll: jest.fn() }));
jest.mock('../../utils/uid', () => ({ newEntryUid: () => 'uid-test' }));

const mockSendUpdate = jest.fn();
const mockGetState   = jest.fn(() => []);
jest.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

jest.mock('../../contexts/CharacterContext', () => {
  const { createContext } = require('react');
  return { CharacterContext: createContext({ characters: [] }) };
});

jest.mock('../../data/pf2eEffects', () => ({ getEffect: jest.fn() }));

const makeModel = (profs = {}) => ({
  flags: {},
  skillProficiencies: profs,
});

const character = { id: 'izzy', name: 'Izzy', abilities: {}, skills: {} };

const mockPartyChars = [
  { id: 'izzy', name: 'Izzy' },
  { id: 'jade', name: 'Jade' },
];

// Wrap renders that need the party list in context
const withParty = (ui) => {
  const { CharacterContext } = require('../../contexts/CharacterContext');
  return (
    <CharacterContext.Provider value={{ characters: mockPartyChars }}>
      {ui}
    </CharacterContext.Provider>
  );
};

describe('RollActivityModal', () => {
  beforeEach(() => {
    require('../../hooks/useCharacter').useCharacter.mockReturnValue(
      makeModel({ stealth: 2, medicine: 3, diplomacy: 1, perception: 2 })
    );
    require('../../hooks/useEffects').useEffects.mockReturnValue({ effects: [] });
    require('../../hooks/useSyncedState').useSyncedState.mockImplementation(() => [[], jest.fn()]);
    require('../../utils/rollResolution').resolveActionRoll.mockReturnValue({
      mode: 'actor-roll', bonus: 7, breakdown: { base: 7, total: 7, sources: [] },
    });
    require('../../data/pf2eEffects').getEffect.mockImplementation((id) => {
      if (id === 'avoid-notice-hidden') return { id, name: 'Avoiding Notice', modifiers: [] };
      if (id === 'treat-poison-resist') return { id, name: 'Treat Poison', modifiers: [{ stat: 'fort', kind: 'circumstance', amount: 2 }] };
      return null;
    });
  });

  it('renders nothing when isOpen=false', () => {
    const activity = { name: 'Coerce', mechanics: { roll: { type: 'skill', skill: 'intimidation' } } };
    const { container } = render(
      <RollActivityModal isOpen={false} onClose={() => {}} activity={activity} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when activity has no roll', () => {
    const activity = { name: 'Hustle', mechanics: { speed: 'double' } };
    const { container } = render(
      <RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  describe('fixed-skill activity', () => {
    const activity = {
      name: 'Make an Impression',
      mechanics: { roll: { type: 'skill', skill: 'diplomacy' } },
    };

    it('shows the modal with net bonus', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('+7')).toBeInTheDocument();
    });

    it('computes and shows degree of success', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '12' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      expect(screen.getByText('19')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('shows Critical Success when total ≥ DC + 10', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '20' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '17' } });
      expect(screen.getByText('Critical Success')).toBeInTheDocument();
    });

    it('shows Critical Failure when total ≤ DC − 10', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
      expect(screen.getByText('Critical Failure')).toBeInTheDocument();
    });

    it('shows no degree when DC is missing', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
    });
  });

  describe('circumstance bonus', () => {
    const activity = {
      name: 'Coerce',
      mechanics: { roll: { type: 'skill', skill: 'intimidation', circumstanceBonus: 4, circumstanceLabel: 'Coerce' } },
    };

    it('adds the circumstance bonus to the displayed total', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText('+11')).toBeInTheDocument();
      expect(screen.getByText(/includes \+4 Coerce circumstance/)).toBeInTheDocument();
    });
  });

  describe('secret check', () => {
    const activity = {
      name: 'Gather Information',
      mechanics: { roll: { type: 'skill', skill: 'diplomacy', secret: true } },
    };

    it('shows the secret notice', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText(/GM may roll this check secretly/)).toBeInTheDocument();
    });

    it('still shows the modifier for reference', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText('+7')).toBeInTheDocument();
    });
  });

  describe('skill-pick activity', () => {
    const activity = {
      name: 'Learn a Spell',
      mechanics: { roll: { type: 'skill-pick', skills: ['arcana', 'occultism', 'religion', 'nature'] } },
    };

    it('shows only trained skills as options', () => {
      require('../../hooks/useCharacter').useCharacter.mockReturnValue(makeModel({ arcana: 2 }));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByRole('button', { name: 'Arcana' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Occultism' })).not.toBeInTheDocument();
    });

    it('shows empty message when no skills are trained', () => {
      require('../../hooks/useCharacter').useCharacter.mockReturnValue(makeModel({}));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText(/No trained skills available/)).toBeInTheDocument();
    });

    it('shows the bonus after picking a skill', () => {
      require('../../hooks/useCharacter').useCharacter.mockReturnValue(makeModel({ arcana: 2, religion: 1 }));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.queryByText('+7')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Arcana' }));
      expect(screen.getByText('+7')).toBeInTheDocument();
    });
  });

  describe('on-success effect (Avoid Notice)', () => {
    const activity = {
      name: 'Avoid Notice',
      mechanics: { roll: { type: 'skill', skill: 'stealth', onSuccessEffect: 'avoid-notice-hidden' } },
    };

    it('shows disabled apply button after rolling (failure)', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
      const btn = screen.getByRole('button', { name: /Avoiding Notice/ });
      expect(btn).toBeDisabled();
    });

    it('shows enabled apply button on success', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '15' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      // 15+7=22, DC=18 → success
      const btn = screen.getByRole('button', { name: /Apply Avoiding Notice/ });
      expect(btn).not.toBeDisabled();
    });

    it('calls sendUpdate and shows confirmation when Apply is clicked', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '15' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply Avoiding Notice/ }));
      expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'effects', expect.arrayContaining([
        expect.objectContaining({ effectId: 'avoid-notice-hidden', source: 'exploration' }),
      ]));
      expect(screen.getByText(/Avoiding Notice applied/)).toBeInTheDocument();
    });

    it('cannot apply effect a second time', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '15' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply Avoiding Notice/ }));
      // Button replaced by confirmation text
      expect(screen.queryByRole('button', { name: /Apply Avoiding Notice/ })).not.toBeInTheDocument();
    });
  });

  describe('party target picker + on-success effect (Treat Poison)', () => {
    const activity = {
      name: 'Treat Poison',
      mechanics: {
        roll: { type: 'skill', skill: 'medicine', target: 'party-pc', onSuccessEffect: 'treat-poison-resist' },
      },
    };

    it('shows party member buttons', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      expect(screen.getByRole('button', { name: 'Izzy' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Jade' })).toBeInTheDocument();
    });

    it('does not show bonus or roll inputs until target is picked', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      expect(screen.queryByLabelText('d20 roll')).not.toBeInTheDocument();
    });

    it('shows roll inputs after picking a target', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      fireEvent.click(screen.getByRole('button', { name: 'Jade' }));
      expect(screen.getByLabelText('d20 roll')).toBeInTheDocument();
    });

    it('applies effect to the picked target on success', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      fireEvent.click(screen.getByRole('button', { name: 'Jade' }));
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '15' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(screen.getByRole('button', { name: /Apply Treat Poison → Jade/ }));
      expect(mockSendUpdate).toHaveBeenCalledWith('jade', 'effects', expect.arrayContaining([
        expect.objectContaining({ effectId: 'treat-poison-resist', source: 'exploration' }),
      ]));
    });
  });
});
