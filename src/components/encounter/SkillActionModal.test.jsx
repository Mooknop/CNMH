import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SkillActionModal from './SkillActionModal';
import { getSkillAction } from '../../data/skillActions';
import { useCharacter } from '../../hooks/useCharacter';
import { useEffects } from '../../hooks/useEffects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useEnemyEffects } from '../../hooks/useEnemyEffects';
import { resolveActionRoll } from '../../utils/rollResolution';

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
  },
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/useEffects', () => ({ useEffects: vi.fn() }));
vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useEncounter', () => ({ useEncounter: vi.fn() }));
vi.mock('../../hooks/useTurnState', () => ({ useTurnState: vi.fn() }));
vi.mock('../../hooks/useEnemyEffects', () => ({ useEnemyEffects: vi.fn() }));
vi.mock('../../utils/rollResolution', () => ({ resolveActionRoll: vi.fn() }));
vi.mock('../../utils/CharacterUtils', () => ({
  getSkillModifier: (_c, s) => ({ athletics: 8, acrobatics: 5 }[s] ?? 0),
}));
vi.mock('../../utils/gameTime', () => ({ toGameSeconds: () => 1000 }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: {}, time: {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

const mockGetState = vi.fn(() => []);
const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ getState: (...a) => mockGetState(...a), sendUpdate: (...a) => mockSendUpdate(...a) }),
}));

const action = getSkillAction('demoralize');
const character = { id: 'izzy', name: 'Izzy', abilities: {}, skills: {} };

// Enemy A has known saves (mod 4 → DC 14 each); Enemy B has no defenses (GM DC).
const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Goblin', defenses: { ac: 16, saves: { will: 4, reflex: 4, fortitude: 4 } } },
  { entryId: 'e-b', kind: 'enemy', name: 'Orc' },
  { entryId: 'p-1', kind: 'pc', charId: 'jade', name: 'Jade' },
];

let spendActions, recordAttack, applyCondition, stampImmunity, appendLog, isImmuneFn;

beforeEach(() => {
  spendActions = vi.fn();
  recordAttack = vi.fn();
  applyCondition = vi.fn();
  stampImmunity = vi.fn();
  appendLog = vi.fn();
  isImmuneFn = vi.fn(() => false);
  mockGetState.mockReturnValue([]);
  mockSendUpdate.mockClear();

  useCharacter.mockReturnValue({ flags: {} });
  useEffects.mockReturnValue({ effects: [] });
  useSyncedState.mockImplementation(() => [[], vi.fn()]);
  useEncounter.mockReturnValue({ encounter: { order }, appendLog });
  useTurnState.mockReturnValue({ spendActions, recordAttack, turnState: { attacksMade: 0 } });
  useEnemyEffects.mockReturnValue({
    applyCondition, stampImmunity, isImmune: isImmuneFn,
  });
  resolveActionRoll.mockReturnValue({ mode: 'actor-roll', bonus: 5 });
});

const pickGoblin = () => fireEvent.click(screen.getByRole('button', { name: 'Goblin' }));

describe('SkillActionModal (Demoralize)', () => {
  it('renders nothing when closed', () => {
    const { container } = render(
      <SkillActionModal isOpen={false} onClose={() => {}} action={action} character={character} />
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists only enemy targets (PCs excluded)', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    expect(screen.getByRole('button', { name: 'Goblin' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Orc' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Jade' })).not.toBeInTheDocument();
  });

  it('prefills the Will DC from the enemy defenses and crit-success applies frightened 2', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    pickGoblin();
    // DC prefilled to 14 (10 + 4); d20 19 + 5 = 24 ≥ 24 → critical success
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '19' } });
    expect(screen.getByText('Critical Success — Frightened 2')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Use Demoralize/ }));
    expect(spendActions).toHaveBeenCalledTimes(1);
    expect(spendActions).toHaveBeenCalledWith(1, 'Demoralize');
    expect(applyCondition).toHaveBeenCalledWith('e-a', expect.objectContaining({ id: 'frightened', value: 2 }));
    expect(stampImmunity).toHaveBeenCalledWith('e-a', expect.objectContaining({ abilityKey: 'demoralize', durationSecs: 600 }));
  });

  it('success applies frightened 1', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    pickGoblin();
    // d20 10 + 5 = 15 ≥ 14 → success (not crit)
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('Success — Frightened 1')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Demoralize/ }));
    expect(applyCondition).toHaveBeenCalledWith('e-a', expect.objectContaining({ id: 'frightened', value: 1 }));
  });

  it('failure applies no condition but still stamps immunity', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    pickGoblin();
    // d20 5 + 5 = 10; DC 14 → failure (10 > 14-10=4, < 14)
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '5' } });
    expect(screen.getByText('Failure — no effect')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Demoralize/ }));
    expect(applyCondition).not.toHaveBeenCalled();
    expect(stampImmunity).toHaveBeenCalledTimes(1);
  });

  it('uses a GM-entered DC when the enemy has no defenses', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    fireEvent.click(screen.getByRole('button', { name: 'Orc' }));
    fireEvent.change(screen.getByLabelText('Will DC'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('Success — Frightened 1')).toBeInTheDocument();
  });

  it('blocks the action when the target is already immune', () => {
    isImmuneFn.mockReturnValue(true);
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    pickGoblin();
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '19' } });
    const btn = screen.getByRole('button', { name: 'Target is immune' });
    expect(btn).toBeDisabled();
    fireEvent.click(btn);
    expect(spendActions).not.toHaveBeenCalled();
    expect(applyCondition).not.toHaveBeenCalled();
  });

  it('does not show a MAP toggle and never advances MAP', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={action} character={character} />);
    pickGoblin();
    expect(screen.queryByText('Multiple attack penalty')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '19' } });
    fireEvent.click(screen.getByRole('button', { name: /Use Demoralize/ }));
    expect(recordAttack).not.toHaveBeenCalled();
  });
});

