import { renderHook } from '@testing-library/react';

// ── Mocks ──────────────────────────────────────────────────────────────────

let mockEncounter = { active: false, order: [] };
vi.mock('./useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
}));

let mockMonsters = [];
vi.mock('../contexts/ContentContext', () => ({
  useContent: () => ({ monsters: mockMonsters }),
}));

let mockIsGm = true;
vi.mock('./useGmAuth', () => ({
  useGmAuth: () => ({ isGm: mockIsGm }),
}));

let mockCampaign = { location: '', locationLoreId: '' };
vi.mock('./useSyncedState', () => ({
  useSyncedState: () => [mockCampaign, vi.fn()],
}));

const mockSaveDocument = vi.fn(() => Promise.resolve({}));
vi.mock('../utils/gmApi', () => ({
  saveDocument: (...args) => mockSaveDocument(...args),
}));

import { useBestiaryCapture } from './useBestiaryCapture';

const goblin = {
  entryId: 'e-gob-1',
  kind: 'enemy',
  name: 'Goblin Warrior',
  creatureKey: 'goblin-warrior',
  bestiary: { level: -1, hp: { max: 6 }, traits: ['goblin'], description: 'A nasty goblin.' },
  defenses: { ac: 16, saves: { fortitude: 5, reflex: 7, will: 3 }, immunities: [], resistances: [], weaknesses: [] },
};
const pc = { entryId: 'e-pc', kind: 'pc', charId: 'char-a', name: 'Ashka' };
const manual = { entryId: 'e-manual', kind: 'enemy', name: 'Homebrew Beast' }; // no creatureKey

const setup = () => renderHook(() => useBestiaryCapture());

beforeEach(() => {
  vi.clearAllMocks();
  mockIsGm = true;
  mockMonsters = [];
  mockEncounter = { active: false, order: [] };
  mockCampaign = { location: '', locationLoreId: '' };
});

describe('useBestiaryCapture (#332)', () => {
  test('first sighting persists the full stat block', () => {
    mockEncounter = { active: true, order: [pc, goblin] };
    setup();
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    const [collection, key, doc] = mockSaveDocument.mock.calls[0];
    expect(collection).toBe('monster');
    expect(key).toBe('goblin-warrior');
    expect(doc).toMatchObject({
      id: 'goblin-warrior',
      name: 'Goblin Warrior',
      bestiary: goblin.bestiary,
      defenses: goblin.defenses,
    });
    expect(doc.capturedAt).toEqual(expect.any(Number));
    expect(doc.lastSeenAt).toEqual(expect.any(Number));
  });

  test('skips manual (null-creatureKey) enemies', () => {
    mockEncounter = { active: true, order: [manual] };
    setup();
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });

  test('skips PCs', () => {
    mockEncounter = { active: true, order: [pc] };
    setup();
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });

  test('non-GM clients never write', () => {
    mockIsGm = false;
    mockEncounter = { active: true, order: [goblin] };
    setup();
    expect(mockSaveDocument).not.toHaveBeenCalled();
  });

  test('re-sighting refreshes stats + lastSeenAt but preserves descriptionOverride and capturedAt', () => {
    mockMonsters = [
      {
        id: 'goblin-warrior',
        name: 'Goblin Warrior',
        descriptionOverride: 'GM redacted text',
        bestiary: { level: -1, hp: { max: 6 } },
        defenses: { ac: 14 },
        capturedAt: 111,
        lastSeenAt: 111,
      },
    ];
    const refreshed = { ...goblin, defenses: { ...goblin.defenses, ac: 18 } };
    mockEncounter = { active: true, order: [refreshed] };
    setup();
    const [, , doc] = mockSaveDocument.mock.calls[0];
    expect(doc.descriptionOverride).toBe('GM redacted text');
    expect(doc.capturedAt).toBe(111); // original first-seen preserved
    expect(doc.defenses.ac).toBe(18); // stats refreshed from the live sighting
    expect(doc.lastSeenAt).not.toBe(111); // bumped
  });

  test('does not re-write the same creatureKey on re-render (no PUT storm)', () => {
    mockEncounter = { active: true, order: [goblin] };
    const { rerender } = setup();
    // Simulate the content store re-broadcasting our own write back.
    mockMonsters = [{ id: 'goblin-warrior', name: 'Goblin Warrior', bestiary: goblin.bestiary, defenses: goblin.defenses, capturedAt: 1, lastSeenAt: 1 }];
    rerender();
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
  });

  test('records the active location (#334) keyed by lore id', () => {
    mockCampaign = { location: 'Thistletop', locationLoreId: 'thistletop' };
    mockEncounter = { active: true, order: [goblin] };
    setup();
    const [, , doc] = mockSaveDocument.mock.calls[0];
    expect(doc.locations).toMatchObject({ thistletop: { name: 'Thistletop' } });
    expect(doc.locations.thistletop.lastSeenAt).toEqual(expect.any(Number));
  });

  test('merges a new location with previously-recorded ones', () => {
    mockMonsters = [{
      id: 'goblin-warrior', name: 'Goblin Warrior', bestiary: goblin.bestiary, defenses: goblin.defenses,
      capturedAt: 1, lastSeenAt: 1, locations: { sandpoint: { name: 'Sandpoint', lastSeenAt: 1 } },
    }];
    mockCampaign = { location: 'Thistletop', locationLoreId: 'thistletop' };
    mockEncounter = { active: true, order: [goblin] };
    setup();
    const [, , doc] = mockSaveDocument.mock.calls[0];
    expect(Object.keys(doc.locations).sort()).toEqual(['sandpoint', 'thistletop']);
  });

  test('no location recorded when the GM has not set one', () => {
    mockEncounter = { active: true, order: [goblin] };
    setup();
    const [, , doc] = mockSaveDocument.mock.calls[0];
    expect(doc.locations).toEqual({});
  });

  test('same creature re-fought at a new location records the new location', () => {
    mockCampaign = { location: 'Sandpoint', locationLoreId: 'sandpoint' };
    mockEncounter = { active: true, order: [goblin] };
    const { rerender } = setup();
    expect(mockSaveDocument).toHaveBeenCalledTimes(1);
    // Same session, GM moves the party, the creature is fought again elsewhere.
    mockCampaign = { location: 'Thistletop', locationLoreId: 'thistletop' };
    rerender();
    expect(mockSaveDocument).toHaveBeenCalledTimes(2);
    const [, , doc] = mockSaveDocument.mock.calls[1];
    expect(doc.locations).toMatchObject({ thistletop: { name: 'Thistletop' } });
  });
});
