import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn() }));

import { saveDocument } from '../../utils/gmApi';
import EventTracker from './EventTracker';

const baseEvent = {
  id: 'sd4s-event-copycat-killer',
  name: 'Copycat Killer',
  chapter: 'Ch 2: Strange Times',
  body: '<p>A murderer stalks Sandpoint.</p>',
  status: 'upcoming',
  tracked: true,
  steps: [],
  scheduledFor: '',
  outcome: '',
  notes: '',
};

const renderTracker = (event = baseEvent) => render(<EventTracker event={event} />);

beforeEach(() => {
  saveDocument.mockResolvedValue({ ok: true });
});

describe('EventTracker', () => {
  it('disables Save until something changes', () => {
    renderTracker();
    expect(screen.getByRole('button', { name: 'Save tracking' })).toBeDisabled();
  });

  it('changes status and saves the merged doc', async () => {
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    const saveBtn = screen.getByRole('button', { name: 'Save tracking' });
    expect(saveBtn).toBeEnabled();
    fireEvent.click(saveBtn);

    expect(saveDocument).toHaveBeenCalledWith(
      'event',
      'sd4s-event-copycat-killer',
      expect.objectContaining({ name: 'Copycat Killer', status: 'active' }),
    );
    expect(await screen.findByText('Saved.')).toBeInTheDocument();
  });

  it('adds, labels, toggles, and persists a progress step', async () => {
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: '+ Add step' }));
    fireEvent.change(screen.getByLabelText('Step 1 label'), { target: { value: 'Find the witness' } });
    fireEvent.click(screen.getByLabelText('Step 1 done'));
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));

    await screen.findByText('Saved.');
    expect(saveDocument.mock.calls[0][2].steps).toEqual([{ label: 'Find the witness', done: true }]);
  });

  it('drops blank-label steps on save', async () => {
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: '+ Add step' })); // left blank
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));

    await screen.findByText('Saved.');
    expect(saveDocument.mock.calls[0][2].steps).toEqual([]);
  });

  it('hides the event by unchecking "Show in the tracker"', async () => {
    renderTracker();
    fireEvent.click(screen.getByLabelText(/Show in the tracker/));
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));

    await screen.findByText('Saved.');
    expect(saveDocument.mock.calls[0][2].tracked).toBe(false);
  });

  it('records a scheduled date and outcome, trimming the schedule', async () => {
    renderTracker();
    fireEvent.change(screen.getByLabelText('Scheduled for'), { target: { value: '  Rova 12  ' } });
    fireEvent.change(screen.getByLabelText('Outcome'), { target: { value: 'The copycat was unmasked.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));

    await screen.findByText('Saved.');
    const doc = saveDocument.mock.calls[0][2];
    expect(doc.scheduledFor).toBe('Rova 12');
    expect(doc.outcome).toBe('The copycat was unmasked.');
  });

  it('removes a step', () => {
    renderTracker({ ...baseEvent, steps: [{ label: 'Beat one', done: false }] });
    expect(screen.getByLabelText('Step 1 label')).toHaveValue('Beat one');
    fireEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(screen.queryByLabelText('Step 1 label')).toBeNull();
  });

  it('preselects the current status', () => {
    renderTracker({ ...baseEvent, status: 'resolved' });
    expect(screen.getByRole('button', { name: 'Resolved' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('surfaces a save failure', async () => {
    saveDocument.mockRejectedValue(new Error('nope'));
    renderTracker();
    fireEvent.click(screen.getByRole('button', { name: 'Active' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save tracking' }));
    expect(await screen.findByText(/Save failed/)).toBeInTheDocument();
  });
});
