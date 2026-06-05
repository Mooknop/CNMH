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

jest.mock('../../hooks/useCharacter', () => ({
  useCharacter: jest.fn(),
}));
jest.mock('../../hooks/useEffects', () => ({
  useEffects: jest.fn(),
}));
jest.mock('../../hooks/useSyncedState', () => ({ useSyncedState: jest.fn() }));
jest.mock('../../utils/rollResolution', () => ({ resolveActionRoll: jest.fn() }));

const makeModel = (profs = {}) => ({
  flags: {},
  skillProficiencies: profs,
});

const character = { id: 'izzy', name: 'Izzy', abilities: {}, skills: {} };
const themeColor = '#abc';

describe('RollActivityModal', () => {
  beforeEach(() => {
    const { useCharacter } = require('../../hooks/useCharacter');
    useCharacter.mockReturnValue(makeModel({ stealth: 2, intimidation: 3, diplomacy: 1 }));
    require('../../hooks/useEffects').useEffects.mockReturnValue({ effects: [] });
    require('../../hooks/useSyncedState').useSyncedState.mockImplementation(() => [[], jest.fn()]);
    require('../../utils/rollResolution').resolveActionRoll.mockReturnValue({
      mode: 'actor-roll',
      bonus: 7,
      breakdown: { base: 7, total: 7, sources: [] },
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

    it('computes and shows degree of success from d20 + DC inputs', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '12' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      // total = 12 + 7 = 19, DC=18 → Success
      expect(screen.getByText('19')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('shows Critical Success when total ≥ DC + 10', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '20' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '17' } });
      // 20+7=27, DC=17 → 27≥27 → Critical Success
      expect(screen.getByText('Critical Success')).toBeInTheDocument();
    });

    it('shows Critical Failure when total ≤ DC − 10', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
      // 1+7=8, DC=20, 8≤10 → Critical Failure
      expect(screen.getByText('Critical Failure')).toBeInTheDocument();
    });

    it('shows no degree when DC is missing', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
      expect(screen.queryByText('Failure')).not.toBeInTheDocument();
    });
  });

  describe('circumstance bonus', () => {
    const activity = {
      name: 'Coerce',
      mechanics: { roll: { type: 'skill', skill: 'intimidation', circumstanceBonus: 4, circumstanceLabel: 'Coerce' } },
    };

    it('adds the circumstance bonus to the displayed total', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      // resolveActionRoll returns base 7, +4 circumstance = +11
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
      mechanics: {
        roll: { type: 'skill-pick', skills: ['arcana', 'occultism', 'religion', 'nature'] },
      },
    };

    it('shows only trained skills as options', () => {
      // makeModel has stealth:2, intimidation:3, diplomacy:1 — none of the magic skills
      const { useCharacter } = require('../../hooks/useCharacter');
      useCharacter.mockReturnValue(makeModel({ arcana: 2 }));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByRole('button', { name: 'Arcana' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Occultism' })).not.toBeInTheDocument();
    });

    it('shows empty message when no skills are trained', () => {
      const { useCharacter } = require('../../hooks/useCharacter');
      useCharacter.mockReturnValue(makeModel({}));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText(/No trained skills available/)).toBeInTheDocument();
    });

    it('shows the bonus after picking a skill', () => {
      const { useCharacter } = require('../../hooks/useCharacter');
      useCharacter.mockReturnValue(makeModel({ arcana: 2, religion: 1 }));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      // No bonus row until a skill is picked
      expect(screen.queryByText('+7')).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Arcana' }));
      expect(screen.getByText('+7')).toBeInTheDocument();
    });
  });
});
