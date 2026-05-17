import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import GmCalendar from './GmCalendar';

jest.mock('../../contexts/ContentContext', () => ({ useContent: jest.fn() }));
jest.mock('../../utils/gmApi', () => ({ saveDocument: jest.fn(), deleteDocument: jest.fn() }));
const { useContent } = require('../../contexts/ContentContext');
const { saveDocument, deleteDocument } = require('../../utils/gmApi');

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

afterEach(() => jest.restoreAllMocks());

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
    expect(within(form).getByText('Delete forever')).toBeDisabled();
    fireEvent.change(within(form).getByLabelText('confirm-input'), { target: { value: "Blu's Birthday" } });
    fireEvent.click(within(form).getByText('Delete forever'));
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
    fireEvent.click(within(form).getByText('Overwrite'));
    await waitFor(() =>
      expect(saveDocument).toHaveBeenCalledWith('calendar', 'blu-birthday', expect.objectContaining({ id: 'blu-birthday' }))
    );
  });
});
