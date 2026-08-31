import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../../test/renderWithProviders';
import PeriodView from './PeriodView';

// Downtime dock — Period & clock view (#1856). Runs against the REAL provider
// stack (renderWithProviders): the block, the per-PC task/benchmark overrides
// and the per-PC downtime plans all ride the in-memory session bus through the
// real useSyncedState, and the Locked-in list's statuses come from the real
// usePartyDowntime/downtimeUtils — nothing here re-derives ready/planning by
// hand. GameDateProvider's default clock is 5 Pharast, 4725 (day 5, month 2).

const ASHKA = makeCharacter({ id: 'pc-ashka', name: 'Ashka', class: 'Fighter' });
const IZZY = makeCharacter({ id: 'pc-izzy', name: 'Izzy', class: 'Witch' });

const BLOCK = { days: 7, active: true, startedAt: { day: 3, month: 2, year: 4725 } };

const mount = ({
  characters = [ASHKA, IZZY],
  block,
  taskMap,
  benchMap,
  downtime = {},
  ...rest
} = {}) =>
  renderWithProviders(<PeriodView />, {
    content: { character: characters },
    session: {
      state: {
        global: {
          ...(block ? { downtimeblock: block } : {}),
          ...(taskMap ? { earnincometask: taskMap } : {}),
          ...(benchMap ? { downtimebench: benchMap } : {}),
        },
        ...downtime,
      },
    },
    ...rest,
  });

const lastWrite = (session, stateType) =>
  [...session.sent].reverse().find((s) => s.stateType === stateType)?.value ?? null;

// "Ashka"/"Izzy" render in BOTH the Locked-in list and the overrides table, so
// every name lookup below is scoped to the column it actually means.
const lockedInList = () => document.querySelector('.dock-dt-lockedin-list');
const overridesGrid = () => document.querySelector('.dock-dt-override-grid');

beforeEach(() => {
  window.localStorage.clear();
});

