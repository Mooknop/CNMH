import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ importRooms: vi.fn(), importEvents: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { importRooms, importEvents } from '../../utils/gmApi';
import RoomsImportButton from './RoomsImportButton';

// Synthetic dump mirroring the export-macro shape — no Paizo text. A chapter
// journal ("Ch N:") with one room page and one event page (a non-room,
// non-Features page), so both upload paths are exercised.
const dump = {
  module: 'test-mod',
  hazards: [],
  journals: [
    {
      name: 'Ch 1: Test',
      pages: [
        {
          name: 'A1. Entrance',
          sort: 100,
          text: { content: '<h2 class="no-toc">A1. Entrance</h2><p class="read-aloud">A tunnel.</p>' },
          flags: { 'test-mod': { pageNumber: 'A1', pageNumberClass: 'location' } },
        },
        {
          name: 'Town Rumors',
          sort: 200,
          text: { content: '<h2 class="no-toc">Town Rumors</h2><p>Ask around.</p>' },
        },
      ],
    },
  ],
};

const pickFile = (contents, name = 'dump.json') => {
  const file = new File([contents], name, { type: 'application/json' });
  fireEvent.change(screen.getByLabelText('Adventure journal dump file'), { target: { files: [file] } });
};

const refresh = vi.fn().mockResolvedValue();

beforeEach(() => {
  useContent.mockReturnValue({ rooms: [], events: [], refresh });
  importRooms.mockResolvedValue({ created: 1, updated: 0, unchanged: 0, skipped: 0 });
  importEvents.mockResolvedValue({ created: 1, updated: 0, unchanged: 0, skipped: 0 });
});

describe('RoomsImportButton', () => {
  it('transforms the picked dump and uploads rooms and events', async () => {
    render(<RoomsImportButton />);
    pickFile(JSON.stringify(dump));

    expect(await screen.findByText(/Imported 1 rooms .* and 1 events/)).toBeInTheDocument();
    // Real transform ran → one room doc and one event doc uploaded.
    const roomDocs = importRooms.mock.calls[0][0];
    expect(roomDocs).toHaveLength(1);
    expect(roomDocs[0]).toMatchObject({ code: 'A1', name: 'Entrance' });
    const eventDocs = importEvents.mock.calls[0][0];
    expect(eventDocs).toHaveLength(1);
    expect(eventDocs[0]).toMatchObject({ id: 'sd4s-event-town-rumors', name: 'Town Rumors', tracked: true, status: 'upcoming' });
    expect(refresh).toHaveBeenCalled();
  });

  it('preserves existing GM notes and event tracking across the import', async () => {
    useContent.mockReturnValue({
      rooms: [{ id: 'sd4s-a1', notes: 'Ambush here.' }],
      events: [{ id: 'sd4s-event-town-rumors', status: 'resolved', tracked: false }],
      refresh,
    });
    render(<RoomsImportButton />);
    pickFile(JSON.stringify(dump));

    await screen.findByText(/Imported 1 rooms/);
    expect(importRooms.mock.calls[0][0][0].notes).toBe('Ambush here.'); // carried over by id
    const eventDoc = importEvents.mock.calls[0][0][0];
    expect(eventDoc).toMatchObject({ status: 'resolved', tracked: false }); // live progress wins
  });

  it('rejects a non-JSON file with a friendly message', async () => {
    render(<RoomsImportButton />);
    pickFile('this is not json');

    expect(await screen.findByText(/make sure it's the .json/)).toBeInTheDocument();
    expect(importRooms).not.toHaveBeenCalled();
  });

  it('explains when the file has no rooms or events', async () => {
    render(<RoomsImportButton />);
    pickFile(JSON.stringify({ module: 'x', journals: [], hazards: [] }));

    expect(await screen.findByText(/no adventure rooms or events in it/)).toBeInTheDocument();
    expect(importRooms).not.toHaveBeenCalled();
    expect(importEvents).not.toHaveBeenCalled();
  });
});
