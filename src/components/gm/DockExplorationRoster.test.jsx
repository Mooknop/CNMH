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
  // Trained in Medicine → Treat Wounds is offered to Pellias only.
  makeCharacter({
    id: 'Pellias', name: 'Pellias', speed: 25,
    skills: { medicine: { proficiency: 1 }, perception: { proficiency: 2 } },
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
});
