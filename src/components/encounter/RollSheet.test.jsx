// RollSheet (#1685, Roll Resolution redesign — workstream D): the two-phase
// shell. These tests drive the REAL RollEntry and DamageEntry rather than
// mocking them — both read their dice mode internally from TABLE_DICE_PREF +
// useFoundryDice() and expose no mode prop, so a mock would only prove the
// shell talks to a stub. Driving the real primitives over the session rail
// (the RollEntry.test.jsx / DamageEntry.test.jsx idiom) is what actually
// proves the Foundry one-tap contract: an ack fills the face AND commits, in
// one tap, exactly once.
import React, { useState } from 'react';
import { screen, fireEvent, act, within } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import RollSheet from './RollSheet';
import { setDevicePref } from '../../hooks/useDevicePref';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import { RELAY } from '../../sync/keys';

const RAIL_STATE = { global: { [RELAY.BRIDGEHELLO]: { protocol: 3 } } };

// A frozen attack commit: two enemies, one hit and one miss.
const ATTACK_ROWS = [
  { entryId: 'e1', name: 'Ghoul', dcLabel: 'AC 24', degree: 'success' },
  { entryId: 'e2', name: 'Zombie Brute', dcLabel: 'AC 20', degree: 'failure' },
];

const SAVE_ROWS = [
  { entryId: 'e1', name: 'Ghoul', dcLabel: 'Reflex DC 27', degree: 'criticalFailure' },
  { entryId: 'e2', name: 'Zombie Brute', dcLabel: 'Reflex DC 27', degree: 'success' },
];

const DAMAGE_PARTS = [{ key: 'base', dice: '2d8+9', type: 'slashing', formula: '2d8+9' }];

const attackProps = (over = {}) => ({
  title: 'Strike: Longsword',
  summaryLine: 'Ghoul + Zombie Brute · 1 action · attack +18 · MAP -5',
  commitLabel: 'Resolve strike (1 action)',
  bonus: 18,
  bonusLabel: 'attack',
  dcLine: 'nothing rolled yet · Ghoul AC 24',
  charId: 'Amiri',
  flavor: 'Strike: Longsword',
  attack: true,
  damageParts: DAMAGE_PARTS,
  amountHeading: 'Damage · un-doubled',
  finishLabel: 'Apply damage',
  costLabel: '1 action',
  ...over,
});

const pad = () => screen.getByRole('group', { name: 'raw d20' });
const tapFace = (n) => fireEvent.click(within(pad()).getByRole('button', { name: String(n) }));
// Scope button lookups to the sheet body: Modal's own chrome close button is
// also named "Close", and the settled screen's Close pill must not match it.
const sheet = () => document.querySelector('.rs');
const pill = (name) => within(sheet()).getByRole('button', { name });
const noPill = (name) => within(sheet()).queryByRole('button', { name });
const sentReq = (session) => session.sent.find((s) => s.stateType === RELAY.ROLLREQ);

afterEach(() => setDevicePref(TABLE_DICE_PREF, false));

