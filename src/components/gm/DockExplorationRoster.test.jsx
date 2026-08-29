import React from 'react';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { relayFixtures, pushRelayFixture } from '../../test/relayFixtures';
import { RELAY } from '../../sync/keys';
import { PARTY_MAP_PROTOCOL } from '../../utils/snapshotRelay';
import DockExplorationRoster from './DockExplorationRoster';
import DockExplorationPane from './DockExplorationPane';
import ExplorationTab from '../actions/ExplorationTab';

// Roster strip + GM activity control + the dock-side effect driver (#1810,
// epic #1804 S6). Everything runs against the REAL provider stack, so the
// synced writes below are the actual wire messages the DO would fan out.

const CHARACTERS = [
  // Trained in Medicine → Treat Wounds is offered to Pellias only. Also
  // trained Stealth/Perception (#1812 roll-math tests): level 1, all
  // abilities at the 10/+0 default, so Trained (rank 1) = +3 and Expert
  // (rank 2) = +5 — getSkillModifier's exact numbers, not a stand-in.
  makeCharacter({
    id: 'Pellias', name: 'Pellias', speed: 25,
    skills: {
      medicine: { proficiency: 1 },
      perception: { proficiency: 2 },
      stealth: { proficiency: 1 },
    },
  }),
  makeCharacter({ id: 'Ashka', name: 'Ashka', speed: 30, skills: {} }),
];

const seededState = (extra = {}) => ({
  global: {
    [RELAY.BRIDGEHELLO]: { protocol: PARTY_MAP_PROTOCOL, module: '0.0.0-test' },
    [RELAY.EXPLOREMOVE]: true,
    [RELAY.PLAYMODE]: 'exploration',
    ...extra,
  },
});

const mount = (node, sessionOpts = {}) => renderWithProviders(node, {
  content: { character: CHARACTERS },
  session: { state: seededState(), ...sessionOpts },
});

const mountStrip = (sessionOpts) => mount(<DockExplorationRoster />, sessionOpts);

const chip = (charId) => screen.getByTestId(`dock-exp-chip-${charId}`);

// Open a PC's act-as picker and choose an activity by name.
const pickFor = (charId, activityName) => {
  fireEvent.click(within(chip(charId)).getByRole('button', { name: /^Set activity for/ }));
  act(() => {
    fireEvent.click(within(chip(charId)).getByRole('button', { name: new RegExp(`^${activityName}`) }));
  });
};

const lastSent = (session, stateType, characterId) =>
  [...session.sent].reverse().find(
    (s) => s.stateType === stateType && (characterId === undefined || s.characterId === characterId)
  ) || null;

const explorationEntries = (session, charId) =>
  (lastSent(session, 'effects', charId)?.value || []).filter((e) => e.source === 'exploration');

beforeEach(() => window.localStorage.clear());

