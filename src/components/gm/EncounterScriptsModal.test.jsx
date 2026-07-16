import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent, log: [] }),
}));

vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { useContent } from '../../contexts/ContentContext';
import { __reset, __store } from '../../hooks/useSyncedState';
import EncounterScriptsModal from './EncounterScriptsModal';
import { ENCOUNTER_SCRIPTS } from '../../data/encounterScripts';

const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
];

beforeEach(() => {
  __reset();
  mockAppendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

const launched = () => Object.values(__store['cnmh_vpchallenge_global'] ?? {});

// ─── tests ───────────────────────────────────────────────────
describe('EncounterScriptsModal', () => {
  it('lists every preset with its tracks', () => {
    render(<EncounterScriptsModal isOpen={true} onClose={() => {}} />);
    expect(screen.getByText('Call Spirit Ritual')).toBeInTheDocument();
    expect(screen.getByText(/Bolster the Ritual · Assuage the Locals · Nualia's Spirit/)).toBeInTheDocument();
  });

  it('launching stamps ids and targets and adds every track', () => {
    const onClose = vi.fn();
    render(<EncounterScriptsModal isOpen={true} onClose={onClose} />);
    fireEvent.click(screen.getByLabelText('Launch Call Spirit Ritual'));

    const docs = launched();
    expect(docs).toHaveLength(3);
    const ids = docs.map((d) => d.id);
    expect(new Set(ids).size).toBe(3);

    const bolster = docs.find((d) => d.name === 'Bolster the Ritual');
    expect(bolster).toEqual(expect.objectContaining({
      startValue: 6, min: 0, failAt: 0, mode: 'perRound', actionCost: 1,
      target: 'all', targetIds: ['thorn', 'lira'], adjust: 0,
    }));
    expect(bolster.id).toMatch(/^vpc-/);

    const nualia = docs.find((d) => d.name === "Nualia's Spirit");
    expect(nualia).toEqual(expect.objectContaining({
      kind: 'influence', roundsTotal: 10, sceneRound: 1,
      revealed: [], dcModifier: 0, targetIds: ['thorn', 'lira'],
    }));
    expect(nualia.id).toMatch(/^inf-/);
    expect(nualia.tiers.map((t) => t.at)).toEqual([3, 6, 9]);

    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'challenge',
      text: expect.stringContaining('Call Spirit Ritual'),
    }));
    expect(onClose).toHaveBeenCalled();
  });

  it('adds alongside running tracks instead of replacing', () => {
    __store['cnmh_vpchallenge_global'] = {
      'vpc-old': { id: 'vpc-old', name: 'Old Hunt' },
    };
    render(<EncounterScriptsModal isOpen={true} onClose={() => {}} />);
    fireEvent.click(screen.getByLabelText('Launch Call Spirit Ritual'));
    expect(launched()).toHaveLength(4);
    expect(__store['cnmh_vpchallenge_global']['vpc-old'].name).toBe('Old Hunt');
  });

  it('every scripted track carries the fields the track cards expect', () => {
    // Guards the preset data itself: names, skills with numeric DCs, and
    // influence extras — a malformed preset would otherwise only fail live.
    for (const script of ENCOUNTER_SCRIPTS) {
      for (const track of script.tracks) {
        expect(track.name).toBeTruthy();
        expect(track.skills.length).toBeGreaterThan(0);
        for (const s of track.skills) {
          expect(typeof s.skill).toBe('string');
          expect(s.dc).toBeGreaterThan(0);
        }
        if (track.kind === 'influence') {
          expect(Array.isArray(track.tiers)).toBe(true);
          for (const t of track.tiers) {
            expect(t.at).toBeGreaterThan(0);
            expect(t.note).toBeTruthy();
          }
        }
      }
    }
  });
});