describe('RollSheet', () => {
  describe('phase 1 → commit → result → amount → done (attack)', () => {
    beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

    it('runs the whole arc, firing commit and finish exactly once each', () => {
      const onCommit = vi.fn(() => ATTACK_ROWS);
      const onFinish = vi.fn();
      renderWithProviders(
        <RollSheet {...attackProps()} onCommit={onCommit} onFinish={onFinish} />,
        { session: { state: RAIL_STATE } },
      );

      // Phase 1: context is visible, no degree is.
      expect(screen.getByText(/Ghoul \+ Zombie Brute · 1 action · attack \+18 · MAP -5/)).toBeInTheDocument();
      expect(screen.getByText('No degrees until you commit.')).toBeInTheDocument();
      expect(screen.queryByText('Hit')).toBeNull();
      expect(screen.queryByText('Miss')).toBeNull();

      // The commit pill is dead until a face exists.
      const commit = pill('Resolve strike (1 action)');
      expect(commit).toBeDisabled();
      tapFace(13);
      expect(commit).toBeEnabled();

      // Two taps of the commit button must still be one commit.
      fireEvent.click(commit);
      fireEvent.click(commit);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(13);

      // Result: frozen headline + one row per target with the attack labels.
      expect(screen.getByText('13')).toBeInTheDocument();
      expect(screen.getByText('+18 = 31')).toBeInTheDocument();
      expect(screen.getByText('Hit')).toBeInTheDocument();
      expect(screen.getByText('Miss')).toBeInTheDocument();
      expect(screen.getByText('AC 24')).toBeInTheDocument();
      expect(screen.getByText('1 hit — damage next.')).toBeInTheDocument();

      // Amount: recap chip for the hit only, then the damage row.
      fireEvent.click(pill('Roll damage'));
      expect(screen.getByText('Ghoul · Hit')).toBeInTheDocument();
      expect(screen.queryByText(/Zombie Brute ·/)).toBeNull();
      expect(screen.getByText('Damage · un-doubled')).toBeInTheDocument();
      fireEvent.change(screen.getByLabelText('rolled damage total'), { target: { value: '21' } });

      const finish = pill('Apply damage');
      fireEvent.click(finish);
      fireEvent.click(finish);
      expect(onFinish).toHaveBeenCalledTimes(1);
      expect(onFinish).toHaveBeenCalledWith({ base: '21' });

      // Settled: a receipt and Close only — no Undo in v1.
      expect(screen.getByText('Resolved ✓')).toBeInTheDocument();
      expect(screen.getByText('1 action')).toBeInTheDocument();
      expect(screen.getByText('d20 13 +18 = 31')).toBeInTheDocument();
      expect(screen.getByText('Ghoul — Hit')).toBeInTheDocument();
      expect(noPill(/undo/i)).toBeNull();
      expect(pill('Close')).toBeInTheDocument();
    });

    it('never recomputes the frozen result from later props', () => {
      // A host that mutates every input the result card could be derived from,
      // AFTER the commit. The card must not move — that is friction F2's fix.
      function Host() {
        const [bonus, setBonus] = useState(18);
        const [rows, setRows] = useState(ATTACK_ROWS);
        return (
          <>
            <button type="button" onClick={() => { setBonus(2); setRows([]); }}>churn</button>
            <RollSheet
              {...attackProps({ bonus })}
              onCommit={() => rows}
              onFinish={() => {}}
            />
          </>
        );
      }
      renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

      tapFace(13);
      fireEvent.click(pill('Resolve strike (1 action)'));
      expect(screen.getByText('+18 = 31')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'churn' }));

      expect(screen.getByText('+18 = 31')).toBeInTheDocument();
      expect(screen.getByText('Hit')).toBeInTheDocument();
      expect(screen.getByText('Miss')).toBeInTheDocument();
    });

    it('a 0-hit result offers Close and skips the amount phase', () => {
      const onFinish = vi.fn();
      renderWithProviders(
        <RollSheet
          {...attackProps()}
          onCommit={() => [{ entryId: 'e2', name: 'Zombie Brute', dcLabel: 'AC 20', degree: 'failure' }]}
          onFinish={onFinish}
        />,
        { session: { state: RAIL_STATE } },
      );

      tapFace(4);
      fireEvent.click(pill('Resolve strike (1 action)'));
      expect(screen.getByText('No hits. Nothing to roll.')).toBeInTheDocument();
      expect(noPill('Roll damage')).toBeNull();

      fireEvent.click(pill('Close'));
      expect(screen.getByText('Resolved ✓')).toBeInTheDocument();
      expect(screen.queryByLabelText('rolled damage total')).toBeNull();
      expect(onFinish).not.toHaveBeenCalled();
    });

    it('a config with no damage parts skips the amount phase even on a hit', () => {
      renderWithProviders(
        <RollSheet
          {...attackProps({ damageParts: null })}
          onCommit={() => ATTACK_ROWS}
          onFinish={() => {}}
        />,
        { session: { state: RAIL_STATE } },
      );

      tapFace(19);
      fireEvent.click(pill('Resolve strike (1 action)'));
      expect(screen.getByText('Hit')).toBeInTheDocument();
      expect(noPill('Roll damage')).toBeNull();

      fireEvent.click(pill('Close'));
      expect(screen.getByText('Resolved ✓')).toBeInTheDocument();
    });

    it('a hard block tints the summary strip and disables the commit pill', () => {
      const onCommit = vi.fn();
      renderWithProviders(
        <RollSheet
          {...attackProps({ blockLine: 'Ghoul is out of range (85 ft, max 80 ft).' })}
          onCommit={onCommit}
          onFinish={() => {}}
        />,
        { session: { state: RAIL_STATE } },
      );

      expect(screen.getByText('Ghoul is out of range (85 ft, max 80 ft).')).toHaveClass('rs-block');
      // A blocked sheet freezes the die entry too, so no face can arrive.
      within(pad()).getAllByRole('button').forEach((b) => expect(b).toBeDisabled());
      const commit = pill('Resolve strike (1 action)');
      expect(commit).toBeDisabled();
      fireEvent.click(commit);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it('the edit disclosure mounts the caller slot and toggles Edit/Done', () => {
      renderWithProviders(
        <RollSheet
          {...attackProps({
            editPanel: <div>caller targets + MAP</div>,
            editStatusLine: 'Gates, casting cost and flat checks — all clear',
          })}
          onCommit={() => ATTACK_ROWS}
          onFinish={() => {}}
        />,
        { session: { state: RAIL_STATE } },
      );

      expect(screen.queryByText('caller targets + MAP')).toBeNull();
      fireEvent.click(pill('Edit'));
      expect(screen.getByText('caller targets + MAP')).toBeInTheDocument();
      expect(screen.getByText('Gates, casting cost and flat checks — all clear')).toBeInTheDocument();
      fireEvent.click(pill('Done'));
      expect(screen.queryByText('caller targets + MAP')).toBeNull();
    });

    it('a no-d20 ability commits with a null face and no die entry', () => {
      const onCommit = vi.fn(() => null);
      renderWithProviders(
        <RollSheet
          {...attackProps({ hasD20: false, damageParts: null, commitLabel: 'Cast Bless (2 actions)' })}
          onCommit={onCommit}
          onFinish={() => {}}
        />,
        { session: { state: RAIL_STATE } },
      );

      expect(screen.queryByRole('group', { name: 'raw d20' })).toBeNull();
      const commit = pill('Cast Bless (2 actions)');
      expect(commit).toBeEnabled();
      fireEvent.click(commit);
      expect(onCommit).toHaveBeenCalledWith(null);
      expect(pill('Close')).toBeInTheDocument();
    });
  });

  describe('save mode', () => {
    beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

    it('commits into waiting, then renders the GM degrees in the same card', () => {
      const onCommit = vi.fn(() => null);
      function Host() {
        const [resolved, setResolved] = useState(null);
        return (
          <>
            <button type="button" onClick={() => setResolved(SAVE_ROWS)}>gm resolves</button>
            <RollSheet
              title="Cast: Electric Arc"
              summaryLine="Ghoul + Zombie Brute · 2 actions · Reflex DC 27"
              commitLabel="Cast Electric Arc (2 actions)"
              bonus={null}
              charId="Ezren"
              saveMode
              headlineMath="Reflex DC 27"
              damageParts={DAMAGE_PARTS}
              amountDegrees={null}
              onCommit={onCommit}
              onFinish={() => {}}
              resolvedResults={resolved}
            />
          </>
        );
      }
      renderWithProviders(<Host />, { session: { state: RAIL_STATE } });

      expect(screen.getByText(
        'The targets roll their saves — you commit first, the result comes back here.'
      )).toBeInTheDocument();

      tapFace(11);
      fireEvent.click(pill('Cast Electric Arc (2 actions)'));

      // Waiting: the pending ring, no degrees yet.
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(screen.getByText('GM')).toBeInTheDocument();
      expect(screen.getByText('Waiting on the GM to roll saves…')).toBeInTheDocument();
      expect(screen.queryByText('Critical Failure')).toBeNull();

      fireEvent.click(screen.getByRole('button', { name: 'gm resolves' }));

      // Result: save-flavored labels, the DC in place of the math, and every
      // target needs an amount (amountDegrees null — the basic-save ladder).
      // Once in the headline, once per row.
      expect(screen.getAllByText('Reflex DC 27')).toHaveLength(3);
      expect(screen.getByText('Critical Failure')).toBeInTheDocument();
      expect(screen.getByText('Success')).toBeInTheDocument();
      expect(screen.getByText('Degrees in from the GM.')).toBeInTheDocument();
      fireEvent.click(pill('Roll damage'));
      expect(screen.getByText('Ghoul · Critical Failure')).toBeInTheDocument();
      expect(screen.getByText('Zombie Brute · Success')).toBeInTheDocument();
    });
  });

  describe('async commit', () => {
    beforeEach(() => setDevicePref(TABLE_DICE_PREF, true));

    it('parks in the rolling screen until the promise settles', async () => {
      let release;
      const onCommit = vi.fn(() => new Promise((res) => { release = res; }));
      renderWithProviders(
        <RollSheet {...attackProps()} onCommit={onCommit} onFinish={() => {}} />,
        { session: { state: RAIL_STATE } },
      );

      tapFace(13);
      fireEvent.click(pill('Resolve strike (1 action)'));

      expect(screen.getByText('1d20')).toBeInTheDocument();
      expect(screen.getByText('Rolling in Foundry…')).toBeInTheDocument();
      expect(screen.queryByText('Hit')).toBeNull();

      await act(async () => { release(ATTACK_ROWS); });

      expect(screen.getByText('Hit')).toBeInTheDocument();
      expect(screen.getByText('+18 = 31')).toBeInTheDocument();
    });
  });

  describe('Foundry one-tap', () => {
    it('hides the commit pill and commits straight off the ack', async () => {
      const onCommit = vi.fn(() => ATTACK_ROWS);
      const { session } = renderWithProviders(
        <RollSheet {...attackProps()} onCommit={onCommit} onFinish={() => {}} />,
        { session: { state: RAIL_STATE } },
      );

      // Rolling IS committing here — the physical die is already cast.
      expect(noPill('Resolve strike (1 action)')).toBeNull();
      const foundry = pill(/roll d20 in foundry/i);

      await act(async () => { fireEvent.click(foundry); });
      const req = sentReq(session);
      await act(async () => {
        session.push('global', RELAY.ROLLDONE, {
          id: req.value.id, charId: 'Amiri', ok: true, total: 31, faces: [[20, 13]], ts: Date.now(),
        });
      });

      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(13);
      expect(screen.getByText('Hit')).toBeInTheDocument();
      expect(screen.getByText('+18 = 31')).toBeInTheDocument();
    });

    it('a nack falls back to the pad and the commit pill returns with the face', async () => {
      const onCommit = vi.fn(() => ATTACK_ROWS);
      const { session } = renderWithProviders(
        <RollSheet {...attackProps()} onCommit={onCommit} onFinish={() => {}} />,
        { session: { state: RAIL_STATE } },
      );

      await act(async () => {
        fireEvent.click(pill(/roll d20 in foundry/i));
      });
      const req = sentReq(session);
      await act(async () => {
        session.push('global', RELAY.ROLLDONE, {
          id: req.value.id, charId: null, ok: false, total: null, faces: [], ts: Date.now(),
        });
      });

      // RollEntry's gold notice + pad; the pill is still suppressed until a
      // face proves the pad is what is on screen.
      expect(screen.getByText(/foundry isn.t answering/i)).toBeInTheDocument();
      expect(onCommit).not.toHaveBeenCalled();
      expect(noPill('Resolve strike (1 action)')).toBeNull();

      tapFace(16);
      const commit = pill('Resolve strike (1 action)');
      expect(commit).toBeEnabled();
      fireEvent.click(commit);
      expect(onCommit).toHaveBeenCalledTimes(1);
      expect(onCommit).toHaveBeenCalledWith(16);
    });
  });
});
