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
// Persistent payloads write through the shared persistent-damage map.
const mockSetPersistent = vi.fn();
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: () => [{}, mockSetPersistent],
}));

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

  describe('persistent payloads (no save on firing)', () => {
    // Gruesome Marionettist: the cast-time save already set severity, so firing
    // applies the bleed directly rather than calling for another save.
    const bleed = {
      ...payload,
      id: 'armed-2',
      label: 'Prohibited-action bleed',
      trigger: 'the creature takes the PROHIBITED action',
      defense: undefined,
      repeatable: true,
      spellLevel: 5,
      rank: 5,
      abilityName: 'Gruesome Marionettist',
      damageData: {
        riders: [{ id: 'r', label: 'bleed', persistent: { dice: '5d10', type: 'bleed' } }],
        heightened: { '+1': { persistent: '1d10' } },
      },
    };

    it('offers a severity picker instead of a rolled-total input', () => {
      withPayloads([{ ...bleed, severityFromSave: true }]);
      render(<ArmedPayloads />);
      expect(screen.getByLabelText('Prohibited-action bleed severity')).toBeInTheDocument();
      expect(screen.queryByLabelText('Prohibited-action bleed damage')).not.toBeInTheDocument();
    });

    it('hides the severity picker when severity never varies (an area tick)', () => {
      // Autumn's Howl always applies in full — there was no save to soften it.
      withPayloads([{ ...bleed, severityFromSave: false }]);
      render(<ArmedPayloads />);
      expect(screen.queryByLabelText('Prohibited-action bleed severity')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Prohibited-action bleed damage')).not.toBeInTheDocument();
    });

    it('applies in full when no severity picker is offered', () => {
      withPayloads([{ ...bleed, severityFromSave: false }]);
      render(<ArmedPayloads />);
      fireEvent.click(screen.getByLabelText('Goblin'));
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      const inst = mockSetPersistent.mock.calls[0][0]({})['e-gob'][0];
      expect(inst.dice).toBe('5d10');
      expect(inst.half).toBeUndefined();
    });

    it('a flat per-rank persistent bump adds to the dice rather than adding a die', () => {
      // Autumn's Howl: 1d6 persistent piercing, "+1" per rank → 1d6+2 at rank 4.
      withPayloads([{
        ...bleed,
        spellLevel: 2,
        rank: 4,
        damageData: {
          riders: [{ id: 'r', label: 'p', persistent: { dice: '1d6', type: 'piercing' } }],
          heightened: { '+1': { persistent: 1 } },
        },
      }]);
      render(<ArmedPayloads />);
      expect(screen.getAllByText(/1d6\+2 persistent piercing/).length).toBeGreaterThan(0);
    });

    it('shows the persistent dice, heightened at the armed rank', () => {
      withPayloads([{ ...bleed, rank: 7 }]); // 5d10 +1d10/rank over 5 → 7d10
      render(<ArmedPayloads />);
      expect(screen.getAllByText(/7d10 persistent bleed/).length).toBeGreaterThan(0);
    });

    it('firing records the bleed and pushes no save request', () => {
      withPayloads([bleed]);
      render(<ArmedPayloads />);
      fireEvent.click(screen.getByLabelText('Goblin'));
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      expect(mockAdd).not.toHaveBeenCalled();
      expect(mockSetPersistent).toHaveBeenCalledTimes(1);
      const next = mockSetPersistent.mock.calls[0][0]({});
      expect(next['e-gob']).toHaveLength(1);
      expect(next['e-gob'][0]).toMatchObject({ dice: '5d10', type: 'bleed' });
    });

    it('a critical-failure severity doubles the dice; a success halves', () => {
      withPayloads([{ ...bleed, severityFromSave: true }]);
      const { unmount } = render(<ArmedPayloads />);
      fireEvent.click(screen.getByLabelText('Goblin'));
      fireEvent.change(screen.getByLabelText('Prohibited-action bleed severity'), { target: { value: 'double' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      expect(mockSetPersistent.mock.calls[0][0]({})['e-gob'][0].dice).toBe('10d10');
      unmount();

      vi.clearAllMocks();
      withPayloads([{ ...bleed, severityFromSave: true }]);
      render(<ArmedPayloads />);
      fireEvent.click(screen.getByLabelText('Goblin'));
      fireEvent.change(screen.getByLabelText('Prohibited-action bleed severity'), { target: { value: 'half' } });
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      expect(mockSetPersistent.mock.calls[0][0]({})['e-gob'][0]).toMatchObject({ dice: '5d10', half: true });
    });

    it('stays armed after firing because it is repeatable', () => {
      withPayloads([bleed]);
      render(<ArmedPayloads />);
      fireEvent.click(screen.getByLabelText('Goblin'));
      fireEvent.click(screen.getByRole('button', { name: 'Fire' }));
      expect(mockRemove).not.toHaveBeenCalled();
    });
  });

  it('Dismiss drops the payload without pushing a save', () => {
    withPayloads([payload]);
    render(<ArmedPayloads />);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(mockRemove).toHaveBeenCalledWith('armed-1');
    expect(mockAdd).not.toHaveBeenCalled();
  });
});
