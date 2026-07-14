import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));

const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent, log: [] }),
}));

let mockEncounter = { active: false };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter }),
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
  const __set = (key, value) => {
    store[key] = value;
    subs.forEach((f) => f());
  };
  return {
    __esModule: true,
    useSyncedState,
    __set,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { useContent } from '../../contexts/ContentContext';
import { __reset, __set, __store } from '../../hooks/useSyncedState';
import SkillChallengePanel from './SkillChallengePanel';

// ─── fixtures ────────────────────────────────────────────────
const CHARACTERS = [
  { id: 'thorn', name: 'Thorn' },
  { id: 'lira',  name: 'Lira'  },
  { id: 'bram',  name: 'Bram'  },
];

const CHALLENGE = {
  id: 'vpc-1',
  name: 'Bolster the Ritual',
  skills: [{ skill: 'arcana', dc: 19 }, { skill: 'religion', dc: 19 }],
  threshold: 3,
  target: 'all',
  targetIds: ['thorn', 'lira', 'bram'],
  mode: 'once',
  actionCost: 0,
  createdAt: 1,
};

const entry = (overrides = {}) => ({
  round: 0,
  skill: 'arcana',
  d20: 14,
  total: 21,
  degree: 'success',
  vp: 1,
  at: 2,
  ...overrides,
});

const setChallenges = (...docs) => {
  __store['cnmh_vpchallenge_global'] = Object.fromEntries(docs.map((d) => [d.id, d]));
};

beforeEach(() => {
  __reset();
  mockAppendEvent.mockClear();
  mockEncounter = { active: false };
  useContent.mockReturnValue({ characters: CHARACTERS });
});

afterEach(() => vi.restoreAllMocks());

// ─── tests ───────────────────────────────────────────────────
describe('SkillChallengePanel', () => {
  it('renders nothing when no challenge is active', () => {
    const { container } = render(<SkillChallengePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows name, threshold, and a waiting row per target', () => {
    setChallenges(CHALLENGE);
    render(<SkillChallengePanel />);
    expect(screen.getByText('Bolster the Ritual')).toBeInTheDocument();
    expect(screen.getByText('0 / 3 VP')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting…')).toHaveLength(3);
    expect(screen.getByText('0/3 submitted')).toBeInTheDocument();
  });

  it('aggregates submitted results into the party VP total', () => {
    setChallenges(CHALLENGE);
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', { 'vpc-1': [entry({ vp: 2, degree: 'criticalSuccess', total: 29 })] }));
    act(() => __set('cnmh_vpresult_lira',  { 'vpc-1': [entry({ skill: 'religion', vp: 1 })] }));

    expect(screen.getByText('3 / 3 VP')).toBeInTheDocument();
    expect(screen.getByLabelText('vp-vpc-1-thorn')).toHaveTextContent('+2 VP');
    expect(screen.getByLabelText('vp-vpc-1-lira')).toHaveTextContent('+1 VP');
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
    expect(screen.getByText('Religion')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting…')).toHaveLength(1);
    expect(screen.getByText('2/3 submitted')).toBeInTheDocument();
  });

  it('counts critical failures as negative VP', () => {
    setChallenges(CHALLENGE);
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', { 'vpc-1': [entry({ vp: -1, degree: 'criticalFailure', total: 5 })] }));
    expect(screen.getByText('-1 / 3 VP')).toBeInTheDocument();
  });

  it('ignores results from other challenges', () => {
    setChallenges(CHALLENGE);
    __store['cnmh_vpresult_thorn'] = { 'vpc-old': [entry({ vp: 2 })] };
    render(<SkillChallengePanel />);
    expect(screen.getByText('0 / 3 VP')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting…')).toHaveLength(3);
  });

  it('reads legacy single-object challenge and result shapes', () => {
    // Pre-#1470 wire shapes: bare challenge object + one locked result.
    __store['cnmh_vpchallenge_global'] = { id: 'vpc-1', name: 'Old Hunt', skills: [{ skill: 'arcana', dc: 19 }], threshold: 3, targetIds: ['thorn'] };
    __store['cnmh_vpresult_thorn'] = { challengeId: 'vpc-1', reqId: 'r1', skill: 'arcana', d20: 14, total: 21, degree: 'success', vp: 1, at: 2 };
    render(<SkillChallengePanel />);
    expect(screen.getByText('Old Hunt')).toBeInTheDocument();
    expect(screen.getByText('1 / 3 VP')).toBeInTheDocument();
  });

  it('renders one card per concurrent track with independent pools', () => {
    setChallenges(
      CHALLENGE,
      { ...CHALLENGE, id: 'vpc-2', name: 'Assuage the Locals', threshold: 4, targetIds: ['thorn', 'lira'], createdAt: 2 }
    );
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', {
      'vpc-1': [entry({ vp: 2, degree: 'criticalSuccess' })],
      'vpc-2': [entry({ vp: 1 })],
    }));

    expect(screen.getByTestId('vp-track-vpc-1')).toBeInTheDocument();
    expect(screen.getByTestId('vp-track-vpc-2')).toBeInTheDocument();
    expect(screen.getByText('2 / 3 VP')).toBeInTheDocument();
    expect(screen.getByText('1 / 4 VP')).toBeInTheDocument();
  });

  it('per-round tracks accumulate across rounds and count this round only', () => {
    mockEncounter = { active: true, round: 2 };
    setChallenges({ ...CHALLENGE, mode: 'perRound', actionCost: 1 });
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', { 'vpc-1': [entry({ round: 1, vp: 1 }), entry({ round: 2, vp: 2, degree: 'criticalSuccess' })] }));
    act(() => __set('cnmh_vpresult_lira',  { 'vpc-1': [entry({ round: 1, vp: 1 })] }));

    // Pool sums every round: 1 + 2 + 1 = 4.
    expect(screen.getByText('4 / 3 VP')).toBeInTheDocument();
    // Thorn submitted this round; Lira's round-1 entry doesn't count for round 2.
    expect(screen.getByText('1/3 submitted this round')).toBeInTheDocument();
    // Cumulative per-character sigma totals.
    expect(screen.getByLabelText('total-vpc-1-thorn')).toHaveTextContent('+3');
    expect(screen.getByLabelText('total-vpc-1-lira')).toHaveTextContent('+1');
    // Lira's latest entry is stale for this round → waiting again.
    expect(screen.getAllByText('Waiting…')).toHaveLength(2);
  });

  it('End Challenge logs the outcome and removes only that track', () => {
    setChallenges(
      CHALLENGE,
      { ...CHALLENGE, id: 'vpc-2', name: 'Assuage the Locals', createdAt: 2 }
    );
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', { 'vpc-1': [entry({ vp: 2, degree: 'criticalSuccess' })] }));
    act(() => __set('cnmh_vpresult_lira',  { 'vpc-1': [entry({ vp: 1 })] }));
    fireEvent.click(screen.getByLabelText('End Bolster the Ritual'));

    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'challenge',
      text: expect.stringContaining('3/3 VP (success)'),
    }));
    expect(__store['cnmh_vpchallenge_global']).toEqual(
      expect.objectContaining({ 'vpc-2': expect.anything() })
    );
    expect(__store['cnmh_vpchallenge_global']['vpc-1']).toBeUndefined();
    expect(screen.getByText('Assuage the Locals')).toBeInTheDocument();
  });

  describe('meter tracks (#1471)', () => {
    const METER = {
      id: 'vpc-m',
      name: 'Ritual Stability',
      skills: [{ skill: 'arcana', dc: 19 }],
      threshold: null,
      target: 'all',
      targetIds: ['thorn', 'lira'],
      mode: 'perRound',
      actionCost: 1,
      startValue: 6,
      min: 0,
      max: 10,
      failAt: 0,
      drainPerRound: 2,
      adjust: 0,
      lastDrainRound: null,
      createdAt: 1,
    };

    it('shows the pool without a threshold and includes startValue + adjust', () => {
      setChallenges({ ...METER, drainPerRound: 0, adjust: -1 });
      render(<SkillChallengePanel />);
      act(() => __set('cnmh_vpresult_thorn', { 'vpc-m': [entry({ vp: 1 })] }));
      // 6 (start) + 1 (checks) - 1 (adjust) = 6
      expect(screen.getByText('6 VP')).toBeInTheDocument();
    });

    it('nudge buttons move the pool through adjust and log', () => {
      setChallenges({ ...METER, drainPerRound: 0 });
      render(<SkillChallengePanel />);
      fireEvent.click(screen.getByLabelText('Nudge Ritual Stability down'));
      expect(__store['cnmh_vpchallenge_global']['vpc-m'].adjust).toBe(-1);
      expect(screen.getByText('5 VP')).toBeInTheDocument();
      expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('nudged -1 → 5 VP'),
      }));
      fireEvent.click(screen.getByLabelText('Nudge Ritual Stability up'));
      expect(__store['cnmh_vpchallenge_global']['vpc-m'].adjust).toBe(0);
    });

    it('nudges clamp at the bounds and skip the write when fully clamped', () => {
      setChallenges({ ...METER, drainPerRound: 0, adjust: 4 });  // pool 10 = max
      render(<SkillChallengePanel />);
      mockAppendEvent.mockClear();
      fireEvent.click(screen.getByLabelText('Nudge Ritual Stability up'));
      expect(__store['cnmh_vpchallenge_global']['vpc-m'].adjust).toBe(4);
      expect(mockAppendEvent).not.toHaveBeenCalled();
    });

    it('flags FAILING when the pool hits failAt', () => {
      setChallenges({ ...METER, drainPerRound: 0, adjust: -6 });  // pool 0
      render(<SkillChallengePanel />);
      expect(screen.getByText('FAILING')).toBeInTheDocument();
      expect(screen.getByTestId('vp-track-vpc-m')).toHaveAttribute('data-failing', 'true');
    });

    it('arms lastDrainRound on first sighting without draining', () => {
      mockEncounter = { active: true, round: 3 };
      setChallenges(METER);
      render(<SkillChallengePanel />);
      expect(__store['cnmh_vpchallenge_global']['vpc-m'].lastDrainRound).toBe(3);
      expect(__store['cnmh_vpchallenge_global']['vpc-m'].adjust).toBe(0);
    });

    it('drains once per round advance and logs', () => {
      mockEncounter = { active: true, round: 3 };
      setChallenges({ ...METER, lastDrainRound: 2 });
      render(<SkillChallengePanel />);
      const doc = __store['cnmh_vpchallenge_global']['vpc-m'];
      expect(doc.adjust).toBe(-2);
      expect(doc.lastDrainRound).toBe(3);
      expect(screen.getByText('4 VP')).toBeInTheDocument();
      expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('drains 2 → 4 VP'),
      }));
      // Same round again (e.g. remount): no second application.
      mockAppendEvent.mockClear();
      render(<SkillChallengePanel />);
      expect(__store['cnmh_vpchallenge_global']['vpc-m'].adjust).toBe(-2);
      expect(mockAppendEvent).not.toHaveBeenCalled();
    });

    it('applies multi-round catch-up drain in one step, clamped at min', () => {
      mockEncounter = { active: true, round: 8 };
      setChallenges({ ...METER, lastDrainRound: 2 });  // 6 rounds × 2 = 12, pool 6 → floor 0
      render(<SkillChallengePanel />);
      const doc = __store['cnmh_vpchallenge_global']['vpc-m'];
      expect(doc.lastDrainRound).toBe(8);
      expect(screen.getByText('0 VP')).toBeInTheDocument();
      expect(screen.getByText('FAILING')).toBeInTheDocument();
    });

    it('editing drain per round re-arms lastDrainRound', () => {
      mockEncounter = { active: true, round: 5 };
      setChallenges({ ...METER, drainPerRound: 0, lastDrainRound: 2 });
      render(<SkillChallengePanel />);
      fireEvent.change(screen.getByLabelText('Ritual Stability drain per round'), { target: { value: '3' } });
      const doc = __store['cnmh_vpchallenge_global']['vpc-m'];
      expect(doc.drainPerRound).toBe(3);
      // Re-armed to the current round — rounds 3-5 are not back-charged.
      expect(doc.lastDrainRound).toBe(5);
      expect(doc.adjust).toBe(0);
    });

    it('ending a meter without a threshold logs held or failed', () => {
      setChallenges({ ...METER, drainPerRound: 0 });
      const first = render(<SkillChallengePanel />);
      fireEvent.click(screen.getByLabelText('End Ritual Stability'));
      expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('6 VP (held)'),
      }));
      first.unmount();

      mockAppendEvent.mockClear();
      setChallenges({ ...METER, drainPerRound: 0, adjust: -6 });  // pool 0 → failing
      render(<SkillChallengePanel />);
      fireEvent.click(screen.getByLabelText('End Ritual Stability'));
      expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringContaining('0 VP (failed)'),
      }));
    });
  });

  it('ending the last track clears the collection to null', () => {
    setChallenges(CHALLENGE);
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', { 'vpc-1': [entry({ vp: 1 })] }));
    fireEvent.click(screen.getByLabelText('End Bolster the Ritual'));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('1/3 VP (incomplete)'),
    }));
    expect(__store['cnmh_vpchallenge_global']).toBeNull();
  });
});
