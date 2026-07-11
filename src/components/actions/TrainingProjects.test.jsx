import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import TrainingProjects from './TrainingProjects';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useLocationSupport } from '../../hooks/useLocationSupport';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useLocationSupport', () => ({ useLocationSupport: vi.fn() }));

const character = { id: 'char-1', name: 'Pellias', class: 'Champion' };

// Fixture catalog exercising every eligibility knob (the shipped catalog only
// carries Shield Block until S3).
const VENDORS = [
  {
    id: 'sandpoint-garrison',
    name: 'Sandpoint Garrison',
    offerings: [
      {
        id: 'shield-block', name: 'Shield Block', hours: 160, kind: 'reaction',
        requiresClass: null, skipIfKnown: true, requiresAbility: null, choices: null,
        summary: 'Snap your shield in place to ward off a blow.',
      },
      {
        id: 'specialized-medium', name: 'Specialized Shield Training (Medium)', hours: 160, kind: 'reaction',
        requiresClass: null, skipIfKnown: false, requiresAbility: 'Shield Block',
        choices: [
          { id: 'aiding-shield', name: 'Aiding Shield', note: null },
          { id: 'covering-shield', name: 'Covering Shield', note: null },
        ],
        summary: 'Pick one reaction from the medium tier.',
      },
    ],
  },
  {
    id: 'house-of-blue-stones',
    name: 'House of Blue Stones',
    offerings: [
      {
        id: 'monk-stance', name: 'New Monk Stance', hours: 160, kind: 'feat',
        requiresClass: 'Monk', skipIfKnown: false, requiresAbility: null, choices: null,
        summary: 'Learn a new stance.',
      },
    ],
  },
];

const setup = ({ training = null, setTraining = vi.fn(), supported = {} } = {}) => {
  useSyncedState.mockImplementation((key) => {
    if (key.startsWith('cnmh_training_')) return [training, setTraining];
    return [null, vi.fn()];
  });
  useLocationSupport.mockReturnValue({
    supported,
    isSupported: (id) => Boolean(supported[id]),
    setSupport: vi.fn(),
  });
  return { setTraining };
};

beforeEach(() => vi.clearAllMocks());

describe('TrainingProjects', () => {
  it('renders nothing without tracks or a supported vendor', () => {
    setup();
    const { container } = render(<TrainingProjects character={character} vendors={VENDORS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the only supported vendor has no eligible offerings', () => {
    // Not a Monk — House of Blue Stones offers nothing.
    setup({ supported: { 'house-of-blue-stones': { earnedAt: null } } });
    const { container } = render(<TrainingProjects character={character} vendors={VENDORS} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('starts a track at a supported vendor, writing the full track shape', () => {
    const { setTraining } = setup({ supported: { 'sandpoint-garrison': { earnedAt: null } } });
    render(<TrainingProjects character={character} vendors={VENDORS} />);

    fireEvent.click(screen.getByText('+ New'));
    fireEvent.change(screen.getByLabelText('Training track'), {
      target: { value: 'sandpoint-garrison::shield-block' },
    });
    expect(screen.getByText(/ward off a blow/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Start training'));

    const updater = setTraining.mock.calls[0][0];
    const next = updater(null);
    expect(next.tracks).toHaveLength(1);
    expect(next.tracks[0]).toMatchObject({
      vendorId: 'sandpoint-garrison',
      offeringId: 'shield-block',
      hours: 0,
      benchmarkHours: 160,
      status: 'in-progress',
    });
    expect(next.tracks[0].choiceId).toBeUndefined();
  });

  it('requires picking a choice before starting a choice track', () => {
    // Has Shield Block innately, so the specialized track is offered.
    const knower = { ...character, reactions: [{ name: 'Shield Block' }] };
    const { setTraining } = setup({ supported: { 'sandpoint-garrison': { earnedAt: null } } });
    render(<TrainingProjects character={knower} vendors={VENDORS} />);

    fireEvent.click(screen.getByText('+ New'));
    fireEvent.change(screen.getByLabelText('Training track'), {
      target: { value: 'sandpoint-garrison::specialized-medium' },
    });
    expect(screen.getByText('Start training')).toBeDisabled();

    fireEvent.change(screen.getByLabelText('Training choice'), {
      target: { value: 'covering-shield' },
    });
    fireEvent.click(screen.getByText('Start training'));

    const next = setTraining.mock.calls[0][0](null);
    expect(next.tracks[0]).toMatchObject({
      offeringId: 'specialized-medium',
      choiceId: 'covering-shield',
    });
  });

  it('hides ineligible offerings from the picker (skipIfKnown, requiresAbility)', () => {
    // Knows Shield Block: the Shield Block track disappears, specialized appears.
    const knower = { ...character, reactions: [{ name: 'Shield Block' }] };
    setup({ supported: { 'sandpoint-garrison': { earnedAt: null } } });
    render(<TrainingProjects character={knower} vendors={VENDORS} />);
    fireEvent.click(screen.getByText('+ New'));
    expect(screen.queryByRole('option', { name: /Shield Block \(160h\)/ })).not.toBeInTheDocument();
    expect(screen.getByRole('option', { name: /Specialized Shield Training/ })).toBeInTheDocument();
  });

  it('shows an in-progress track with its banked progress', () => {
    setup({
      training: {
        tracks: [{
          id: 't1', vendorId: 'sandpoint-garrison', offeringId: 'shield-block',
          hours: 48, benchmarkHours: 160, status: 'in-progress', startedAt: 0,
        }],
      },
    });
    render(<TrainingProjects character={character} vendors={VENDORS} />);
    expect(screen.getByText('Shield Block')).toBeInTheDocument();
    expect(screen.getByText('48h / 160h')).toBeInTheDocument();
    expect(screen.getByText('Sandpoint Garrison')).toBeInTheDocument();
  });

  it('shows the ready state once the hour total is met (submission is S2)', () => {
    setup({
      training: {
        tracks: [{
          id: 't1', vendorId: 'sandpoint-garrison', offeringId: 'specialized-medium',
          choiceId: 'aiding-shield', hours: 160, benchmarkHours: 160,
          status: 'in-progress', startedAt: 0,
        }],
      },
    });
    render(<TrainingProjects character={character} vendors={VENDORS} />);
    expect(screen.getByText('✓ Training complete')).toBeInTheDocument();
    expect(screen.getByText(/awaiting GM confirmation/)).toBeInTheDocument();
    expect(screen.getByText('Specialized Shield Training (Medium): Aiding Shield')).toBeInTheDocument();
  });

  it('abandons a track', () => {
    const training = {
      tracks: [{
        id: 't1', vendorId: 'sandpoint-garrison', offeringId: 'shield-block',
        hours: 8, benchmarkHours: 160, status: 'in-progress', startedAt: 0,
      }],
    };
    const { setTraining } = setup({ training });
    render(<TrainingProjects character={character} vendors={VENDORS} />);
    fireEvent.click(screen.getByLabelText('Abandon Shield Block'));
    const next = setTraining.mock.calls[0][0](training);
    expect(next.tracks).toHaveLength(0);
  });
});
