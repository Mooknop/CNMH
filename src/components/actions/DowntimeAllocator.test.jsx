import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import DowntimeAllocator from './DowntimeAllocator';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { usePartyDowntime } from '../../hooks/usePartyDowntime';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../hooks/usePartyDowntime', () => ({ usePartyDowntime: vi.fn() }));

const PERIOD = 'P1';
const block = { days: 7, active: true, startedAt: PERIOD };
const character = { id: 'char-1', name: 'Pellias Brightshield' };
const stamp = (o) => ({ periodStartedAt: PERIOD, ...o });

// Key-aware useSyncedState: downtime (per-PC), craftprojects/training (per-PC),
// and the global benchmark/support maps each get their own [value, setter] pair.
const setupSynced = ({
  downtime = null, setDowntime = vi.fn(),
  craft = null, setCraft = vi.fn(),
  training = null, setTraining = vi.fn(),
  support = null, bench = null,
} = {}) => {
  useSyncedState.mockImplementation((key) => {
    if (key === 'cnmh_downtimebench_global') return [bench, vi.fn()];
    if (key === 'cnmh_support_global') return [support, vi.fn()];
    if (key.startsWith('cnmh_craftprojects_')) return [craft, setCraft];
    if (key.startsWith('cnmh_training_')) return [training, setTraining];
    if (key.startsWith('cnmh_downtime_')) return [downtime, setDowntime];
    return [null, vi.fn()];
  });
  return { setDowntime, setCraft, setTraining };
};

beforeEach(() => {
  vi.clearAllMocks();
  useCharacter.mockReturnValue({ flags: {}, skillProficiencies: { crafting: 0 } });
  usePartyDowntime.mockReturnValue({ party: [], readyCount: 0, total: 1 });
});

