import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import RequestedSaves from './RequestedSaves';

const mockAppendLog     = vi.fn();
const mockRemoveSaveReq = vi.fn();

const goblinTarget = { entryId: 'e-goblin', name: 'Goblin',  saveMod: 5  };
const trollTarget  = { entryId: 'e-troll',  name: 'Troll',   saveMod: 8  };
const noModTarget  = { entryId: 'e-zombie', name: 'Zombie',  saveMod: null };

const baseRequest = {
  id:          'savereq-1',
  casterId:    'char-a',
  casterName:  'Pellias',
  abilityName: 'Fireball',
  save:        'reflex',
  dc:          20,
  basic:       false,
  targets:     [goblinTarget],
  status:      'pending',
};

function makeEncounter(saveRequests = []) {
  return {
    active: true,
    phase: 'in-progress',
    round: 1,
    currentTurnIndex: 0,
    order: [],
    log: [],
    saveRequests,
  };
}

vi.mock('../../hooks/useEncounter', () => ({
  useEncounter: vi.fn(),
}));

// Session mock (#274): capture sendUpdate so the caster-side save-outcome effect
// writes can be inspected; getState returns the target's current effects ([]).
const sessionMock = vi.hoisted(() => ({ sendUpdate: vi.fn(), getState: vi.fn(() => []) }));
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: sessionMock.sendUpdate, getState: sessionMock.getState }),
}));

// Key-aware synced-state mock (#272): capture the cnmh_persistent_global
// setter so tests can apply its functional updater and inspect the map.
// cnmh_knowledge_global likewise (#1014 — IWR reveal-on-trigger writes).
const syncedMock = vi.hoisted(() => ({ persistentSetter: null, knowledgeSetter: null }));
vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: (key) => {
    if (key === 'cnmh_persistent_global') {
      syncedMock.persistentSetter = syncedMock.persistentSetter || vi.fn();
      return [{}, syncedMock.persistentSetter];
    }
    if (key === 'cnmh_knowledge_global') {
      syncedMock.knowledgeSetter = syncedMock.knowledgeSetter || vi.fn();
      return [{}, syncedMock.knowledgeSetter];
    }
    return [[], vi.fn()];
  },
}));

// Re-import after mock so we can .mockReturnValue inside tests.
import { useEncounter } from '../../hooks/useEncounter';

beforeEach(() => {
  vi.clearAllMocks();
  syncedMock.persistentSetter = null;
  syncedMock.knowledgeSetter = null;
  useEncounter.mockReturnValue({
    encounter: makeEncounter([baseRequest]),
    appendLog: mockAppendLog,
    removeSaveRequest: mockRemoveSaveReq,
  });
});

