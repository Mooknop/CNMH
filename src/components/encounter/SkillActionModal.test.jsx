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
vi.mock('../../utils/gameTime', () => ({ toGameSeconds: () => 1000 }));
vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({ gameDate: {}, time: {} }),
}));
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ effects: [] }),
}));

const action = getSkillAction('demoralize');
const character = { id: 'izzy', name: 'Izzy', abilities: {}, skills: {} };

// Enemy A has a known Will save (mod 4 → DC 14); Enemy B has no defenses (GM DC).
const order = [
  { entryId: 'e-a', kind: 'enemy', name: 'Goblin', defenses: { ac: 16, saves: { will: 4 } } },
  { entryId: 'e-b', kind: 'enemy', name: 'Orc' },
  { entryId: 'p-1', kind: 'pc', charId: 'jade', name: 'Jade' },
];

let spendActions, applyCondition, stampImmunity, appendLog, isImmuneFn;

beforeEach(() => {
  spendActions = vi.fn();
  applyCondition = vi.fn();
  stampImmunity = vi.fn();
  appendLog = vi.fn();
  isImmuneFn = vi.fn(() => false);

  useCharacter.mockReturnValue({ flags: {} });
  useEffects.mockReturnValue({ effects: [] });
  useSyncedState.mockImplementation(() => [[], vi.fn()]);
  useEncounter.mockReturnValue({ encounter: { order }, appendLog });
  useTurnState.mockReturnValue({ spendActions });
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
});
