// ArmedPayloads (#987) — the GM panel for damage/saves a cast stored for a
// LATER trigger. Firing one must produce a normal save request, so resolution,
// per-degree damage and IWR all behave exactly as any other save.
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ArmedPayloads from './ArmedPayloads';
import { useEncounter } from '../../hooks/useEncounter';

vi.mock('../../hooks/useEncounter');

const mockAdd = vi.fn();
const mockRemove = vi.fn();
const mockLog = vi.fn();

const payload = {
  id: 'armed-1',
  payloadId: 'targeting-beacon-explosion',
  label: 'Beacon explosion',
  trigger: 'the next attack roll that HITS the beaconed creature',
  defense: 'basic Reflex',
  damageData: { base: '6d6', type: 'fire', heightened: { '+1': { base: '2d6' } } },
  repeatable: false,
  dc: 24,
  rank: 4,
  spellLevel: 4,
  abilityName: 'Targeting Beacon',
  casterId: 'char-a',
  casterName: 'Pellias',
};

const order = [
  { entryId: 'e-pc', kind: 'pc', charId: 'char-a', name: 'Pellias' },
  { entryId: 'e-gob', kind: 'enemy', name: 'Goblin', defenses: { saves: { reflex: 9 } } },
  { entryId: 'e-ogre', kind: 'enemy', name: 'Ogre', defenses: { saves: { reflex: 12 } } },
];

const withPayloads = (armedPayloads) =>
  useEncounter.mockReturnValue({
    encounter: { order, armedPayloads },
    appendLog: mockLog,
    addSaveRequest: mockAdd,
    removeArmedPayload: mockRemove,
  });

beforeEach(() => { vi.clearAllMocks(); });

describe('ArmedPayloads', () => {
  it('renders nothing when no payload is armed', () => {
    withPayloads([]);
    const { container } = render(<ArmedPayloads />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the trigger text so the GM knows when to fire it', () => {
    withPayloads([payload]);
    render(<ArmedPayloads />);
    expect(screen.getByText(/Targeting Beacon/)).toBeInTheDocument();
    expect(screen.getByText(/the next attack roll that HITS/)).toBeInTheDocument();
  });

  it('cannot fire until a target is picked', () => {
    withPayloads([payload]);
    render(<ArmedPayloads />);
    expect(screen.getByRole('button', { name: 'Fire' })).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Goblin'));
    expect(screen.getByRole('button', { name: 'Fire' })).toBeEnabled();
  });

  it('firing pushes a normal save request carrying the payload damage and DC', () => {
    withPayloads([payload]);
    render(<ArmedPayloads />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    fireEvent.change(screen.getByLabelText('Beacon explosion damage'), { target: { value: '21' } });
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));

    expect(mockAdd).toHaveBeenCalledTimes(1);
    const req = mockAdd.mock.calls[0][0];
    expect(req).toMatchObject({
      abilityName: 'Targeting Beacon — Beacon explosion',
      save: 'reflex',
      basic: true,
      dc: 24,
      casterName: 'Pellias',
    });
    expect(req.targets).toEqual([{ entryId: 'e-gob', name: 'Goblin', saveMod: 9 }]);
    expect(req.damage).toMatchObject({ entered: 21, typeLabel: 'fire' });
  });

  it('a one-shot payload is consumed when fired', () => {
    withPayloads([payload]);
    render(<ArmedPayloads />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    expect(mockRemove).toHaveBeenCalledWith('armed-1');
  });

  it('a repeatable payload stays armed after firing', () => {
    withPayloads([{ ...payload, repeatable: true }]);
    render(<ArmedPayloads />);
    fireEvent.click(screen.getByLabelText('Goblin'));
    fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
    expect(mockAdd).toHaveBeenCalledTimes(1);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('heightens the payload at the cast rank it was armed with', () => {
    // 6d6 base +2d6 per rank over its native 4 → armed at rank 6 = 10d6.
    // The panel must show what it will ACTUALLY deal, not the authored base.
    withPayloads([{ ...payload, rank: 6 }]);
    render(<ArmedPayloads />);
    expect(screen.getAllByText(/10d6/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/\b6d6\b/)).not.toBeInTheDocument();
  });

  it('Dismiss drops the payload without pushing a save', () => {
    withPayloads([payload]);
    render(<ArmedPayloads />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mockRemove).toHaveBeenCalledWith('armed-1');
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