describe('DowntimeAllocator', () => {
  it('renders a control for each eligible activity (Crafting hidden when untrained)', () => {
    setupSynced({ downtime: stamp({}) });
    render(<DowntimeAllocator character={character} block={block} />);
    expect(screen.getByText('Earn Income')).toBeInTheDocument();
    expect(screen.getByText('Retrain')).toBeInTheDocument();
    expect(screen.getByText('Research')).toBeInTheDocument();
    expect(screen.queryByText('Crafting')).not.toBeInTheDocument();
  });

  it('shows the Crafting control when trained in Crafting', () => {
    useCharacter.mockReturnValue({ flags: {}, skillProficiencies: { crafting: 1 } });
    setupSynced({ downtime: stamp({}) });
    render(<DowntimeAllocator character={character} block={block} />);
    expect(screen.getByText('Crafting')).toBeInTheDocument();
  });

  it('shows the planned/free budget readout', () => {
    setupSynced({ downtime: stamp({ plan: { Research: 3 } }) });
    render(<DowntimeAllocator character={character} block={block} />);
    expect(screen.getByText(/\/ 7 planned · 4 free/)).toBeInTheDocument();
  });

  it('increments a day via the stepper, writing the plan and reopening to planning', () => {
    const { setDowntime } = setupSynced({ downtime: stamp({}) });
    render(<DowntimeAllocator character={character} block={block} />);
    fireEvent.click(screen.getByLabelText('More Research'));
    const updater = setDowntime.mock.calls[0][0];
    expect(updater(stamp({}))).toMatchObject({
      periodStartedAt: PERIOD,
      plan: { Research: 1 },
      status: 'planning',
    });
  });

  it('caps a slider at the remaining free days', () => {
    // 6 of 7 days already on Earn Income ⇒ only 1 free; asking for 5 clamps to 1.
    const { setDowntime } = setupSynced({ downtime: stamp({ plan: { 'Earn Income': 6 } }) });
    render(<DowntimeAllocator character={character} block={block} />);
    fireEvent.change(screen.getByLabelText('Research days'), { target: { value: '5' } });
    const updater = setDowntime.mock.calls[0][0];
    expect(updater(stamp({ plan: { 'Earn Income': 6 } })).plan).toEqual({ 'Earn Income': 6, Research: 1 });
  });

  it('disables Lock-in until at least one day is allocated', () => {
    setupSynced({ downtime: stamp({}) });
    render(<DowntimeAllocator character={character} block={block} />);
    expect(screen.getByRole('button', { name: /Lock in/ })).toBeDisabled();
    expect(screen.getByText('Allocate at least one day to lock in.')).toBeInTheDocument();
  });

  it('locks in a plan, setting status to ready', () => {
    const { setDowntime } = setupSynced({ downtime: stamp({ plan: { Research: 2 } }) });
    render(<DowntimeAllocator character={character} block={block} />);
    const lock = screen.getByRole('button', { name: /Lock in/ });
    expect(lock).not.toBeDisabled();
    fireEvent.click(lock);
    const updater = setDowntime.mock.calls[0][0];
    expect(updater(stamp({ plan: { Research: 2 } }))).toMatchObject({ status: 'ready' });
  });

  it('reopens a locked plan to planning when edited', () => {
    const { setDowntime } = setupSynced({ downtime: stamp({ plan: { Research: 2 }, status: 'ready' }) });
    render(<DowntimeAllocator character={character} block={block} />);
    expect(screen.getByText('Plan locked — tap to edit')).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('More Research'));
    const updater = setDowntime.mock.calls[0][0];
    expect(updater(stamp({ plan: { Research: 2 }, status: 'ready' }))).toMatchObject({ status: 'planning' });
  });

  describe('crafting hour banking', () => {
    const craftState = {
      projects: [{ id: 'p1', name: 'Cold Iron Sword', hours: 0, threshold: 16, status: 'in-progress' }],
    };
    const trained = () => useCharacter.mockReturnValue({ flags: {}, skillProficiencies: { crafting: 2 } });

    it('shows the per-project allocation panel when Crafting days are planned', () => {
      trained();
      setupSynced({ downtime: stamp({ plan: { Crafting: 2 } }), craft: craftState });
      render(<DowntimeAllocator character={character} block={block} />);
      expect(screen.getByText('Bank 16h across projects')).toBeInTheDocument();
      expect(screen.getByText('Cold Iron Sword')).toBeInTheDocument();
      expect(screen.getByText('16 / 16h allocated')).toBeInTheDocument();
    });

    it('banks the allocated hours into the project and records craftApplied on lock-in', () => {
      trained();
      const { setDowntime, setCraft } = setupSynced({
        downtime: stamp({ plan: { Crafting: 2 } }),
        craft: craftState,
      });
      render(<DowntimeAllocator character={character} block={block} />);
      fireEvent.click(screen.getByRole('button', { name: /Lock in/ }));

      // Project hours banked +16.
      const craftUpdater = setCraft.mock.calls[0][0];
      expect(craftUpdater(craftState).projects[0].hours).toBe(16);

      // Downtime stamped ready with craftApplied tracking the banked hours.
      const dtUpdater = setDowntime.mock.calls[0][0];
      const next = dtUpdater(stamp({ plan: { Crafting: 2 } }));
      expect(next).toMatchObject({ status: 'ready', craftApplied: { p1: 16 } });
    });

    it('does not let Crafting drop below already-banked days', () => {
      trained();
      // 16h (2 days) already banked this period; Crafting slider min is 2.
      const { setDowntime } = setupSynced({
        downtime: stamp({ plan: { Crafting: 3 }, craftApplied: { p1: 16 } }),
        craft: craftState,
      });
      render(<DowntimeAllocator character={character} block={block} />);
      fireEvent.change(screen.getByLabelText('Crafting days'), { target: { value: '0' } });
      const updater = setDowntime.mock.calls[0][0];
      expect(updater(stamp({ plan: { Crafting: 3 }, craftApplied: { p1: 16 } })).plan.Crafting).toBe(2);
    });
  });

  describe('training hour banking (#1191 S1)', () => {
    const trainState = {
      tracks: [{
        id: 't1', vendorId: 'sandpoint-garrison', offeringId: 'shield-block',
        hours: 0, benchmarkHours: 160, status: 'in-progress', startedAt: 0,
      }],
    };

    it('hides Training when there is nothing to train', () => {
      setupSynced({ downtime: stamp({}) });
      render(<DowntimeAllocator character={character} block={block} />);
      expect(screen.queryByText('Training')).not.toBeInTheDocument();
    });

    it('shows Training when a track is in progress', () => {
      setupSynced({ downtime: stamp({}), training: trainState });
      render(<DowntimeAllocator character={character} block={block} />);
      expect(screen.getByText('Training')).toBeInTheDocument();
    });

    it('shows Training when a supported vendor offers an eligible track', () => {
      setupSynced({ downtime: stamp({}), support: { 'sandpoint-garrison': { earnedAt: null } } });
      render(<DowntimeAllocator character={character} block={block} />);
      expect(screen.getByText('Training')).toBeInTheDocument();
    });

    it('hides Training when the supported vendor has no eligible offering', () => {
      // The classless test PC can't learn any Monk stance, so a supported House
      // of Blue Stones offers them nothing (the Garrison always offers Shield
      // Block or, once known, the Specialized tiers — it can't dead-end).
      setupSynced({ downtime: stamp({}), support: { 'house-of-blue-stones': { earnedAt: null } } });
      render(<DowntimeAllocator character={character} block={block} />);
      expect(screen.queryByText('Training')).not.toBeInTheDocument();
    });

    it('banks the allocated hours into the track and records trainApplied on lock-in', () => {
      const { setDowntime, setTraining } = setupSynced({
        downtime: stamp({ plan: { Training: 2 } }),
        training: trainState,
      });
      render(<DowntimeAllocator character={character} block={block} />);
      expect(screen.getByText('Bank 16h across tracks')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: /Lock in/ }));

      // Track hours banked +16.
      const trainUpdater = setTraining.mock.calls[0][0];
      expect(trainUpdater(trainState).tracks[0].hours).toBe(16);

      // Downtime stamped ready with trainApplied tracking the banked hours.
      const dtUpdater = setDowntime.mock.calls[0][0];
      const next = dtUpdater(stamp({ plan: { Training: 2 } }));
      expect(next).toMatchObject({ status: 'ready', trainApplied: { t1: 16 } });
    });

    it('does not let Training drop below already-banked days', () => {
      const { setDowntime } = setupSynced({
        downtime: stamp({ plan: { Training: 3 }, trainApplied: { t1: 16 } }),
        training: trainState,
      });
      render(<DowntimeAllocator character={character} block={block} />);
      fireEvent.change(screen.getByLabelText('Training days'), { target: { value: '0' } });
      const updater = setDowntime.mock.calls[0][0];
      expect(updater(stamp({ plan: { Training: 3 }, trainApplied: { t1: 16 } })).plan.Training).toBe(2);
    });
  });

  describe('Follow-the-Expert pairing', () => {
    // A teammate who is the party's Research expert and is researching this week.
    const expertParty = [{
      char: { id: 'ash', name: 'Ashka Gosh', skills: { occultism: { proficiency: 3 } } },
      plan: { Research: 4 },
    }];

    it('offers a pairing affordance when an eligible expert is doing the activity', () => {
      usePartyDowntime.mockReturnValue({ party: expertParty, readyCount: 0, total: 2 });
      setupSynced({ downtime: stamp({ plan: { Research: 2 } }) });
      const { container } = render(<DowntimeAllocator character={character} block={block} />);
      const pair = container.querySelector('.dta-pair');
      expect(pair).not.toBeNull();
      expect(within(pair).getByText(/Study under/)).toBeInTheDocument();
      expect(within(pair).getByText('Ashka')).toBeInTheDocument();
    });

    it('hides the affordance when you have no day on the activity', () => {
      usePartyDowntime.mockReturnValue({ party: expertParty, readyCount: 0, total: 2 });
      setupSynced({ downtime: stamp({ plan: { 'Earn Income': 2 } }) });
      const { container } = render(<DowntimeAllocator character={character} block={block} />);
      expect(container.querySelector('.dta-pair')).toBeNull();
    });

    it('hides the affordance when no teammate is an eligible expert', () => {
      usePartyDowntime.mockReturnValue({ party: [], readyCount: 0, total: 1 });
      setupSynced({ downtime: stamp({ plan: { Research: 2 } }) });
      const { container } = render(<DowntimeAllocator character={character} block={block} />);
      expect(container.querySelector('.dta-pair')).toBeNull();
    });

    it('toggles the pairing, recording the expert id and reopening to planning', () => {
      usePartyDowntime.mockReturnValue({ party: expertParty, readyCount: 0, total: 2 });
      const { setDowntime } = setupSynced({ downtime: stamp({ plan: { Research: 2 } }) });
      const { container } = render(<DowntimeAllocator character={character} block={block} />);
      fireEvent.click(container.querySelector('.dta-pair'));
      const updater = setDowntime.mock.calls[0][0];
      expect(updater(stamp({ plan: { Research: 2 } }))).toMatchObject({
        paired: { Research: 'ash' },
        status: 'planning',
      });
    });

    it('clears the pairing when the activity is removed', () => {
      usePartyDowntime.mockReturnValue({ party: expertParty, readyCount: 0, total: 2 });
      const { setDowntime } = setupSynced({ downtime: stamp({ plan: { Research: 2 }, paired: { Research: 'ash' } }) });
      render(<DowntimeAllocator character={character} block={block} />);
      fireEvent.change(screen.getByLabelText('Research days'), { target: { value: '0' } });
      const updater = setDowntime.mock.calls[0][0];
      const next = updater(stamp({ plan: { Research: 2 }, paired: { Research: 'ash' } }));
      expect(next.plan.Research).toBeUndefined();
      expect(next.paired.Research).toBeUndefined();
    });
  });
});
