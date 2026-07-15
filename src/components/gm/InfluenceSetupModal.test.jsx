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
import InfluenceSetupModal from './InfluenceSetupModal';

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

const fillMinimum = () => {
  fireEvent.change(screen.getByLabelText('influence npc name'), { target: { value: "Nualia's Spirit" } });
  fireEvent.change(screen.getByLabelText('Influence skill 1 DC'), { target: { value: '18' } });
};

const sent = () => Object.values(__store['cnmh_vpchallenge_global'] ?? {});

// ─── tests ───────────────────────────────────────────────────
describe('InfluenceSetupModal', () => {
  it('renders nothing when closed', () => {
    const { container } = render(<InfluenceSetupModal isOpen={false} onClose={() => {}} />);
    expect(container.firstChild).toBeNull();
  });

  it('send disabled until name and influence DCs are set', () => {
    render(<InfluenceSetupModal isOpen={true} onClose={() => {}} />);
    const start = screen.getByLabelText('Start influence encounter');
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('influence npc name'), { target: { value: 'Nualia' } });
    expect(start).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Influence skill 1 DC'), { target: { value: '18' } });
    expect(start).toBeEnabled();
  });

  it('builds a full influence doc on the shared collection', () => {
    render(<InfluenceSetupModal isOpen={true} onClose={() => {}} />);
    fillMinimum();
    fireEvent.change(screen.getByLabelText('Influence skill 1'), { target: { value: 'society' } });

    // Second influence skill.
    fireEvent.click(screen.getByLabelText('Add Influence skill'));
    fireEvent.change(screen.getByLabelText('Influence skill 2'), { target: { value: 'religion' } });
    fireEvent.change(screen.getByLabelText('Influence skill 2 DC'), { target: { value: '19' } });

    // A discovery check.
    fireEvent.click(screen.getByLabelText('Add Discovery skill'));
    fireEvent.change(screen.getByLabelText('Discovery skill 1'), { target: { value: 'occultism' } });
    fireEvent.change(screen.getByLabelText('Discovery skill 1 DC'), { target: { value: '18' } });

    // Thresholds (entered out of order — doc sorts them).
    fireEvent.change(screen.getByLabelText('threshold 1 points'), { target: { value: '6' } });
    fireEvent.change(screen.getByLabelText('threshold 1 note'), { target: { value: 'sorrow' } });
    fireEvent.click(screen.getByLabelText('Add threshold'));
    fireEvent.change(screen.getByLabelText('threshold 2 points'), { target: { value: '3' } });
    fireEvent.change(screen.getByLabelText('threshold 2 note'), { target: { value: 'dooms' } });

    fireEvent.change(screen.getByLabelText('resistances note'), { target: { value: '+2 on Sandpoint failures' } });
    fireEvent.change(screen.getByLabelText('total rounds'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('action cost'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Start influence encounter'));

    expect(sent()).toHaveLength(1);
    expect(sent()[0]).toEqual(expect.objectContaining({
      kind: 'influence',
      name: "Nualia's Spirit",
      skills: [{ skill: 'society', dc: 18 }, { skill: 'religion', dc: 19 }],
      discoveries: [{ skill: 'occultism', dc: 18 }],
      tiers: [{ at: 3, note: 'dooms' }, { at: 6, note: 'sorrow' }],
      resistNote: '+2 on Sandpoint failures',
      revealed: [],
      dcModifier: 0,
      roundsTotal: 10,
      sceneRound: 1,
      threshold: null,
      mode: 'perRound',
      actionCost: 1,
      targetIds: ['thorn', 'lira'],
    }));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'challenge',
      text: expect.stringContaining("Nualia's Spirit"),
    }));
  });

  it('adds alongside existing tracks instead of replacing', () => {
    __store['cnmh_vpchallenge_global'] = {
      'vpc-1': { id: 'vpc-1', name: 'Bolster the Ritual' },
    };
    render(<InfluenceSetupModal isOpen={true} onClose={() => {}} />);
    fillMinimum();
    fireEvent.click(screen.getByLabelText('Start influence encounter'));
    const map = __store['cnmh_vpchallenge_global'];
    expect(Object.keys(map)).toHaveLength(2);
    expect(map['vpc-1'].name).toBe('Bolster the Ritual');
  });

  it('empty threshold rows are dropped, not blockers', () => {
    render(<InfluenceSetupModal isOpen={true} onClose={() => {}} />);
    fillMinimum();
    fireEvent.click(screen.getByLabelText('Start influence encounter'));
    expect(sent()[0].tiers).toEqual([]);
    expect(sent()[0].roundsTotal).toBeNull();
  });

  it('calls onClose after sending', () => {
    const onClose = vi.fn();
    render(<InfluenceSetupModal isOpen={true} onClose={onClose} />);
    fillMinimum();
    fireEvent.click(screen.getByLabelText('Start influence encounter'));
    expect(onClose).toHaveBeenCalled();
  });
});
