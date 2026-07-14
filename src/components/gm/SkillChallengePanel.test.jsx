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