describe('SkillActionModal (Athletics maneuvers)', () => {
  const trip = getSkillAction('trip');
  const grapple = getSkillAction('grapple');
  const shove = getSkillAction('shove');

  it('Trip success applies prone to the enemy and advances MAP', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={trip} character={character} />);
    pickGoblin();
    // Reflex DC 14; d20 10 + 5 = 15 → success
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('Success — Prone')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Trip/ }));
    expect(applyCondition).toHaveBeenCalledWith('e-a', expect.objectContaining({ id: 'prone' }));
    expect(recordAttack).toHaveBeenCalledWith(1);
    expect(stampImmunity).not.toHaveBeenCalled();
  });

  it('Grapple crit-success applies restrained', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={grapple} character={character} />);
    pickGoblin();
    // Fortitude DC 14; d20 19 + 5 = 24 ≥ 24 → critical success
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '19' } });
    expect(screen.getByText('Critical Success — Restrained')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Grapple/ }));
    expect(applyCondition).toHaveBeenCalledWith('e-a', expect.objectContaining({ id: 'restrained' }));
  });

  it('Shove success logs a note and applies no enemy condition', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={shove} character={character} />);
    pickGoblin();
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('Success — Pushed back 5 ft')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Shove/ }));
    expect(applyCondition).not.toHaveBeenCalled();
    expect(recordAttack).toHaveBeenCalledWith(1);
    expect(appendLog).toHaveBeenCalledWith(expect.objectContaining({ text: expect.stringContaining('Pushed back 5 ft') }));
  });

  it('Trip crit-failure leaves the acting PC prone via a conditions sync', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={trip} character={character} />);
    pickGoblin();
    // d20 1 + 5 = 6 vs DC 14 → failure, nat-1 shifts to critical failure
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Use Trip/ }));
    expect(applyCondition).not.toHaveBeenCalled();
    expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'conditions', [{ id: 'prone', value: null }]);
  });

  it('reads the current MAP step from attacksMade and shows the toggle', () => {
    useTurnState.mockReturnValue({ spendActions, recordAttack, turnState: { attacksMade: 1 } });
    render(<SkillActionModal isOpen onClose={() => {}} action={trip} character={character} />);
    pickGoblin();
    expect(screen.getByText('Multiple attack penalty')).toBeInTheDocument();
    expect(resolveActionRoll).toHaveBeenCalledWith(
      expect.objectContaining({ traits: ['Attack'] }),
      character,
      expect.objectContaining({ mapStep: 1 }),
    );
  });
});

describe('SkillActionModal (Feint)', () => {
  const feint = getSkillAction('feint');

  it('rolls vs a GM-entered Perception DC and applies off-guard on success', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={feint} character={character} />);
    pickGoblin(); // Goblin has no perception → GM enters the DC
    fireEvent.change(screen.getByLabelText('Perception DC'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('Success — Off-Guard')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Feint/ }));
    expect(applyCondition).toHaveBeenCalledWith('e-a', expect.objectContaining({ id: 'off-guard' }));
    expect(recordAttack).not.toHaveBeenCalled(); // Feint has no Attack trait
    expect(stampImmunity).not.toHaveBeenCalled();
  });

  it('crit-failure leaves the acting PC off-guard', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={feint} character={character} />);
    pickGoblin();
    fireEvent.change(screen.getByLabelText('Perception DC'), { target: { value: '14' } });
    // d20 1 + 5 = 6 vs DC 14 → failure, nat-1 shifts to critical failure
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByRole('button', { name: /Use Feint/ }));
    expect(applyCondition).not.toHaveBeenCalled();
    expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'conditions', [{ id: 'off-guard', value: null }]);
  });
});

describe('SkillActionModal (Escape)', () => {
  const escape = getSkillAction('escape');

  it('is self-targeted: no enemy picker, with a skill choice', () => {
    render(<SkillActionModal isOpen onClose={() => {}} action={escape} character={character} />);
    expect(screen.queryByRole('button', { name: 'Goblin' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Athletics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Acrobatics' })).toBeInTheDocument();
  });

  it('success sheds grabbed from the acting PC and advances MAP', () => {
    // The PC is currently grabbed (both the preview source and the write source).
    useSyncedState.mockImplementation(() => [[{ id: 'grabbed', value: null }], vi.fn()]);
    mockGetState.mockReturnValue([{ id: 'grabbed', value: null }]);
    render(<SkillActionModal isOpen onClose={() => {}} action={escape} character={character} />);
    fireEvent.change(screen.getByLabelText('DC'), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText('d20 roll'), { target: { value: '10' } });
    expect(screen.getByText('Success — you are no longer Grabbed')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Use Escape/ }));
    expect(mockSendUpdate).toHaveBeenCalledWith('izzy', 'conditions', []);
    expect(recordAttack).toHaveBeenCalledWith(1); // Escape has the Attack trait
    expect(applyCondition).not.toHaveBeenCalled();
  });
});
