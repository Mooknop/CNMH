import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import RollActivityModal from './RollActivityModal';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { CharacterContext } from '../../contexts/CharacterContext';
import { resolveActionRoll } from '../../utils/rollResolution';
import { setDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';

// RollActivityModal now renders RollSheet (#1690) rather than its own Modal
// body — the DC input and skill/target pickers move into RollSheet's Edit
// panel, and the degree only ever appears in the result card after commit.
// Mocking `../shared/Modal` here also intercepts RollSheet's Modal import:
// both resolve to the same module (src/components/shared/Modal.jsx).
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
  }
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useEffects',   () => ({ useEffects:   vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../utils/rollResolution',  () => ({ resolveActionRoll: vi.fn() }));
vi.mock('../../utils/uid', () => ({ newEntryUid: () => 'uid-test' }));

const mockSendUpdate = vi.fn();
const mockGetState   = vi.fn(() => []);
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: mockGetState, sendUpdate: mockSendUpdate }),
}));

vi.mock('../../contexts/CharacterContext', async () => {
  const { createContext } = await vi.importActual('react');
  return { CharacterContext: createContext({ characters: [] }) };
});

vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({
    effects: [
      { id: 'avoid-notice-hidden', name: 'Avoiding Notice', modifiers: [] },
      { id: 'treat-poison-resist', name: 'Treat Poison', modifiers: [{ stat: 'fort', kind: 'circumstance', amount: 2 }] },
    ],
  }),
}));

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
const withParty = (ui) => (
  <CharacterContext.Provider value={{ characters: mockPartyChars }}>
    {ui}
  </CharacterContext.Provider>
);

// RollSheet interaction helpers (RollSheet.test.jsx idiom). Foundry dice are
// never "available" under these mocks (no SessionContext foundryConnected),
// so the pad renders regardless of the table-dice pref — set it anyway for
// clarity and to stay in sync if that ever changes.
const pad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) => fireEvent.click(within(pad()).getByRole('button', { name: String(n), exact: true }));
const sheet = () => document.querySelector('.rs');
const pill = (name) => within(sheet()).getByRole('button', { name });

beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));
afterEach(() => setDevicePref(TABLE_DICE_PREF, false));

