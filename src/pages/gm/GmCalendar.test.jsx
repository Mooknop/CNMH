import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmCalendar from './GmCalendar';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ saveDocument: vi.fn(), deleteDocument: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import { saveDocument, deleteDocument } from '../../utils/gmApi';

const calendarEvents = [
  {
    id: 'blu-birthday',
    title: "Blu's Birthday",
    type: 'personal',
    date: { month: 0, day: 25 },
    description: 'A foundling.',
  },
];

const setContent = () => useContent.mockReturnValue({ calendarEvents });

const multiType = [
  { id: 'blu-birthday', title: "Blu's Birthday", type: 'personal', date: { month: 0, day: 25 } },
  { id: 'harvest', title: 'Harvest Feast', type: 'holiday', recurring: 'every autumn' },
  { id: 'siege', title: 'The Siege', type: 'campaign', date: { year: 4724, month: 3, day: 1 } },
  { id: 'untyped', title: 'Untyped Note', recurring: 'whenever' }, // groups as campaign
];
const setMulti = () => useContent.mockReturnValue({ calendarEvents: multiType });

afterEach(() => vi.restoreAllMocks());

describe('GmCalendar', () => {
  it('renders a form per event', () => {
    setContent();
    render(<GmCalendar />);
    expect(screen.getByTestId('event-form-blu-birthday')).toBeInTheDocument();
    expect(screen.getByText('+ New event')).toBeInTheDocument();
  });

  it('edits an event and saves it, preserving month 0 and omitting a blank year', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCalendar />);
    const form = screen.getByTestId('event-form-blu-birthday');
    fireEvent.change(within(form).getByLabelText('description'), { target: { value: 'Edited' } });
    fireEvent.click(within(form).getByText('Save'));
    expect(await screen.findByRole('status')).toHaveTextContent(/live for every connected player/i);
    const [collection, id, data] = saveDocument.mock.calls[0];
    expect(collection).toBe('calendar');
    expect(id).toBe('blu-birthday');
    expect(data.date).toEqual({ month: 0, day: 25 });
    expect(data.description).toBe('Edited');
  });

  it('blocks saving with an empty title', async () => {
    setContent();
    render(<GmCalendar />);
    const form = screen.getByTestId('event-form-blu-birthday');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: '  ' } });
    fireEvent.click(within(form).getByText('Save'));
    await waitFor(() => expect(within(form).getByRole('alert')).toHaveTextContent(/Title is required/));
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('requires a recurring rule or a fixed month and day', async () => {
    setContent();
    render(<GmCalendar />);
    fireEvent.click(screen.getByText('+ New event'));
    const form = screen.getByTestId('event-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Floating' } });
    fireEvent.click(within(form).getByText('Create event'));
    await waitFor(() =>
      expect(within(form).getByRole('alert')).toHaveTextContent(/recurring rule, or a fixed month and day/i)
    );
    expect(saveDocument).not.toHaveBeenCalled();
  });

  it('creates a recurring event with a slug id and no date object', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCalendar />);
    fireEvent.click(screen.getByText('+ New event'));
    const form = screen.getByTestId('event-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Lunar Rite' } });
    fireEvent.change(within(form).getByLabelText('recurring'), { target: { value: 'every full moon' } });
    fireEvent.click(within(form).getByText('Create event'));
    await waitFor(() => expect(saveDocument).toHaveBeenCalled());
    const [, id, data] = saveDocument.mock.calls[0];
    expect(id).toBe('lunar-rite');
    expect(data.recurring).toBe('every full moon');
    expect(data.date).toBeUndefined();
  });

  it('deletes an event only after typed confirmation', async () => {
    setContent();
    deleteDocument.mockResolvedValue({ ok: true });
    render(<GmCalendar />);
    const form = screen.getByTestId('event-form-blu-birthday');
    fireEvent.click(within(form).getByText('Delete'));
    expect(screen.getByText('Delete forever')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('confirm-input'), { target: { value: "Blu's Birthday" } });
    fireEvent.click(screen.getByText('Delete forever'));
    await waitFor(() => expect(deleteDocument).toHaveBeenCalledWith('calendar', 'blu-birthday'));
  });

  it('warns before overwriting an existing id when creating a new event', async () => {
    setContent();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCalendar />);
    fireEvent.click(screen.getByText('+ New event'));
    const form = screen.getByTestId('event-form-new');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Blu Birthday' } });
    fireEvent.change(within(form).getByLabelText('recurring'), { target: { value: 'every full moon' } });
    fireEvent.click(within(form).getByText('Create event'));
    expect(saveDocument).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('calendar', 'blu-birthday', expect.objectContaining({ id: 'blu-birthday' }))
    );
  });

  it('renders a tab per type (All + sorted), grouping untyped as campaign', () => {
    setMulti();
    render(<GmCalendar />);
    const nav = screen.getByLabelText('event types');
    expect(within(nav).getByText('All')).toBeInTheDocument();
    expect(within(nav).getByText('campaign')).toBeInTheDocument();
    expect(within(nav).getByText('holiday')).toBeInTheDocument();
    expect(within(nav).getByText('personal')).toBeInTheDocument();
    // All tab: every event shown.
    expect(screen.getByText('Showing 4 of 4')).toBeInTheDocument();
    expect(screen.getByTestId('event-form-untyped')).toBeInTheDocument();
  });

  it('filters the list to the active type tab', () => {
    setMulti();
    render(<GmCalendar />);
    fireEvent.click(within(screen.getByLabelText('event types')).getByText('holiday'));
    expect(screen.getByTestId('event-form-harvest')).toBeInTheDocument();
    expect(screen.queryByTestId('event-form-blu-birthday')).not.toBeInTheDocument();
    expect(screen.getByText('Showing 1 of 4')).toBeInTheDocument();

    // The untyped event lands under campaign.
    fireEvent.click(within(screen.getByLabelText('event types')).getByText('campaign'));
    expect(screen.getByTestId('event-form-siege')).toBeInTheDocument();
    expect(screen.getByTestId('event-form-untyped')).toBeInTheDocument();
    expect(screen.getByText('Showing 2 of 4')).toBeInTheDocument();
  });

  it('prefills a new event type from the active tab; blank under All', () => {
    setMulti();
    render(<GmCalendar />);
    fireEvent.click(within(screen.getByLabelText('event types')).getByText('holiday'));
    fireEvent.click(screen.getByText('+ New event'));
    expect(within(screen.getByTestId('event-form-new')).getByLabelText('type')).toHaveValue('holiday');
  });

  it('new event under All leaves type blank (saves as campaign)', async () => {
    setMulti();
    saveDocument.mockResolvedValue({ ok: true });
    render(<GmCalendar />);
    fireEvent.click(screen.getByText('+ New event'));
    const form = screen.getByTestId('event-form-new');
    expect(within(form).getByLabelText('type')).toHaveValue('');
    fireEvent.change(within(form).getByLabelText('title'), { target: { value: 'Lone Event' } });
    fireEvent.change(within(form).getByLabelText('recurring'), { target: { value: 'sometimes' } });
    fireEvent.click(within(form).getByText('Create event'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith(
        'calendar',
        'lone-event',
        expect.objectContaining({ type: 'campaign' })
      )
    );
  });
});