describe('DockExplorationRoster (#1810)', () => {
  it('renders a chip per PC with their pick, pace and derived Speed', () => {
    mountStrip({
      state: {
        ...seededState(),
        Pellias: { exploration: 'Defend' },
      },
    });

    const pellias = chip('Pellias');
    expect(within(pellias).getByText('Defend')).toBeInTheDocument();
    expect(within(pellias).getByText('½ Speed')).toBeInTheDocument();
    expect(within(pellias).getByText('25 ft')).toBeInTheDocument();

    // No pick yet reads as such, and carries no pace chip.
    const ashka = chip('Ashka');
    expect(within(ashka).getByText('No activity')).toBeInTheDocument();
    expect(within(ashka).getByText('30 ft')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('1 / 2 picked');
  });

  it('sets a PC\'s activity on the same key the player writes (act-as)', () => {
    const { session } = mountStrip();

    pickFor('Ashka', 'Hustle');

    expect(lastSent(session, 'exploration', 'Ashka')).toMatchObject({
      characterId: 'Ashka', stateType: 'exploration', value: 'Hustle',
    });
    expect(within(chip('Ashka')).getByText('×2 Speed')).toBeInTheDocument();
  });

  it('re-picking the active activity clears it', () => {
    const { session } = mountStrip({
      state: { ...seededState(), Ashka: { exploration: 'Hustle' } },
    });

    pickFor('Ashka', 'Hustle');

    expect(lastSent(session, 'exploration', 'Ashka').value).toBeNull();
  });

  it('applies the same per-character gating the player\'s picker does', () => {
    mountStrip();

    // Treat Wounds requires Trained in Medicine.
    fireEvent.click(within(chip('Pellias')).getByRole('button', { name: /^Set activity for/ }));
    expect(within(chip('Pellias')).getByRole('button', { name: /^Treat Wounds/ })).toBeInTheDocument();

    fireEvent.click(within(chip('Ashka')).getByRole('button', { name: /^Set activity for/ }));
    expect(within(chip('Ashka')).queryByRole('button', { name: /^Treat Wounds/ })).toBeNull();
  });

  // ── the dock-side effect driver ───────────────────────────────────────────

  it('applies the activity self-buff from the dock alone, and clears it', () => {
    const { session } = mountStrip();

    pickFor('Pellias', 'Defend');
    expect(explorationEntries(session, 'Pellias')).toEqual([
      expect.objectContaining({ effectId: 'defend', source: 'exploration' }),
    ]);

    pickFor('Pellias', 'Defend'); // toggle off
    expect(explorationEntries(session, 'Pellias')).toEqual([]);
  });

  it('swaps the buff when the pick changes, never stacking two', () => {
    const { session } = mountStrip();

    pickFor('Pellias', 'Defend');
    pickFor('Pellias', 'Hustle'); // no mechanics.effect
    expect(explorationEntries(session, 'Pellias')).toEqual([]);
  });

  it('drives no buff outside exploration mode', () => {
    const { session } = mountStrip({
      state: seededState({ [RELAY.PLAYMODE]: 'downtime' }),
    });

    pickFor('Pellias', 'Defend');
    expect(lastSent(session, 'effects', 'Pellias')).toBeNull();
  });

  // The trap the epic flagged: the GM's dock and the player's own
  // ExplorationTab are mounted at once, both reconciling cnmh_effects_<id>.
  // useExplorationEffect is a reconciler — it filters out EVERY prior
  // source:'exploration' entry before appending one, and bails outright once
  // the stored entry already carries the desired id — so the two writers
  // converge on a single entry instead of stacking or oscillating.
  it('converges on ONE buff entry with a player tab mounted on the same PC', () => {
    const { session } = mount(
      <>
        <DockExplorationRoster />
        <ExplorationTab character={CHARACTERS[0]} characterColor="#888888" />
      </>
    );

    pickFor('Pellias', 'Defend');

    const entries = explorationEntries(session, 'Pellias');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ effectId: 'defend', source: 'exploration' });

    // And the settled state is quiet: a remote peer echoing an equivalent
    // entry (a different uid, same effectId — what the player's client would
    // have written first cross-device) provokes no further write.
    const before = session.sent.filter((s) => s.stateType === 'effects').length;
    act(() => {
      session.push('Pellias', 'effects', [
        { id: 'peer-uid', effectId: 'defend', source: 'exploration', ts: 1 },
      ]);
    });
    expect(session.sent.filter((s) => s.stateType === 'effects')).toHaveLength(before);
  });

  // ── Scout parity ──────────────────────────────────────────────────────────

  it('maintains the party-wide scout bonus key from dock picks', () => {
    const { session } = mountStrip();

    pickFor('Ashka', 'Scout');
    expect(lastSent(session, 'scoutbonus')).toMatchObject({
      characterId: 'global', value: 'Ashka',
    });

    pickFor('Ashka', 'Scout'); // cleared
    expect(lastSent(session, 'scoutbonus').value).toBeNull();
  });

  it('repairs a scoutbonus a non-Scout player tab blanked, without looping', () => {
    const { session } = mountStrip({
      state: { ...seededState({ scoutbonus: 'Ashka' }), Ashka: { exploration: 'Scout' } },
    });

    // Steady state: the stored value already matches, so nothing is written.
    expect(lastSent(session, 'scoutbonus')).toBeNull();

    // A player's own tab clears the key on mount (it isn't the Scout).
    act(() => { session.push('global', 'scoutbonus', null); });

    expect(lastSent(session, 'scoutbonus')).toMatchObject({ value: 'Ashka' });
    // One repair, not a write storm.
    expect(session.sent.filter((s) => s.stateType === 'scoutbonus')).toHaveLength(1);
  });

  // ── party-state controls ──────────────────────────────────────────────────

  it('"New beat" nulls every PC\'s pick and drops the readiness override', () => {
    const { session } = mountStrip({
      state: {
        ...seededState({ exploreoverride: true }),
        Pellias: { exploration: 'Defend' },
        Ashka: { exploration: 'Scout' },
      },
    });

    act(() => { fireEvent.click(screen.getByRole('button', { name: 'New beat' })); });

    expect(lastSent(session, 'exploration', 'Pellias').value).toBeNull();
    expect(lastSent(session, 'exploration', 'Ashka').value).toBeNull();
    expect(lastSent(session, 'exploreoverride')).toMatchObject({
      characterId: 'global', value: false,
    });
    expect(within(chip('Pellias')).getByText('No activity')).toBeInTheDocument();
    // The buffs the dock was driving come off with the picks.
    expect(explorationEntries(session, 'Pellias')).toEqual([]);
  });

  // ── time control (#1811) ──────────────────────────────────────────────────
  // ExplorationTimeControl is self-contained (see ExplorationTimeControl.test)
  // — these two just cover the dock-specific wiring: it mounts in the roster
  // footer, and the closed loop (dock accrues exploredist → control reads it
  // against the roster → Apply advances the REAL clock through GameDateContext
  // and zeroes the tally) works from inside this provider tree.
  it('mounts the exploration time control in the roster footer', () => {
    mountStrip();

    expect(screen.getByText('+10 min')).toBeInTheDocument();
    expect(screen.getByText('+30 min')).toBeInTheDocument();
    expect(screen.getByText('+1 hr')).toBeInTheDocument();
  });

  it('Apply on the distance suggestion advances the clock and zeroes the tally', () => {
    // 300 ft at the roster's slowest Speed (25) → ~10 min, per the same math
    // ExplorationTimeControl.test.jsx verifies in isolation.
    const { session } = mountStrip({
      state: seededState({
        [RELAY.ROSTER]: [{ actorId: 'Pellias', name: 'Pellias', speed: 25 }],
        exploredist: 300,
      }),
    });

    expect(screen.getByText(/Party moved 300 ft/i)).toBeInTheDocument();
    const applyBtns = screen.getAllByText('Apply');
    fireEvent.click(applyBtns[applyBtns.length - 1]);

    expect(lastSent(session, 'clock')).toMatchObject({ characterId: 'global' });
    expect(lastSent(session, 'exploredist')).toMatchObject({ characterId: 'global', value: 0 });
  });

  it('toggles the readiness override', () => {
    const { session } = mountStrip();
    const toggle = screen.getByRole('button', { name: 'Start movement' });

    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);

    expect(lastSent(session, 'exploreoverride')).toMatchObject({
      characterId: 'global', value: true,
    });
    expect(screen.getByRole('button', { name: 'Start movement' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});

describe('DockExplorationRoster ↔ pane selection (#1810)', () => {
  const PARTY = relayFixtures.snapdoneParty.value;

  it('tapping a chip selects that PC as mover, exactly like tapping their token', () => {
    const { session, container } = mount(<DockExplorationPane />);
    const req = [...session.sent].reverse().find((s) => s.stateType === RELAY.SNAPREQ);
    act(() => { pushRelayFixture(session, 'snapdoneParty', { id: req?.value?.id }); });

    const moverId = PARTY.tokens[0].moverId;
    act(() => {
      fireEvent.click(within(chip(moverId)).getByRole('button', { name: `Select ${moverId} to move` }));
    });

    expect(lastSent(session, RELAY.MOVEREQ)).toMatchObject({ characterId: moverId });
    expect(container.querySelector('.pto-marker--selected')?.dataset.moverId).toBe(moverId);
    expect(within(chip(moverId)).getByRole('button', { name: `Select ${moverId} to move` }))
      .toHaveAttribute('aria-pressed', 'true');
  });

  // Selection set (#1824, epic #1822 A2): a second chip tap ADDS rather than
  // replaces, and toggling the same chip again removes it.
  it('tapping a second chip adds them without deselecting the first', () => {
    const { session, container } = mount(<DockExplorationPane />);
    const req = [...session.sent].reverse().find((s) => s.stateType === RELAY.SNAPREQ);
    act(() => { pushRelayFixture(session, 'snapdoneParty', { id: req?.value?.id }); });

    act(() => {
      fireEvent.click(within(chip('Pellias')).getByRole('button', { name: 'Select Pellias to move' }));
    });
    act(() => {
      fireEvent.click(within(chip('Ashka')).getByRole('button', { name: 'Select Ashka to move' }));
    });

    expect(within(chip('Pellias')).getByRole('button', { name: 'Select Pellias to move' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(within(chip('Ashka')).getByRole('button', { name: 'Select Ashka to move' }))
      .toHaveAttribute('aria-pressed', 'true');
    expect([...container.querySelectorAll('.pto-marker--selected')]).toHaveLength(2);

    // Tapping Pellias again removes just them.
    act(() => {
      fireEvent.click(within(chip('Pellias')).getByRole('button', { name: 'Select Pellias to move' }));
    });
    expect(within(chip('Pellias')).getByRole('button', { name: 'Select Pellias to move' }))
      .toHaveAttribute('aria-pressed', 'false');
    expect(within(chip('Ashka')).getByRole('button', { name: 'Select Ashka to move' }))
      .toHaveAttribute('aria-pressed', 'true');
  });
});

// ─── Select all / Clear (#1824, epic #1822 A2) ──────────────────────────────
describe('DockExplorationRoster select all / clear (#1824)', () => {
  it('calls back to the parent instead of owning selection itself', () => {
    const onSelectAll = vi.fn();
    const onClear = vi.fn();
    mount(<DockExplorationRoster selectedIds={new Set(['Pellias'])} onSelectAll={onSelectAll} onClear={onClear} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select all' }));
    expect(onSelectAll).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('disables Clear and hides the count when nothing is selected', () => {
    mount(<DockExplorationRoster selectedIds={new Set()} />);
    expect(screen.getByRole('button', { name: 'Clear' })).toBeDisabled();
    expect(screen.queryByText(/selected/)).toBeNull();
  });

  it('shows the selection count and renders every selected chip as selected, not just one', () => {
    mount(<DockExplorationRoster selectedIds={new Set(['Pellias', 'Ashka'])} />);
    expect(screen.getByText('2 selected')).toBeInTheDocument();
    expect(within(chip('Pellias')).getByRole('button', { name: /^Select/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(chip('Ashka')).getByRole('button', { name: /^Select/ })).toHaveAttribute('aria-pressed', 'true');
  });
});

// ─── dock-side secret checks (#1812, epic #1804 S8) ─────────────────────────
describe('DockExplorationRoster secret checks (#1812)', () => {
  const rollRow = (charId) => screen.getByTestId(`dock-exp-roll-${charId}`);
  const result = (charId) => screen.queryByTestId(`dock-exp-result-${charId}`);
  const rollBtn = (charId) => within(rollRow(charId)).getByRole('button', { name: new RegExp(`^Roll .* for `) });
  const setDc = (charId, value) => fireEvent.change(
    within(rollRow(charId)).getByLabelText(`Secret DC for ${charId}`),
    { target: { value } }
  );

  // A d20 roll is `Math.floor(rng() * 20) + 1` (utils/explorationUtils.js
  // rollD20, default rng = Math.random) — the midpoint of face's own [0,1)
  // bucket lands on `face` for every face 1-20, so this is exact, not a
  // stand-in. Spying on Math.random (not mocking the module) keeps the real
  // rollD20/explorationDegreeOfSuccess code under test.
  const mockFace = (face) => vi.spyOn(Math, 'random').mockReturnValue((face - 0.5) / 20);

  afterEach(() => { vi.restoreAllMocks(); });

  it('shows a roll affordance only for the picked activity\'s roll config, with the real skill modifier', () => {
    mountStrip();

    // Hustle has no mechanics.roll — no row at all.
    pickFor('Ashka', 'Hustle');
    expect(screen.queryByTestId('dock-exp-roll-Ashka')).toBeNull();

    // Avoid Notice rolls Stealth; Pellias is Trained (rank 1) → +3.
    pickFor('Pellias', 'Avoid Notice');
    expect(within(rollRow('Pellias')).getByText('Stealth +3')).toBeInTheDocument();
  });

  it('rolls locally and puts nothing about the roll on the relay', () => {
    const { session } = mountStrip();
    pickFor('Pellias', 'Search'); // perception, secret:true, no onSuccessEffect

    const before = session.sent.length;
    mockFace(15);
    act(() => { fireEvent.click(rollBtn('Pellias')); });

    // A result renders locally...
    expect(result('Pellias')).toBeInTheDocument();
    // ...but not one single message went out for it (Search has no
    // onSuccessEffect, so this isolates the roll itself, not just the DC).
    expect(session.sent.length).toBe(before);
  });

  it('shows the raw total with no degree when no DC is set', () => {
    mountStrip();
    pickFor('Pellias', 'Search'); // Perception, Expert (rank 2) → +5

    mockFace(11);
    act(() => { fireEvent.click(rollBtn('Pellias')); });

    // 11 + 5 = 16, no DC entered.
    expect(within(result('Pellias')).getByText('d20 11 +5 = 16')).toBeInTheDocument();
    expect(within(result('Pellias')).queryByText(/Success|Failure/)).toBeNull();
  });

  it('shows degree of success once a DC is entered', () => {
    mountStrip();
    pickFor('Pellias', 'Search'); // +5

    setDc('Pellias', '15');
    mockFace(11); // 11 + 5 = 16 ≥ 15 → success, < 25 → not critical
    act(() => { fireEvent.click(rollBtn('Pellias')); });

    expect(within(result('Pellias')).getByText('Success')).toBeInTheDocument();
  });

  it('applies onSuccessEffect exactly like the player-side flow on success', () => {
    const { session } = mountStrip();
    pickFor('Pellias', 'Avoid Notice'); // Stealth +3

    setDc('Pellias', '10');
    mockFace(15); // 15 + 3 = 18 ≥ 10 → success
    act(() => { fireEvent.click(rollBtn('Pellias')); });

    expect(explorationEntries(session, 'Pellias')).toEqual([
      expect.objectContaining({ effectId: 'avoid-notice-hidden', source: 'exploration' }),
    ]);
    expect(within(result('Pellias')).getByText('Avoiding Notice applied')).toBeInTheDocument();
  });

  it('does not apply onSuccessEffect on a failure', () => {
    const { session } = mountStrip();
    pickFor('Pellias', 'Avoid Notice'); // Stealth +3

    setDc('Pellias', '25');
    mockFace(2); // 2 + 3 = 5 < 25 → failure
    act(() => { fireEvent.click(rollBtn('Pellias')); });

    expect(explorationEntries(session, 'Pellias')).toEqual([]);
    expect(within(result('Pellias')).getByText('Avoiding Notice — success required')).toBeInTheDocument();
  });

  it('clears a stale roll result when the activity pick changes', () => {
    mountStrip();
    pickFor('Pellias', 'Search');
    mockFace(11);
    act(() => { fireEvent.click(rollBtn('Pellias')); });
    expect(result('Pellias')).toBeInTheDocument();

    pickFor('Pellias', 'Avoid Notice');
    expect(screen.queryByTestId('dock-exp-result-Pellias')).toBeNull();
  });

  it('"Roll all" rolls exactly the roll-bearing picks, skipping non-roll and unpicked PCs', () => {
    mountStrip();
    pickFor('Pellias', 'Avoid Notice'); // roll-bearing
    pickFor('Ashka', 'Hustle'); // no mechanics.roll

    expect(screen.getByRole('button', { name: 'Roll all (1)' })).toBeInTheDocument();
    mockFace(10);
    act(() => { fireEvent.click(screen.getByRole('button', { name: 'Roll all (1)' })); });

    expect(result('Pellias')).toBeInTheDocument();
    expect(screen.queryByTestId('dock-exp-roll-Ashka')).toBeNull();
  });

  it('auto-picks the character\'s best trained skill for a skill-pick activity', () => {
    // Investigate offers arcana/nature/occultism/religion/society/crafting —
    // no requiresTrainedInAny gate on the activity itself, so it's pickable
    // even though this PC is only trained in one of its skills. Re-seeded
    // (not the shared CHARACTERS fixture) since Ashka there is untrained
    // everywhere, which is exactly what the next test needs instead.
    renderWithProviders(<DockExplorationRoster />, {
      content: {
        character: [
          makeCharacter({ id: 'Ashka', name: 'Ashka', speed: 30, skills: { religion: { proficiency: 1 } } }),
        ],
      },
      session: { state: seededState() },
    });

    pickFor('Ashka', 'Investigate');
    expect(within(rollRow('Ashka')).getByText('Religion +3')).toBeInTheDocument();
  });

  it('disables the roll button when nothing is trained for a skill-pick activity', () => {
    mountStrip();
    pickFor('Ashka', 'Investigate'); // Ashka: skills: {} — nothing trained

    expect(within(rollRow('Ashka')).getByText('no trained skill')).toBeInTheDocument();
    expect(rollBtn('Ashka')).toBeDisabled();
  });
});
