import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

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

const mockAppendLog = vi.fn();
let mockEncounter = { active: false };
vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: () => ({ encounter: mockEncounter, appendLog: mockAppendLog }),
}));

const mockSpendActions = vi.fn();
vi.mock('../../hooks/useTurnState', () => ({
  useTurnState: () => ({ spendActions: mockSpendActions }),
}));

import { __reset, __store } from '../../hooks/useSyncedState';
import ChallengePrompts from './ChallengePrompts';

const skillMods = { arcana: 7, occultism: 9, religion: 2 };

const challenge = (overrides = {}) => ({
  id: 'vpc-1',
  name: 'Bolster the Ritual',
  skills: [
    { skill: 'arcana', dc: 19 },
    { skill: 'occultism', dc: 19 },
    { skill: 'religion', dc: 21 },
  ],
  threshold: 6,
  target: 'all',
  targetIds: ['thorn'],
  mode: 'once',
  actionCost: 0,
  createdAt: 1,
  ...overrides,
});

const setChallenges = (...docs) => {
  __store['cnmh_vpchallenge_global'] = Object.fromEntries(docs.map((d) => [d.id, d]));
};

function setup(charId = 'thorn') {
  return render(
    <ChallengePrompts charId={charId} characterName="Thorn" skillModifiers={skillMods} />
  );
}

const rerenderSheet = (utils, charId = 'thorn') =>
  utils.rerender(
    <ChallengePrompts charId={charId} characterName="Thorn" skillModifiers={skillMods} />
  );

beforeEach(() => {
  __reset();
  mockAppendLog.mockClear();
  mockSpendActions.mockClear();
  mockEncounter = { active: false };
});

