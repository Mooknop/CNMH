import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

// ─── mocks ───────────────────────────────────────────────────
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../contexts/SessionContext',  () => ({ useSession:  vi.fn() }));

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
import { useSession }  from '../../contexts/SessionContext';
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
  createdAt: 1,
};

const vpResult = (overrides = {}) => ({
  challengeId: 'vpc-1',
  reqId: 'vpc-1-1-x',
  skill: 'arcana',
  d20: 14,
  total: 21,
  degree: 'success',
  vp: 1,
  at: 2,
  ...overrides,
});

let sendUpdate;

beforeEach(() => {
  __reset();
  sendUpdate = vi.fn();
  mockAppendEvent.mockClear();
  useContent.mockReturnValue({ characters: CHARACTERS });
  useSession.mockReturnValue({ sendUpdate });
});

afterEach(() => vi.restoreAllMocks());

// ─── tests ───────────────────────────────────────────────────
describe('SkillChallengePanel', () => {
  it('renders nothing when no challenge is active', () => {
    const { container } = render(<SkillChallengePanel />);
    expect(container.firstChild).toBeNull();
  });

  it('shows name, threshold, and a waiting row per target', () => {
    __store['cnmh_vpchallenge_global'] = CHALLENGE;
    render(<SkillChallengePanel />);
    expect(screen.getByText('Bolster the Ritual')).toBeInTheDocument();
    expect(screen.getByText('0 / 3 VP')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting…')).toHaveLength(3);
    expect(screen.getByText('0/3 submitted')).toBeInTheDocument();
  });

  it('aggregates submitted results into the party VP total', () => {
    __store['cnmh_vpchallenge_global'] = CHALLENGE;
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', vpResult({ vp: 2, degree: 'criticalSuccess', total: 29 })));
    act(() => __set('cnmh_vpresult_lira',  vpResult({ skill: 'religion', vp: 1 })));

    expect(screen.getByText('3 / 3 VP')).toBeInTheDocument();
    expect(screen.getByLabelText('vp-thorn')).toHaveTextContent('+2 VP');
    expect(screen.getByLabelText('vp-lira')).toHaveTextContent('+1 VP');
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
    expect(screen.getByText('Religion')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting…')).toHaveLength(1);
    expect(screen.getByText('2/3 submitted')).toBeInTheDocument();
  });

  it('counts critical failures as negative VP', () => {
    __store['cnmh_vpchallenge_global'] = CHALLENGE;
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', vpResult({ vp: -1, degree: 'criticalFailure', total: 5 })));
    expect(screen.getByText('-1 / 3 VP')).toBeInTheDocument();
  });

  it('ignores results from a previous challenge', () => {
    __store['cnmh_vpchallenge_global'] = CHALLENGE;
    __store['cnmh_vpresult_thorn'] = vpResult({ challengeId: 'vpc-old', vp: 2 });
    render(<SkillChallengePanel />);
    expect(screen.getByText('0 / 3 VP')).toBeInTheDocument();
    expect(screen.getAllByText('Waiting…')).toHaveLength(3);
  });

  it('End Challenge logs the outcome and clears all challenge keys', () => {
    __store['cnmh_vpchallenge_global'] = CHALLENGE;
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', vpResult({ vp: 2, degree: 'criticalSuccess' })));
    act(() => __set('cnmh_vpresult_lira',  vpResult({ vp: 1 })));
    fireEvent.click(screen.getByLabelText('End skill challenge'));

    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      type: 'challenge',
      text: expect.stringContaining('3/3 VP (success)'),
    }));
    for (const id of CHALLENGE.targetIds) {
      expect(sendUpdate).toHaveBeenCalledWith(id, 'skillprompt', null);
      expect(sendUpdate).toHaveBeenCalledWith(id, 'vpresult', null);
    }
    expect(__store['cnmh_vpchallenge_global']).toBeNull();
  });

  it('logs incomplete when ended below the threshold', () => {
    __store['cnmh_vpchallenge_global'] = CHALLENGE;
    render(<SkillChallengePanel />);
    act(() => __set('cnmh_vpresult_thorn', vpResult({ vp: 1 })));
    fireEvent.click(screen.getByLabelText('End skill challenge'));
    expect(mockAppendEvent).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('1/3 VP (incomplete)'),
    }));
  });
});
