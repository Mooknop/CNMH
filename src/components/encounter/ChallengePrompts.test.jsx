import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';

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

// Roster for the party-pool collector (#1471).
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: [{ id: 'thorn', name: 'Thorn' }, { id: 'lira', name: 'Lira' }] }),
}));

import { __reset, __set, __store } from '../../hooks/useSyncedState';
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
    setup();
    // arcana mod 7, d20=20: total 27, DC 19 → success; nat 20 shifts up → crit
    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '20' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    expect(screen.getByText('+2 VP')).toBeInTheDocument();

    // Second attempt in the SAME combat round — actions, not rounds, limit.
    // religion mod 2, d20=1: total 3 vs DC 21 → crit failure
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

  it('perRound in combat never locks — actions are the only limiter', () => {
    setChallenges(challenge({ mode: 'perRound', actionCost: 1 }));
    mockEncounter = { active: true, round: 1 };
    setup();

    const attempt = () => {
      fireEvent.click(screen.getByText('Arcana'));
      fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
      fireEvent.click(screen.getByLabelText('Submit Arcana check'));
    };
    // Three attempts, one combat round — a full turn spent on the track.
    attempt();
    attempt();
    attempt();

    const entries = __store['cnmh_vpresult_thorn']['vpc-1'];
    expect(entries).toHaveLength(3);
    expect(entries.every((e) => e.round === 1)).toBe(true);
    expect(mockSpendActions).toHaveBeenCalledTimes(3);
    // Card stays open; no round lock messaging; cumulative total updates.
    expect(screen.getByLabelText('Bolster the Ritual d20 roll')).toBeInTheDocument();
    expect(screen.queryByText('Locked — again next round')).toBeNull();
    expect(screen.getByLabelText('your total contribution')).toHaveTextContent('+3 VP');
  });

  it('perRound outside combat locks per GM scene round', () => {
    setChallenges(challenge({ mode: 'perRound', sceneRound: 1 }));
    setup();

    fireEvent.click(screen.getByText('Arcana'));
    fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '14' } });
    fireEvent.click(screen.getByLabelText('Submit Arcana check'));

    // Locked for scene round 1.
    expect(screen.queryByLabelText('Bolster the Ritual d20 roll')).toBeNull();
    expect(screen.getByText('Locked — again next round')).toBeInTheDocument();
    expect(__store['cnmh_vpresult_thorn']['vpc-1'][0].round).toBe(1);

    // GM advances the scene round → input returns.
    act(() => __set('cnmh_vpchallenge_global', {
      'vpc-1': { ...challenge({ mode: 'perRound', sceneRound: 2 }) },
    }));
    expect(screen.getByLabelText('Bolster the Ritual d20 roll')).toBeInTheDocument();
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

  describe('influence tracks (#205)', () => {
    const nualia = (over = {}) => ({
      id: 'inf-1',
      kind: 'influence',
      name: 'Nualia',
      skills: [
        { skill: 'society', dc: 18 },
        { skill: 'religion', dc: 19 },
      ],
      discoveries: [{ skill: 'occultism', dc: 18 }],
      revealed: ['society'],
      tiers: [{ at: 3, note: 'dooms' }],
      resistNote: '',
      dcModifier: 0,
      roundsTotal: 10,
      sceneRound: 1,
      threshold: null,
      mode: 'perRound',
      actionCost: 1,
      target: 'all',
      targetIds: ['thorn'],
      adjust: 0,
      createdAt: 1,
      ...over,
    });

    it('masks unrevealed influence DCs and shows revealed ones', () => {
      setChallenges(nualia());
      setup();
      expect(screen.getByLabelText('Nualia influence prompt')).toBeInTheDocument();
      // Discovery occultism DC 18 + revealed society DC 18 both visible.
      expect(screen.getAllByText('DC 18')).toHaveLength(2);
      expect(screen.getByText('DC ?')).toBeInTheDocument();       // unrevealed religion
      expect(screen.getByLabelText('revealed')).toBeInTheDocument();  // ★ on society
    });

    it('applies the GM DC modifier to the submitted check', () => {
      setChallenges(nualia({ dcModifier: 4 }));
      setup();
      // society base 18 + 4 = 22; mod... society not in skillMods → +0? use religion:
      // religion mod 2, d20 17 → 19: success vs 19 but DC is now 23 → failure
      fireEvent.click(screen.getByText(/Religion/));
      fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '17' } });
      fireEvent.click(screen.getByLabelText('Submit Religion check'));
      const entry = __store['cnmh_vpresult_thorn']['inf-1'][0];
      expect(entry.degree).toBe('failure');
      expect(entry.vp).toBe(0);
    });

    it('in combat neither group locks — a PC can talk for the whole turn', () => {
      setChallenges(nualia());
      mockEncounter = { active: true, round: 1 };
      setup();

      // Discovery: occultism mod 9, d20 12 → 21 vs DC 18 → success, vp 0
      fireEvent.click(screen.getByText('Occultism'));
      fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Submit Occultism check'));
      const d = __store['cnmh_vpresult_thorn']['inf-1'][0];
      expect(d.discovery).toBe(true);
      expect(d.vp).toBe(0);
      expect(mockSpendActions).toHaveBeenCalledWith(1, 'Nualia');

      // Nothing locks — two more influence attempts in the same round.
      const influenceAttempt = () => {
        fireEvent.click(screen.getByRole('radio', { name: /Religion/ }));
        fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '18' } });
        fireEvent.click(screen.getByLabelText('Submit Religion check'));
      };
      influenceAttempt();
      influenceAttempt();

      const entries = __store['cnmh_vpresult_thorn']['inf-1'];
      expect(entries).toHaveLength(3);
      expect(entries.every((e) => e.round === 1)).toBe(true);
      expect(mockSpendActions).toHaveBeenCalledTimes(3);
      expect(screen.getByRole('radio', { name: /Occultism/ })).toBeEnabled();
      expect(screen.getByRole('radio', { name: /Religion/ })).toBeEnabled();
      expect(screen.getByLabelText("this round's checks").children).toHaveLength(3);
    });

    it('outside combat discovery and influence lock independently per scene round', () => {
      setChallenges(nualia({ sceneRound: 1 }));
      setup();

      // Discovery: locks its own group only.
      fireEvent.click(screen.getByText('Occultism'));
      fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Submit Occultism check'));
      expect(screen.getByRole('radio', { name: /Occultism/ })).toBeDisabled();
      expect(screen.getByRole('radio', { name: /Religion/ })).toBeEnabled();

      // Influence: religion mod 2, d20 18 → 20 vs 19 → success, +1
      fireEvent.click(screen.getByRole('radio', { name: /Religion/ }));
      fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '18' } });
      fireEvent.click(screen.getByLabelText('Submit Religion check'));
      expect(screen.getByRole('radio', { name: /Religion/ })).toBeDisabled();
      expect(__store['cnmh_vpresult_thorn']['inf-1']).toHaveLength(2);
      // No action spend outside encounters.
      expect(mockSpendActions).not.toHaveBeenCalled();
    });

    it('uses the GM scene round outside combat', () => {
      setChallenges(nualia({ sceneRound: 4 }));
      setup();
      expect(screen.getByText(/Round 4 \/ 10/)).toBeInTheDocument();
      fireEvent.click(screen.getByText(/Religion/));
      fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '18' } });
      fireEvent.click(screen.getByLabelText('Submit Religion check'));
      expect(__store['cnmh_vpresult_thorn']['inf-1'][0].round).toBe(4);
      expect(mockSpendActions).not.toHaveBeenCalled();
    });

    it('shows no party pool and logs without VP', () => {
      setChallenges(nualia({ adjust: 5 }));
      setup();
      expect(screen.queryByLabelText('Nualia party pool')).toBeNull();
      fireEvent.click(screen.getByText(/Religion/));
      fireEvent.change(screen.getByLabelText('Nualia d20 roll'), { target: { value: '18' } });
      fireEvent.click(screen.getByLabelText('Submit Religion check'));
      const logged = mockAppendLog.mock.calls.at(-1)[0].text;
      expect(logged).toContain('Religion');
      expect(logged).not.toContain('VP');
    });
  });

  describe('party pool display (#1471)', () => {
    it('shows the party pool including other characters and GM adjust', () => {
      setChallenges(challenge({ targetIds: ['thorn', 'lira'], startValue: 6, adjust: -2 }));
      __store['cnmh_vpresult_lira'] = { 'vpc-1': [{ round: 0, skill: 'arcana', vp: 2, at: 1 }] };
      setup();
      // 6 (start) + 2 (Lira) - 2 (adjust) = 6, threshold 6
      expect(screen.getByLabelText('Bolster the Ritual party pool')).toHaveTextContent('Party: 6 / 6 VP');
    });

    it('updates the pool with own submissions', () => {
      setChallenges(challenge());
      setup();
      fireEvent.click(screen.getByText('Occultism'));
      fireEvent.change(screen.getByLabelText('Bolster the Ritual d20 roll'), { target: { value: '12' } });
      fireEvent.click(screen.getByLabelText('Submit Occultism check'));
      expect(screen.getByLabelText('Bolster the Ritual party pool')).toHaveTextContent('Party: 1 / 6 VP');
    });

    it('shows a threshold-less meter pool with a FAILING flag at the floor', () => {
      setChallenges(challenge({
        name: 'Ritual Stability',
        threshold: null,
        startValue: 6,
        min: 0,
        failAt: 0,
        adjust: -6,
      }));
      setup();
      expect(screen.getByLabelText('Ritual Stability party pool')).toHaveTextContent('Party: 0 VP');
      expect(screen.getByText('FAILING')).toBeInTheDocument();
    });
  });
});