describe('PeriodView (#1856)', () => {
  it('renders the view heading and "No open block" when nothing is active', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Period', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('No open block')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('shows "Block open · started {date}" when a block is active', () => {
    mount({ block: BLOCK });
    expect(screen.getByText('Block open · started 3 Pharast, 4725 AR')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Update' })).toBeInTheDocument();
  });

  it('Start writes a new block stamped with the current game date', () => {
    const { session } = mount();
    fireEvent.click(screen.getByRole('button', { name: 'Increase days granted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase days granted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Increase days granted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    const written = lastWrite(session, 'downtimeblock');
    expect(written).toEqual(
      expect.objectContaining({ days: 4, active: true, startedAt: { day: 5, month: 2, year: 4725 } })
    );
  });

  it('Update resizes the open block in place and does NOT re-stamp startedAt (#1624)', () => {
    const { session } = mount({ block: BLOCK });
    fireEvent.click(screen.getByRole('button', { name: 'Increase days granted' }));
    fireEvent.click(screen.getByRole('button', { name: 'Update' }));

    const written = lastWrite(session, 'downtimeblock');
    expect(written).toEqual({ days: 8, active: true, startedAt: BLOCK.startedAt });
  });

  it('the days-granted decrease stepper is disabled at 1', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Decrease days granted' })).toBeDisabled();
  });

  it('disables the close button when no block is active', () => {
    mount();
    expect(screen.getByRole('button', { name: 'Close block without advancing' })).toBeDisabled();
  });

  it('closes the block through ConfirmDialog, preserving startedAt and days', () => {
    const { session } = mount({ block: BLOCK });
    const closeBtn = screen.getByRole('button', { name: 'Close block without advancing' });
    expect(closeBtn).toBeEnabled();
    fireEvent.click(closeBtn);

    // Not written yet — the dialog gates the actual close.
    expect(lastWrite(session, 'downtimeblock')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Close block' }));
    expect(lastWrite(session, 'downtimeblock')).toEqual({ ...BLOCK, active: false });
  });

  it('cancelling the close dialog writes nothing', () => {
    const { session } = mount({ block: BLOCK });
    fireEvent.click(screen.getByRole('button', { name: 'Close block without advancing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(lastWrite(session, 'downtimeblock')).toBeNull();
  });

  describe('Locked in', () => {
    it('shows Locked in / Planning per the real per-PC period status', () => {
      mount({
        block: BLOCK,
        downtime: {
          'pc-ashka': { downtime: { periodStartedAt: BLOCK.startedAt, plan: { Research: 2 }, status: 'ready' } },
        },
      });

      const ashkaRow = within(lockedInList()).getByText('Ashka').closest('li');
      expect(within(ashkaRow).getByText('Locked in')).toBeInTheDocument();

      const izzyRow = within(lockedInList()).getByText('Izzy').closest('li');
      expect(within(izzyRow).getByText('Planning')).toBeInTheDocument();
    });

    it('reads a prior-period stamp as Planning, not Locked in', () => {
      mount({
        block: BLOCK,
        downtime: {
          'pc-ashka': { downtime: { periodStartedAt: { day: 1, month: 0, year: 4725 }, plan: { Research: 2 }, status: 'ready' } },
        },
      });
      const row = within(lockedInList()).getByText('Ashka').closest('li');
      expect(within(row).getByText('Planning')).toBeInTheDocument();
    });
  });

  describe('Per-PC overrides', () => {
    it('shows the default DC (freelance level 4) when no override is set', () => {
      mount();
      expect(screen.getAllByText('DC 19')).toHaveLength(2);
    });

    it('writes a task-level override and updates the DC from the Earn Income table (not a formula)', () => {
      const { session } = mount();
      fireEvent.change(screen.getByLabelText('Ashka task level override'), { target: { value: '8' } });

      expect(lastWrite(session, 'earnincometask')).toEqual({ 'pc-ashka': 8 });
      expect(screen.getByText('DC 24')).toBeInTheDocument();
      expect(screen.getByText('DC 19')).toBeInTheDocument(); // Izzy stays at the default
    });

    it('clamps a task level to 0–20', () => {
      const { session } = mount();
      fireEvent.change(screen.getByLabelText('Izzy task level override'), { target: { value: '99' } });
      expect(lastWrite(session, 'earnincometask')).toEqual({ 'pc-izzy': 20 });
    });

    it('clears a PC from the task map when the field is emptied', () => {
      const { session } = mount({ taskMap: { 'pc-ashka': 8 } });
      fireEvent.change(screen.getByLabelText('Ashka task level override'), { target: { value: '' } });
      expect(lastWrite(session, 'earnincometask')).toEqual({});
    });

    it('writes per-activity benchmark overrides in days', () => {
      const { session } = mount();
      fireEvent.change(screen.getByLabelText('Ashka Retrain benchmark days'), { target: { value: '5' } });
      expect(lastWrite(session, 'downtimebench')).toEqual({ 'pc-ashka': { Retrain: 5 } });

      fireEvent.change(screen.getByLabelText('Ashka Research benchmark days'), { target: { value: '3' } });
      expect(lastWrite(session, 'downtimebench')).toEqual({ 'pc-ashka': { Retrain: 5, Research: 3 } });
    });

    it('clamps a benchmark to 1–99 and cleans up an emptied PC entry', () => {
      const { session } = mount({ benchMap: { 'pc-izzy': { Retrain: 7 } } });
      fireEvent.change(screen.getByLabelText('Izzy Retrain benchmark days'), { target: { value: '150' } });
      expect(lastWrite(session, 'downtimebench')).toEqual({ 'pc-izzy': { Retrain: 99 } });

      fireEvent.change(screen.getByLabelText('Izzy Retrain benchmark days'), { target: { value: '' } });
      expect(lastWrite(session, 'downtimebench')).toEqual({});
    });

    it('shows each character\'s class from the real character model', () => {
      mount();
      const row = within(overridesGrid()).getByText('Ashka').closest('.dock-dt-override-id');
      expect(within(row).getByText('Fighter')).toBeInTheDocument();
    });
  });
});
