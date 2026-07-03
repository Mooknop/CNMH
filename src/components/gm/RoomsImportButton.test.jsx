import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../utils/gmApi', () => ({ importRooms: vi.fn() }));

import { useContent } from '../../contexts/ContentContext';
import { importRooms } from '../../utils/gmApi';
import RoomsImportButton from './RoomsImportButton';

// Synthetic dump mirroring the export-macro shape — no Paizo text.
const dump = {
  module: 'test-mod',
  hazards: [],
  journals: [
    {
      name: 'Ch 1',
      pages: [
        {
          name: 'A1. Entrance',
          sort: 100,
          text: { content: '<h2 class="no-toc">A1. Entrance</h2><p class="read-aloud">A tunnel.</p>' },
          flags: { 'test-mod': { pageNumber: 'A1', pageNumberClass: 'location' } },
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
  useContent.mockReturnValue({ rooms: [], refresh });
  importRooms.mockResolvedValue({ created: 1, updated: 0, unchanged: 0, skipped: 0 });
});

describe('RoomsImportButton', () => {
  it('transforms the picked dump and uploads the docs', async () => {
    render(<RoomsImportButton />);
    pickFile(JSON.stringify(dump));

    expect(await screen.findByText(/Imported 1 rooms — 1 new/)).toBeInTheDocument();
    // Real transform ran → one room doc with the parsed code was uploaded.
    const docs = importRooms.mock.calls[0][0];
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({ code: 'A1', name: 'Entrance' });
    expect(refresh).toHaveBeenCalled();
  });

  it('preserves existing GM notes across the import', async () => {
    useContent.mockReturnValue({ rooms: [{ id: 'sd4s-a1', notes: 'Ambush here.' }], refresh });
    render(<RoomsImportButton />);
    pickFile(JSON.stringify(dump));

    await screen.findByText(/Imported 1 rooms/);
    expect(importRooms.mock.calls[0][0][0].notes).toBe('Ambush here.'); // carried over by id
  });

  it('rejects a non-JSON file with a friendly message', async () => {
    render(<RoomsImportButton />);
    pickFile('this is not json');

    expect(await screen.findByText(/make sure it's the .json/)).toBeInTheDocument();
    expect(importRooms).not.toHaveBeenCalled();
  });

  it('explains when the file has no rooms', async () => {
    render(<RoomsImportButton />);
    pickFile(JSON.stringify({ module: 'x', journals: [], hazards: [] }));

    expect(await screen.findByText(/no adventure rooms in it/)).toBeInTheDocument();
    expect(importRooms).not.toHaveBeenCalled();
  });
});