describe('ChallengePrompts', () => {
  it('renders nothing with no active challenges', () => {
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when no challenge targets this character', () => {
    setChallenges(challenge({ targetIds: ['lira'] }));
    const { container } = setup();
    expect(container.firstChild).toBeNull();
  });

  it('renders one choice per allowed skill with DC and modifier', () => {
    setChallenges(challenge());
    setup();
    expect(screen.getByText('Bolster the Ritual')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.getAllByText('DC 19')).toHaveLength(2);
    expect(screen.getByText('DC 21')).toBeInTheDocument();
    expect(screen.getByText('+7')).toBeInTheDocument();  // arcana mod
    expect(screen.getByText('+9')).toBeInTheDocument();  // occultism mod
  });

  it('submit is disabled until a skill is chosen', () => {
    setChallenges(challenge());
    setup();
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    expect(screen.getByLabelText('Submit check')).toBeDisabled();
    fireEvent.click(screen.getByText('Occultism'));
    expect(screen.getByLabelText('Submit Occultism check')).toBeEnabled();
  });

  it('submitting appends an entry to the result map and logs the VP delta', () => {
    setChallenges(challenge());
    setup();
    // occultism mod 9, d20=12 → total 21 ≥ DC 19 → success → +1 VP
    fireEvent.click(screen.getByText('Occultism'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '12' } });
    fireEvent.click(screen.getByLabelText('Submit Occultism check'));

    expect(screen.getByText('21')).toBeInTheDocument();
    expect(screen.getByText('Success')).toBeInTheDocument();
    expect(screen.getByText('+1 VP')).toBeInTheDocument();
    expect(__store['cnmh_vpresult_thorn']['vpc-1']).toEqual([
      expect.objectContaining({ round: 0, skill: 'occultism', d20: 12, total: 21, degree: 'success', vp: 1 }),
    ]);
    expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('+1 VP'),
    }));
    expect(mockSpendActions).not.toHaveBeenCalled();
  });

  it('critical success contributes +2 VP, critical failure -1 VP', () => {
    setChallenges(challenge({ mode: 'perRound' }));
    mockEncounter = { active: true, round: 1 };
    const utils = setup();
    // arcana mod 7, d20=20: total 27, DC 19 → success; nat 20 shifts up → crit
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(screen.getByText('+2 VP')).toBeInTheDocument();

    // religion mod 2, d20=1: total 3 vs DC 21 → crit failure
    mockEncounter = { active: true, round: 2 };
    rerenderSheet(utils);
    fireEvent.click(screen.getByText('Religion'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '1' } });
    fireEvent.click(screen.getByLabelText('Submit Religion check'));
    expect(screen.getByText('-1 VP')).toBeInTheDocument();
    expect(__store['cnmh_vpresult_thorn']['vpc-1'].map((e) => e.vp)).toEqual([2, -1]);
  });

  it('once mode locks the card after one attempt — no d20 input, no dismiss', () => {
    setChallenges(challenge());
    setup();
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(screen.queryByLabelText('Bolster the Ritual d20 roll')).toBeNull();
    expect(screen.queryByLabelText('Dismiss skill result')).toBeNull();
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  it('perRound mode locks for the round and reopens when the round advances', () => {
    setChallenges(challenge({ mode: 'perRound' }));
    mockEncounter = { active: true, round: 1 };
    const utils = setup();

    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));

    // Locked for round 1, cumulative total shown.
    expect(screen.queryByLabelText('Bolster the Ritual d20 roll')).toBeNull();
    expect(screen.getByText('Locked — again next round')).toBeInTheDocument();
    expect(screen.getByLabelText('your total contribution')).toHaveTextContent('+1 VP');

    // Round advances → input returns, second entry accumulates.
    mockEncounter = { active: true, round: 2 };
    rerenderSheet(utils);
    expect(screen.getByLabelText('Bolster the Ritual d20 roll')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(__store['cnmh_vpresult_thorn']['vpc-1']).toHaveLength(2);
    expect(__store['cnmh_vpresult_thorn']['vpc-1'][1].round).toBe(2);
    expect(screen.getByLabelText('your total contribution')).toHaveTextContent('+2 VP');
  });

  it('spends the action cost during an active encounter', () => {
    setChallenges(challenge({ actionCost: 2 }));
    mockEncounter = { active: true, round: 1 };
    setup();
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(mockSpendActions).toHaveBeenCalledWith(2, 'Bolster the Ritual');
  });

  it('does not spend actions outside an encounter', () => {
    setChallenges(challenge({ actionCost: 2 }));
    setup();
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(mockSpendActions).not.toHaveBeenCalled();
  });

  it('renders a card per concurrent challenge; submissions stay independent', () => {
    setChallenges(
      challenge(),
      challenge({ id: 'vpc-2', name: 'Assuage the Locals', skills: [{ skill: 'religion', dc: 18 }], createdAt: 2 })
    );
    setup();
    expect(screen.getByText('Bolster the Ritual')).toBeInTheDocument();
    expect(screen.getByText('Assuage the Locals')).toBeInTheDocument();

    // religion mod 2, d20=17 → 19 ≥ 18 → success on the second card only
    fireEvent.change(screen.getByLabelText('Assuage the Locals d20 roll'), { target: { value: '17' } });
    fireEvent.click(screen.getByLabelText('Submit Religion check'));
    expect(__store['cnmh_vpresult_thorn']['vpc-2']).toHaveLength(1);
    expect(__store['cnmh_vpresult_thorn']['vpc-1']).toBeUndefined();
    // First card still open for entry.
    expect(screen.getByLabelText('Bolster the Ritual d20 roll')).toBeInTheDocument();
  });

  it('prunes result entries for challenges the GM has ended', () => {
    setChallenges(challenge());
    __store['cnmh_vpresult_thorn'] = {
      'vpc-old': [{ round: 0, skill: 'arcana', vp: 1, at: 1 }],
      'vpc-1': [{ round: 0, skill: 'arcana', vp: 1, at: 2 }],
    };
    setup();
    expect(Object.keys(__store['cnmh_vpresult_thorn'])).toEqual(['vpc-1']);
  });

  it('renders the legacy single-challenge shape as one card', () => {
    __store['cnmh_vpchallenge_global'] = challenge();  // pre-#1470 single object
    setup();
    expect(screen.getByText('Bolster the Ritual')).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
  });

  it('shows the action cost glyph and per-round chip', () => {
    setChallenges(challenge({ mode: 'perRound', actionCost: 1 }));
    setup();
    expect(screen.getByText('each round')).toBeInTheDocument();
    expect(screen.getByLabelText('costs 1 action')).toBeInTheDocument();
  });
});