describe('RollActivityModal', () => {
  beforeEach(() => {
    useCharacter.mockReturnValue(
      makeModel({ stealth: 2, medicine: 3, diplomacy: 1, perception: 2 })
    );
    useEffects.mockReturnValue({ effects: [] });
    useSyncedState.mockImplementation(() => [[], vi.fn()]);
    resolveActionRoll.mockReturnValue({
      mode: 'actor-roll', bonus: 7, breakdown: { base: 7, total: 7, sources: [] },
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

    it('shows the modal with net bonus and no degree before commit', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByTestId('modal')).toBeInTheDocument();
      expect(screen.getByText('Diplomacy +7')).toBeInTheDocument();
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
      expect(screen.getByText('No degrees until you commit.')).toBeInTheDocument();
    });

    it('blocks the commit until a DC is entered', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText('Enter a DC in Edit before rolling.')).toBeInTheDocument();
      tapFace(10);
      expect(pill('Resolve Make an Impression')).toBeDisabled();
    });

    it('computes and shows degree of success only after commit', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(pill('Done'));
      tapFace(12);
      expect(screen.queryByText('Success')).not.toBeInTheDocument();
      fireEvent.click(pill('Resolve Make an Impression'));
      // d20 12 + 7 = 19 vs DC 18 → success
      expect(screen.getByText('+7 = 19')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
    });

    it('shows Critical Success when total ≥ DC + 10', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '17' } });
      tapFace(20);
      fireEvent.click(pill('Resolve Make an Impression'));
      expect(screen.getByText('Critical Success')).toBeInTheDocument();
    });

    it('shows Critical Failure when total ≤ DC − 10', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '20' } });
      tapFace(1);
      fireEvent.click(pill('Resolve Make an Impression'));
      expect(screen.getByText('Critical Failure')).toBeInTheDocument();
    });
  });

  describe('circumstance bonus', () => {
    const activity = {
      name: 'Coerce',
      mechanics: { roll: { type: 'skill', skill: 'intimidation', circumstanceBonus: 4, circumstanceLabel: 'Coerce' } },
    };

    it('adds the circumstance bonus to the displayed total', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText('Intimidation +11')).toBeInTheDocument();
      fireEvent.click(pill('Edit'));
      expect(screen.getByText(/includes \+4 Coerce circumstance/)).toBeInTheDocument();
    });
  });

  describe('secret check', () => {
    const activity = {
      name: 'Gather Information',
      mechanics: { roll: { type: 'skill', skill: 'diplomacy', secret: true } },
    };

    it('shows the secret notice as the pre-commit note, and still shows the modifier for reference', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.getByText(/GM may roll this check secretly/)).toBeInTheDocument();
      expect(screen.getByText('Diplomacy +7')).toBeInTheDocument();
    });

    it('adopts the shell with the existing roll flow unchanged (no waiting phase)', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(pill('Done'));
      tapFace(12);
      fireEvent.click(pill('Resolve Gather Information'));
      // Commits straight to the result card — no GM-waits rail.
      expect(screen.getByText('Success')).toBeInTheDocument();
    });
  });

  describe('skill-pick activity', () => {
    const activity = {
      name: 'Learn a Spell',
      mechanics: { roll: { type: 'skill-pick', skills: ['arcana', 'occultism', 'religion', 'nature'] } },
    };

    it('shows only trained skills as options in the Edit panel', () => {
      useCharacter.mockReturnValue(makeModel({ arcana: 2 }));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      expect(screen.getByRole('button', { name: 'Arcana' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Occultism' })).not.toBeInTheDocument();
    });

    it('shows empty message when no skills are trained', () => {
      useCharacter.mockReturnValue(makeModel({}));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      expect(screen.getByText(/No trained skills available/)).toBeInTheDocument();
    });

    it('shows the bonus after picking a skill', () => {
      useCharacter.mockReturnValue(makeModel({ arcana: 2, religion: 1 }));
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      expect(screen.queryByText('Arcana +7')).not.toBeInTheDocument();
      fireEvent.click(pill('Edit'));
      fireEvent.click(screen.getByRole('button', { name: 'Arcana' }));
      expect(screen.getByText('Arcana +7')).toBeInTheDocument();
    });
  });

  describe('on-success effect (Avoid Notice)', () => {
    const activity = {
      name: 'Avoid Notice',
      mechanics: { roll: { type: 'skill', skill: 'stealth', onSuccessEffect: 'avoid-notice-hidden' } },
    };

    const rollTo = (face, dc) => {
      fireEvent.click(pill('Edit'));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: String(dc) } });
      fireEvent.click(pill('Done'));
      tapFace(face);
      fireEvent.click(pill('Resolve Avoid Notice'));
    };

    it('applies nothing and notes "success required" on a failure', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      rollTo(1, 20);
      expect(mockSendUpdate).not.toHaveBeenCalled();
      expect(screen.getByText(/Avoiding Notice — success required/)).toBeInTheDocument();
    });

    it('applies the effect automatically inside the commit on success', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      rollTo(15, 18);
      // 15+7=22, DC=18 → success
      expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'effects', expect.arrayContaining([
        expect.objectContaining({ effectId: 'avoid-notice-hidden', source: 'exploration' }),
      ]));
      expect(screen.getByText(/Avoiding Notice applied/)).toBeInTheDocument();
    });

    it('the commit guard means a double tap still only applies the effect once', () => {
      render(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />);
      fireEvent.click(pill('Edit'));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(pill('Done'));
      tapFace(15);
      const commit = pill('Resolve Avoid Notice');
      fireEvent.click(commit);
      fireEvent.click(commit);
      expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    });
  });

  describe('party target picker + on-success effect (Treat Poison)', () => {
    const activity = {
      name: 'Treat Poison',
      mechanics: {
        roll: { type: 'skill', skill: 'medicine', target: 'party-pc', onSuccessEffect: 'treat-poison-resist' },
      },
    };

    it('shows party member buttons in the Edit panel', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      fireEvent.click(pill('Edit'));
      expect(screen.getByRole('button', { name: 'Izzy' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Jade' })).toBeInTheDocument();
    });

    it('does not show the modifier and blocks the die until a target is picked', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      expect(screen.queryByText(/\+7/)).not.toBeInTheDocument();
      expect(screen.getByText('Pick a target in Edit before rolling.')).toBeInTheDocument();
      within(pad()).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
    });

    it('shows the modifier and applies effect to the picked target on success', () => {
      render(withParty(<RollActivityModal isOpen={true} onClose={() => {}} activity={activity} character={character} />));
      fireEvent.click(pill('Edit'));
      fireEvent.click(screen.getByRole('button', { name: 'Jade' }));
      fireEvent.change(screen.getByLabelText('DC'), { target: { value: '18' } });
      fireEvent.click(pill('Done'));
      expect(screen.getByText('Jade · Medicine +7')).toBeInTheDocument();

      tapFace(15);
      fireEvent.click(pill('Resolve Treat Poison'));
      // 15+7=22, DC=18 → success, applied to the picked target (Jade)
      expect(mockSendUpdate).toHaveBeenCalledWith('jade', 'effects', expect.arrayContaining([
        expect.objectContaining({ effectId: 'treat-poison-resist', source: 'exploration' }),
      ]));
      expect(screen.getByText(/Treat Poison applied to Jade/)).toBeInTheDocument();
    });
  });
});