describe('RequestedSaves', () => {
  test('renders nothing when there are no pending save requests', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    const { container } = render(<RequestedSaves />);
    expect(container.firstChild).toBeNull();
  });

  test('renders nothing when encounter is null', () => {
    useEncounter.mockReturnValue({
      encounter: null,
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    const { container } = render(<RequestedSaves />);
    expect(container.firstChild).toBeNull();
  });

  test('shows caster name, ability name, save type, and DC', () => {
    render(<RequestedSaves />);
    expect(screen.getByText(/Pellias/)).toBeInTheDocument();
    expect(screen.getByText(/Fireball/)).toBeInTheDocument();
    expect(screen.getByText(/Reflex DC/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
  });

  test('shows the cast rank when the request carries one (#235)', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, rank: 4 }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.getByText(/\(rank 4\)/)).toBeInTheDocument();
  });

  test('shows no rank label when the request has none', () => {
    render(<RequestedSaves />);
    expect(screen.queryByText(/\(rank/)).not.toBeInTheDocument();
  });

  test('shows "(basic)" label when basic is true', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, basic: true }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.getByText(/basic/i)).toBeInTheDocument();
  });

  test('does not show "(basic)" label when basic is false', () => {
    render(<RequestedSaves />);
    expect(screen.queryByText(/basic/i)).not.toBeInTheDocument();
  });

  test('shows each target name', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, targets: [goblinTarget, trollTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.getByText('Goblin')).toBeInTheDocument();
    expect(screen.getByText('Troll')).toBeInTheDocument();
  });

  test('shows save modifier for each target that has one', () => {
    render(<RequestedSaves />);
    expect(screen.getByText(/mod \+5/)).toBeInTheDocument();
  });

  test('does not show modifier label when saveMod is null', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, targets: [noModTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    expect(screen.queryByText(/mod/)).not.toBeInTheDocument();
  });

  test('"Log Results" button is disabled until d20 is entered for all targets', () => {
    render(<RequestedSaves />);
    const btn = screen.getByRole('button', { name: /log results/i });
    expect(btn).toBeDisabled();
  });

  test('"Log Results" button is enabled once all targets have a d20', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    expect(screen.getByRole('button', { name: /log results/i })).not.toBeDisabled();
  });

  test('shows live degree while d20 is entered', () => {
    render(<RequestedSaves />);
    // DC 20, saveMod 5, d20 = 15 → total 20 → Success
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    expect(screen.getByText('Success')).toBeInTheDocument();
  });

  test('nat-20 shifts degree up', () => {
    render(<RequestedSaves />);
    // DC 20, saveMod 5, d20 = 15 → total 20 → would be Success, nat-20 → Critical Success
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '20' } });
    // total = 20 + 5 = 25 ≥ DC+10 → Critical Success (and nat-20 also shifts up but already at max)
    expect(screen.getByText('Critical Success')).toBeInTheDocument();
  });

  test('nat-1 shifts degree down', () => {
    render(<RequestedSaves />);
    // DC 20, saveMod 5, d20 = 1 → total 6 → would be Critical Failure, nat-1 keeps at Critical Failure
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '1' } });
    expect(screen.getByText('Critical Failure')).toBeInTheDocument();
  });

  test('shows computed total = d20 + saveMod', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '12' } });
    // total = 12 + 5 = 17
    expect(screen.getByText('= 17')).toBeInTheDocument();
  });

  test('clicking "Log Results" appends a log line for each target', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));
    expect(mockAppendLog).toHaveBeenCalledTimes(1);
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Goblin') })
    );
  });

  test('clicking "Log Results" calls removeSaveRequest with the request id', () => {
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));
    expect(mockRemoveSaveReq).toHaveBeenCalledWith('savereq-1');
  });

  test('two-target request: button disabled until both filled', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, id: 'req-2', targets: [goblinTarget, trollTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    const btn = screen.getByRole('button', { name: /log results/i });

    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '10' } });
    expect(btn).toBeDisabled(); // Troll not yet filled

    fireEvent.change(screen.getByLabelText(/Troll d20/i), { target: { value: '8' } });
    expect(btn).not.toBeDisabled();
  });

  test('two-target request: logs one line per target and removes the request', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, id: 'req-2', targets: [goblinTarget, trollTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText(/Troll d20/i),  { target: { value: '5'  } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));

    expect(mockAppendLog).toHaveBeenCalledTimes(2);
    expect(mockRemoveSaveReq).toHaveBeenCalledWith('req-2');
  });

  test('target with null saveMod resolves with mod treated as 0', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, targets: [noModTarget] }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    // d20 = 20 + null saveMod (→ 0) = total 20 vs DC 20 → Success; nat-20 → Critical Success
    fireEvent.change(screen.getByLabelText(/Zombie d20/i), { target: { value: '20' } });
    fireEvent.click(screen.getByRole('button', { name: /log results/i }));
    expect(mockAppendLog).toHaveBeenCalledWith(
      expect.objectContaining({ text: expect.stringContaining('Zombie') })
    );
  });

  test('skips resolved requests (only shows pending)', () => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([
        { ...baseRequest, id: 'req-done', status: 'resolved' },
        { ...baseRequest, id: 'req-pending', targets: [goblinTarget] },
      ]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
    render(<RequestedSaves />);
    // Only one "Log Results" button (for the pending one)
    expect(screen.getAllByRole('button', { name: /log results/i })).toHaveLength(1);
  });

  // ── save-based damage derivation (#270) ────────────────────────────────────

  const withDamage = (damage, extra = {}) => {
    useEncounter.mockReturnValue({
      encounter: makeEncounter([{ ...baseRequest, basic: true, damage, ...extra }]),
      appendLog: mockAppendLog,
      removeSaveRequest: mockRemoveSaveReq,
    });
  };
  const dmgFixture = { entered: 12, expression: '6d6', typeLabel: 'fire', riders: [] };
  const enterGoblinD20 = (v) =>
    fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: String(v) } });

  describe('damage payloads (#270)', () => {
    test('header shows the expression, type, and rolled total', () => {
      withDamage(dmgFixture);
      render(<RequestedSaves />);
      expect(screen.getByText('6d6 fire — rolled 12')).toBeInTheDocument();
    });

    test('live per-target damage tracks the degree: full / half / double / none', () => {
      withDamage(dmgFixture);
      render(<RequestedSaves />);
      // DC 20, mod +5. d20 10 → 15 → Failure → full 12.
      enterGoblinD20(10);
      expect(screen.getByText('12')).toBeInTheDocument();
      // d20 15 → 20 → Success → floor(12/2) = 6.
      enterGoblinD20(15);
      expect(screen.getByText('6 (12 half)')).toBeInTheDocument();
      // d20 1 → nat 1 → Critical Failure → 24.
      enterGoblinD20(1);
      expect(screen.getByText('24 (12 ×2)')).toBeInTheDocument();
      // d20 20 → Critical Success → no damage.
      enterGoblinD20(20);
      expect(screen.getByText('no damage')).toBeInTheDocument();
    });

    test('log lines carry the damage breakdown per degree', () => {
      withDamage(dmgFixture);
      render(<RequestedSaves />);
      enterGoblinD20(15); // Success
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Goblin rolls Reflex DC vs DC 20 (Fireball): 20 → Success · damage 6 (12 half)',
      }));
    });

    test('a critical success logs "no damage"', () => {
      withDamage(dmgFixture);
      render(<RequestedSaves />);
      enterGoblinD20(20);
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: expect.stringMatching(/Critical Success · no damage$/),
      }));
    });

    test('weakness riders only hit their scoped entryId', () => {
      withDamage(
        { ...dmgFixture, riders: [{ id: 'w', label: 'weakness (fire 5)', weakness: 5, appliesToEntryIds: ['e-goblin'] }] },
        { targets: [goblinTarget, trollTarget] }
      );
      render(<RequestedSaves />);
      enterGoblinD20(10); // Failure → 12 + 5
      fireEvent.change(screen.getByLabelText(/Troll d20/i), { target: { value: '7' } }); // 15 → Failure → 12
      expect(screen.getByText('17 (12 +5 weakness (fire 5))')).toBeInTheDocument();
      expect(screen.getByText('12')).toBeInTheDocument();
    });

    test('persistent riders fire on a crit fail (doubled) but not on a success', () => {
      withDamage({
        ...dmgFixture,
        riders: [{ id: 'p', label: 'Persistent electricity', persistent: { dice: '1d4', type: 'electricity' } }],
      });
      render(<RequestedSaves />);
      enterGoblinD20(15); // Success — default `on` excludes it
      expect(screen.queryByText(/persistent/)).toBeNull();
      enterGoblinD20(1); // Critical Failure — dice doubled
      expect(screen.getByText(/2d4 persistent electricity \(DC 15 flat to end\)/)).toBeInTheDocument();
    });

    test('requests without damage log the exact legacy line', () => {
      render(<RequestedSaves />);
      enterGoblinD20(15);
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(mockAppendLog).toHaveBeenCalledWith(expect.objectContaining({
        text: 'Goblin rolls Reflex DC vs DC 20 (Fireball): 20 → Success',
      }));
    });
  });

  // ── typed damage relay to Foundry (#1016) ──────────────────────────────────

  describe('typed damage relay (#1016)', () => {
    // The relay filters to enemy order entries, so these tests stock the order.
    const withDamageAndOrder = (damage, extra = {}) => {
      useEncounter.mockReturnValue({
        encounter: {
          ...makeEncounter([{ ...baseRequest, basic: true, damage, ...extra }]),
          order: [
            { entryId: 'e-goblin', kind: 'enemy', name: 'Goblin' },
            { entryId: 'e-troll',  kind: 'enemy', name: 'Troll' },
            { entryId: 'e-pc',     kind: 'pc',    name: 'Ashka', charId: 'char-a' },
          ],
        },
        appendLog: mockAppendLog,
        removeSaveRequest: mockRemoveSaveReq,
      });
    };

    test('resolving sends the RAW typed per-target totals to the bridge', () => {
      withDamageAndOrder(dmgFixture, { targets: [goblinTarget, trollTarget] });
      render(<RequestedSaves />);
      enterGoblinD20(10); // 15 → Failure → full 12
      fireEvent.change(screen.getByLabelText(/Troll d20/i), { target: { value: '20' } }); // crit success → none
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));

      expect(sessionMock.sendUpdate).toHaveBeenCalledWith('global', 'dmgapply', expect.objectContaining({
        sourceName: 'Fireball',
        hits: [{ entryId: 'e-goblin', name: 'Goblin', amount: 12, type: 'fire' }],
      }));
    });

    test('does not relay targets outside the enemy order', () => {
      withDamageAndOrder(dmgFixture, {
        targets: [{ entryId: 'e-unknown', name: 'Manual Foe', saveMod: 5 }],
      });
      render(<RequestedSaves />);
      fireEvent.change(screen.getByLabelText(/Manual Foe d20/i), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));

      expect(sessionMock.sendUpdate).not.toHaveBeenCalledWith('global', 'dmgapply', expect.anything());
    });

    test('sends nothing when every save avoided damage', () => {
      withDamageAndOrder(dmgFixture);
      render(<RequestedSaves />);
      enterGoblinD20(20); // crit success — no damage
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));

      expect(sessionMock.sendUpdate).not.toHaveBeenCalledWith('global', 'dmgapply', expect.anything());
    });
  });

  // ── persistent-damage recording (#272) ─────────────────────────────────────

  describe('persistent-damage recording (#272)', () => {
    const persistentRider = {
      id: 'p', label: 'Persistent electricity',
      persistent: { dice: '1d4', type: 'electricity' },
    };

    // The setter receives a functional updater — apply it to the prior map.
    const recordedMap = (prior = {}) =>
      syncedMock.persistentSetter.mock.calls.reduce((map, [updater]) => updater(map), prior);

    test('a failed save records the instance with dice, type, and source', () => {
      withDamage({ ...dmgFixture, riders: [persistentRider] });
      render(<RequestedSaves />);
      enterGoblinD20(10); // 15 vs DC 20 → Failure
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      const map = recordedMap();
      expect(map['e-goblin']).toHaveLength(1);
      expect(map['e-goblin'][0]).toMatchObject({
        dice: '1d4',
        type: 'electricity',
        sourceName: 'Fireball',
      });
    });

    test('a critical failure records the doubled dice', () => {
      withDamage({ ...dmgFixture, riders: [persistentRider] });
      render(<RequestedSaves />);
      enterGoblinD20(1); // nat 1 → Critical Failure
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(recordedMap()['e-goblin'][0].dice).toBe('2d4');
    });

    test('successful saves record nothing under the default rider gating', () => {
      withDamage({ ...dmgFixture, riders: [persistentRider] });
      render(<RequestedSaves />);
      enterGoblinD20(15); // Success
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(syncedMock.persistentSetter).not.toHaveBeenCalled();
    });

    test('a success-applicable rider records with the half flag', () => {
      withDamage({
        ...dmgFixture,
        riders: [{ ...persistentRider, on: ['success', 'failure', 'criticalFailure'] }],
      });
      render(<RequestedSaves />);
      enterGoblinD20(15); // Success — basic saves halve persistent too
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(recordedMap()['e-goblin'][0]).toMatchObject({ dice: '1d4', half: true });
    });
  });

  // ── save-outcome-gated caster-side effect (#274 — Shining Guidance) ─────────

  describe('save-outcome caster-side effect (#274)', () => {
    const limnReq = {
      ...baseRequest,
      id: 'req-limn',
      save: 'fortitude',
      basic: true,
      abilityName: 'Shining Guidance',
      targets: [goblinTarget],
      casterEffect: {
        def: { effectId: 'shining-guidance', duration: { until: 'caster-turn-end' }, onDegrees: ['success', 'failure', 'criticalFailure'] },
        targets: [{ charId: 'char-a', entryId: 'pc-a' }, { charId: 'char-b', entryId: 'pc-b' }],
        casterId: 'char-a',
        casterName: 'Izzy',
        casterEntryId: 'pc-a',
      },
    };
    const withLimn = (extra = {}) =>
      useEncounter.mockReturnValue({
        encounter: makeEncounter([{ ...limnReq, ...extra }]),
        appendLog: mockAppendLog,
        removeSaveRequest: mockRemoveSaveReq,
      });

    test('applies the effect to every ally on a gating degree (Failure)', () => {
      withLimn();
      render(<RequestedSaves />);
      enterGoblinD20(10); // 15 vs DC 20 → Failure (in onDegrees)
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      const writes = sessionMock.sendUpdate.mock.calls.filter(([, key]) => key === 'effects');
      expect(writes.map(([charId]) => charId).sort()).toEqual(['char-a', 'char-b']);
      // the written entry carries the effect id
      expect(writes[0][2][0]).toMatchObject({ effectId: 'shining-guidance' });
    });

    test('skips application on a critical success (target resists)', () => {
      withLimn();
      render(<RequestedSaves />);
      enterGoblinD20(20); // 25 vs DC 20, nat-20 → Critical Success (not in onDegrees)
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(sessionMock.sendUpdate.mock.calls.filter(([, key]) => key === 'effects')).toHaveLength(0);
    });

    test('a plain save request (no casterEffect) writes no effects', () => {
      render(<RequestedSaves />); // baseRequest, no casterEffect
      fireEvent.change(screen.getByLabelText(/Goblin d20/i), { target: { value: '10' } });
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));
      expect(sessionMock.sendUpdate.mock.calls.filter(([, key]) => key === 'effects')).toHaveLength(0);
    });
  });

  // ── monster IWR (#1014) ───────────────────────────────────────────────────

  describe('monster IWR', () => {
    const trollEntry = {
      entryId: 'e-troll', kind: 'enemy', name: 'Troll', creatureKey: 'troll-l5',
      defenses: {
        ac: 20, saves: { fortitude: 8, reflex: 8, will: 5 },
        immunities: [], resistances: [],
        weaknesses: [{ type: 'fire', value: 5 }],
      },
    };
    const fireRequest = {
      ...baseRequest,
      targets: [trollTarget],
      damage: { expression: '6d6', typeLabel: 'fire', entered: 10, riders: [] },
    };

    beforeEach(() => {
      useEncounter.mockReturnValue({
        encounter: { ...makeEncounter([fireRequest]), order: [trollEntry] },
        appendLog: mockAppendLog,
        removeSaveRequest: mockRemoveSaveReq,
      });
    });

    test('nets the target\'s weakness into the displayed damage', () => {
      render(<RequestedSaves />);
      // d20 8 + mod 8 = 16 vs DC 20 → failure → full 10, + weakness 5 = 15
      fireEvent.change(screen.getByLabelText(/Troll d20/i), { target: { value: '8' } });
      expect(screen.getByText('15 (10 +5 weakness (fire))')).toBeInTheDocument();
    });

    test('relays the RAW pre-IWR amount and stamps the reveal on resolve', () => {
      render(<RequestedSaves />);
      fireEvent.change(screen.getByLabelText(/Troll d20/i), { target: { value: '8' } });
      fireEvent.click(screen.getByRole('button', { name: /log results/i }));

      // Relay: raw 10, not the netted 15 — Foundry applies IWR itself.
      const relay = sessionMock.sendUpdate.mock.calls.find(([, key]) => key === 'dmgapply');
      expect(relay[2].hits).toEqual([
        { entryId: 'e-troll', name: 'Troll', amount: 10, type: 'fire' },
      ]);

      // Reveal: the fired weakness lands in the RK record under the creatureKey.
      const next = syncedMock.knowledgeSetter.mock.calls[0][0]({});
      expect(next['troll-l5'].weaknessesRevealed).toEqual({ fire: true });

      // First reveal announced in the encounter log.
      expect(mockAppendLog.mock.calls.map(([e]) => e.text))
        .toContain("Troll's weakness to fire is revealed!");
    });
  });
});
