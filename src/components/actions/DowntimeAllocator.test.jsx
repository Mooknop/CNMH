import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeAllocator from './DowntimeAllocator';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';

vi.mock('../../hooks/useSyncedState', () => ({ useSyncedState: vi.fn() }));
vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));

const PERIOD = 'P1';
const block = { days: 7, active: true, startedAt: PERIOD };
const character = { id: 'char-1', name: 'Pellias Brightshield' };
const stamp = (o) => ({ periodStartedAt: PERIOD, ...o });

// Key-aware useSyncedState: downtime (per-PC), craftprojects (per-PC), and the
// global benchmark map each get their own [value, setter] pair.
const setupSynced = ({ downtime = null, setDowntime = vi.fn(), craft = null, setCraft = vi.fn(), bench = null } = {}) => {
  useSyncedState.mockImplementation((key) => {
    if (key === 'cnmh_downtimebench_global') return [bench, vi.fn()];
    if (key.startsWith('cnmh_craftprojects_')) return [craft, setCraft];
    if (key.startsWith('cnmh_downtime_')) return [downtime, setDowntime];
    return [null, vi.fn()];
  });
  return { setDowntime, setCraft };
};

beforeEach(() => {
  vi.clearAllMocks();
  useCharacter.mockReturnValue({ flags: {}, skillProficiencies: { crafting: 0 } });
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
});
