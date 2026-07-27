import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Modal from '../shared/Modal';
import RollEntry from '../shared/RollEntry';
import DamageEntry from '../shared/DamageEntry';
import { degreeLabel } from '../../utils/degreeDisplay';
import { useDevicePref } from '../../hooks/useDevicePref';
import { useFoundryDice } from '../../hooks/useFoundryDice';
import { TABLE_DICE_PREF } from '../../utils/tableDice';
import './RollSheet.css';

// Degrees that mean "this target takes an amount" for an attack roll. The
// caller can widen or replace the set (`amountDegrees`) — Treat Wounds heals
// on a critical failure too, and a basic save applies damage on every degree.
export const HIT_DEGREES = ['success', 'criticalSuccess'];

// Degree → the existing token family suffix (--d-crit-* / --d-succ-* /
// --d-fail-* / --d-cf-*). No new colors; see pf2e-tokens.css.
const DEGREE_TONE = {
  criticalSuccess: 'crit',
  success: 'succ',
  failure: 'fail',
  criticalFailure: 'cf',
};

const toneClass = (degree) => (DEGREE_TONE[degree] ? ` rs-tone--${DEGREE_TONE[degree]}` : '');

const signed = (n) => (n >= 0 ? `+${n}` : `${n}`);

/**
 * RollSheet — the two-phase roll-resolution shell (#1685, Roll Resolution
 * redesign workstream D). One bottom sheet replaces the five roll dialects:
 * it opens on the roll, commits ONCE, then reveals.
 *
 *   PHASE 1  summary strip → edit disclosure → die entry → single commit
 *      ↓  commit  (the caller's whole handleConfirm sequence fires here)
 *   PHASE 2  result card (degrees) → amount step → settled receipt
 *
 * This component is pure presentation + phase orchestration. It performs NO
 * game math: degrees, DCs, bonuses and damage all arrive as props or as the
 * rows `onCommit` hands back. The caller keeps every domain hook it already
 * owns (useTargeting, useAbilityCastPlan, the use*Gate / use*Section hooks)
 * and mounts their render pieces through the `editPanel` slot.
 *
 * ## The frozen-results rule (the fix for friction F2)
 *
 * `onCommit(face)` returns the result rows, and they are stored ONCE in
 * `committed` alongside the face and the headline math. Nothing on the result,
 * amount or settled screens is ever recomputed from live props — change
 * `bonus`, `results`, target selection or anything else after the commit and
 * the card does not move. Before the commit no degree exists on screen at all.
 *
 * ## Phase machine
 *
 *   roll   --commit (sync rows)-->  result        (or `waiting` when saveMode)
 *   roll   --commit (Promise)  -->  rolling --> result / waiting
 *   waiting --`resolvedResults` prop arrives--> result   (the G2 round trip)
 *   result --CTA, amount needed--> amount --finish--> done
 *   result --CTA, nothing to roll--> done
 *   done   --Close--> onClose()
 *
 * `onCommit` and `onFinish` are each guarded by a ref so they fire EXACTLY
 * once per mount, no matter how many times their buttons are pressed.
 *
 * ## Foundry one-tap
 *
 * In Foundry dice mode `RollEntry` both fills and commits the face in a single
 * tap (the physical die is already cast — there is nothing left to confirm),
 * so the primary commit pill is suppressed. RollEntry owns the mode decision
 * internally and does not report it, so the suppression is derived from the
 * same three signals RollEntry reads (`TABLE_DICE_PREF`, `useFoundryDice()
 * .available`, `charId`) PLUS one inference that closes the nack hole: in
 * Foundry mode a face can only appear via an ack, and an ack commits — so
 * `phase === 'roll' && face != null` proves the pad is what is on screen
 * (table mode, no bridge, or a nack fallback) and the pill is shown again.
 *
 * @param {boolean}  [isOpen=true]
 * @param {Function} onClose         - Modal chrome close AND the settled Close button
 * @param {string}   title           - Modal header text
 * @param {string}   [themeColor]    - per-character accent, forwarded to Modal
 * @param {string}   [maxWidth='460px']
 *
 * SUMMARY STRIP + EDIT DISCLOSURE
 * @param {string}   [summaryLine]   - the 11px context line, precomposed by the caller:
 *                                     `Ghoul + Zombie Brute · 1 action · attack +18 · MAP -5`
 * @param {string}   [blockLine]     - HARD BLOCK text (out of range, empty pool, frequency
 *                                     lock, failed flat check, a closed gate). Renders as a
 *                                     `--d-cf-*` tinted line in the strip and disables the
 *                                     primary button and the die entry. Null = clear.
 * @param {ReactNode}[editPanel]     - collapsed-by-default slot: TargetPicker chips, the MAP
 *                                     row, situational toggles, gate sections — all still
 *                                     owned and rendered by the caller. Absent = no Edit button.
 * @param {string}   [editStatusLine]- muted line under the panel, e.g.
 *                                     `Gates, casting cost and flat checks — all clear`
 *
 * PHASE 1 — DIE
 * @param {boolean}  [hasD20=true]   - false skips RollEntry entirely (no-die abilities);
 *                                     the commit button is then always live
 * @param {string}   [charId]        - forwarded to RollEntry (chat-speaker attribution)
 * @param {string}   [flavor]        - forwarded to RollEntry + DamageEntry
 * @param {number}   [bonus]         - forwarded to RollEntry; also builds the frozen headline
 * @param {string}   [bonusLabel]
 * @param {string}   [dcLine]        - RollEntry's pre-roll math line
 * @param {string}   [commitLabel]   - `Resolve strike (1 action)` / `Cast Electric Arc (2 actions)`
 * @param {boolean}  [saveMode]      - commit lands on `waiting` instead of `result`
 * @param {string}   [preCommitNote] - overrides the default italic note
 *
 * COMMIT
 * @param {Function} onCommit        - (face|null) => rows | Promise<rows>. The caller runs its
 *                                     exact confirm sequence here and returns the FROZEN rows:
 *                                     `[{ entryId, name, dcLabel, degree, note? }]`. Return
 *                                     null/undefined for a commit with no per-target degrees.
 *                                     A Promise parks the sheet in `rolling` until it settles.
 *
 * WAITING (save round trip, G2 #1689)
 * @param {Array}    [resolvedResults] - rows arriving from the GM. While `phase === 'waiting'`
 *                                       the first non-null value freezes into `results` and
 *                                       advances to `result`; later changes are ignored.
 * @param {string}   [waitingCaption]
 * @param {string}   [rollingCaption]
 * @param {Object}   [closeGuard]    - the ONLY additive prop from G2 (#1689), and the
 *   answer to F's friction 1 (PR #1700: "no hook to gate RollSheet's own pill").
 *   `waiting` and `amount` are the two phases that can carry an unmet obligation —
 *   degrees still in flight, damage rolled but not applied — and Modal chrome
 *   (overlay / × / Escape) could silently drop either. All three fields optional:
 *     { blocked?: boolean       - refuse the FIRST close attempt while the phase is
 *                                 `waiting` or `amount`; the next tap closes, so the
 *                                 player is never trapped (the locked v1 rule).
 *       notice?: string         - a gold advisory rendered on the pending and amount
 *                                 screens whenever present. G2's escape hatches use
 *                                 it for "the GM dismissed this" / "the encounter
 *                                 ended" — the sheet stops being a lie without
 *                                 RollSheet learning anything about save requests.
 *       blockedNotice?: string  - what a REFUSED close says (default below). }
 *   Deliberately not a `resultBlocked`: this gates leaving, never advancing.
 *

 * RESULT
 * @param {boolean}  [attack]        - Hit/Miss degree labels instead of Success/Failure
 * @param {string}   [headlineMath]  - overrides the frozen `+18 = 31` (saves pass `Reflex DC 27`)
 * @param {string}   [resultNote]    - overrides the derived note line
 * @param {ReactNode}[resultExtras]  - caller-owned slot rendered between the result rows
 *                                     (after the note) and the CTA/Close pill. For
 *                                     degree-gated post-roll choices with no other home
 *                                     (Exploit Vulnerability's effect radios, #1688) — a
 *                                     slot only, no logic. Absent = nothing renders.
 * @param {string}   [ctaLabel='Roll damage']
 * @param {string}   [closeLabel='Close']
 *
 * AMOUNT
 * @param {Array}    [damageParts]   - `damageEntryParts(profile, riderState)` rows each merged
 *                                     with their `damageRollFormulas` formula. Null/empty
 *                                     SKIPS the amount phase entirely.
 * @param {Array}    [amountDegrees=HIT_DEGREES] - degrees that require an amount; null = every
 *                                     resolved target (basic saves)
 * @param {string}   [amountHeading]
 * @param {ReactNode}[amountExtras]   - rider toggles + the `Crit ×2` checkbox, caller-owned
 * @param {Function} [breakdownFor]   - (amounts) => string|null, the breakdown line
 * @param {string}   [finishLabel='Apply damage']
 * @param {Function} onFinish         - (amounts) => void. The caller runs the damage appliers.
 *
 * SETTLED
 * @param {string}   [costLabel]      - `1 action`, shown beside `Resolved ✓`
 * @param {Function} [receiptFor]     - ({ face, results, amounts }) => string[] receipt lines.
 *                                      Omitted → a die line plus one line per target.
 * @param {string}   [resolvedLabel='Resolved ✓']
 */
export default function RollSheet({
  isOpen = true,
  onClose,
  title,
  themeColor,
  maxWidth = '460px',

  summaryLine = '',
  blockLine = null,
  editPanel = null,
  editStatusLine = '',

  hasD20 = true,
  charId = null,
  flavor = '',
  bonus = null,
  bonusLabel = '',
  dcLine = '',
  commitLabel = 'Resolve',
  saveMode = false,
  preCommitNote,

  onCommit,

  resolvedResults = null,
  waitingCaption = 'Waiting on the GM to roll saves…',
  rollingCaption = 'Rolling in Foundry…',
  closeGuard = null,

  attack = false,
  headlineMath = null,
  resultNote,
  resultExtras = null,
  ctaLabel = 'Roll damage',
  closeLabel = 'Close',

  damageParts = null,
  amountDegrees = HIT_DEGREES,
  amountHeading = 'Damage · un-doubled',
  amountExtras = null,
  breakdownFor,
  finishLabel = 'Apply damage',
  onFinish,

  costLabel = '',
  receiptFor,
  resolvedLabel = 'Resolved ✓',
}) {
  const [phase, setPhase] = useState('roll');
  const [face, setFace] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  // The one frozen snapshot: { face, math, results }. Written once at commit
  // (plus the one `waiting → result` results merge) and never recomputed.
  const [committed, setCommitted] = useState(null);
  const [amounts, setAmounts] = useState({});
  // Close-guard bookkeeping (#1689): one refused attempt per phase.
  const [closeAsked, setCloseAsked] = useState(false);

  // Exactly-once guards — a double tap, a re-render mid-await or a stray
  // keyboard activation can never fire the caller's sequence twice.
  const commitRef = useRef(false);
  const finishRef = useRef(false);

  // Same three signals RollEntry reads, for the commit-pill suppression only.
  const [tabledice] = useDevicePref(TABLE_DICE_PREF, false);
  const { available } = useFoundryDice();
  const foundryOneTap = !tabledice && available && !!charId;

  const blocked = !!blockLine;

  const doCommit = useCallback((rolledFace) => {
    if (commitRef.current) return;
    if (blocked) return;
    const f = rolledFace ?? null;
    if (hasD20 && f == null) return;
    commitRef.current = true;

    const settle = (rows) => {
      setCommitted({
        face: f,
        math: headlineMath ?? (f != null && bonus != null ? `${signed(bonus)} = ${f + bonus}` : null),
        results: Array.isArray(rows) ? rows : [],
      });
      setPhase(saveMode ? 'waiting' : 'result');
    };

    const out = onCommit?.(f);
    if (out && typeof out.then === 'function') {
      setPhase('rolling');
      out.then(settle, () => settle(null));
    } else {
      settle(out);
    }
  }, [blocked, hasD20, headlineMath, bonus, saveMode, onCommit]);

  // The save round trip (#1689): the GM's degrees land on the encounter rail
  // and the caller hands them down. The FIRST non-null batch freezes.
  useEffect(() => {
    if (phase !== 'waiting' || !resolvedResults) return;
    setCommitted((c) => ({ ...(c || { face: null, math: null }), results: resolvedResults }));
    setPhase('result');
  }, [phase, resolvedResults]);

  const results = useMemo(() => committed?.results || [], [committed]);
  const amountTargets = useMemo(
    () => (amountDegrees == null ? results : results.filter((r) => amountDegrees.includes(r.degree))),
    [results, amountDegrees],
  );
  const parts = Array.isArray(damageParts) ? damageParts : [];
  const hasAmount = parts.length > 0 && amountTargets.length > 0;

  // Close guard (#1689): only `waiting` and `amount` can hold an obligation, so
  // the guard never touches phase 1 or the settled receipt. A refused attempt
  // explains itself and arms the next one; changing phase re-arms the guard.
  const guardActive = !!closeGuard?.blocked && (phase === 'waiting' || phase === 'amount');
  useEffect(() => { setCloseAsked(false); }, [phase]);
  const handleClose = useCallback(() => {
    if (guardActive && !closeAsked) {
      setCloseAsked(true);
      return;
    }
    onClose?.();
  }, [guardActive, closeAsked, onClose]);

  const doFinish = useCallback(() => {
    if (finishRef.current) return;
    finishRef.current = true;
    onFinish?.(amounts);
    setPhase('done');
  }, [onFinish, amounts]);

  if (!isOpen) return null;

  // The gold advisory: the caller's standing notice, or — once a close attempt
  // has been refused — why it was.
  const guardNotice = (guardActive && closeAsked)
    ? (closeGuard?.blockedNotice || 'Tap Close again to leave this unresolved.')
    : (closeGuard?.notice || null);
  const guardLine = guardNotice ? <p className="rs-guard">{guardNotice}</p> : null;

  const shell = (body) => (
    <Modal
      isOpen
      onClose={handleClose}
      title={title}
      themeColor={themeColor}
      maxWidth={maxWidth}
      placement="bottom"
      highZ
    >
      <div className="rs">{body}</div>
    </Modal>
  );

  // ── Screen 2 — pending (Foundry roll in flight, or waiting on the GM) ─────
  if (phase === 'rolling' || phase === 'waiting') {
    const waiting = phase === 'waiting';
    return shell(
      <div className="rs-pending" role="status">
        <div className="rs-pending-ring">{waiting ? 'GM' : '1d20'}</div>
        <p className="rs-pending-caption">{waiting ? waitingCaption : rollingCaption}</p>
        {guardLine}
      </div>,
    );
  }

  // ── Screen 5 — settled ────────────────────────────────────────────────────
  if (phase === 'done') {
    const lines = receiptFor
      ? (receiptFor({ face: committed?.face ?? null, results, amounts }) || [])
      : [
        ...(committed?.face != null
          ? [`d20 ${committed.face}${committed.math ? ` ${committed.math}` : ''}`]
          : []),
        ...results.map((r) => `${r.name} — ${degreeLabel(r.degree, { attack })}`),
      ];
    return shell(
      <>
        <div className="rs-settled-head">
          <span className="rs-settled-label">{resolvedLabel}</span>
          {costLabel && <span className="rs-settled-cost">{costLabel}</span>}
        </div>
        <div className="rs-receipt">
          {lines.map((line, i) => (
            <p className="rs-receipt-line" key={`${line}-${i}`}>{line}</p>
          ))}
        </div>
        {/* Close only — Undo is a locked no for v1 (#1680). */}
        <button type="button" className="rs-pill" onClick={handleClose}>{closeLabel}</button>
      </>,
    );
  }

  // ── Screen 4 — amount ─────────────────────────────────────────────────────
  if (phase === 'amount') {
    const breakdown = breakdownFor ? breakdownFor(amounts) : null;
    return shell(
      <>
        <div className="rs-recap">
          {amountTargets.map((r) => (
            <span className={`rs-chip${toneClass(r.degree)}`} key={r.entryId}>
              {r.name} · {degreeLabel(r.degree, { attack })}
            </span>
          ))}
        </div>
        <p className="rs-amount-heading">{amountHeading}</p>
        <div className="rs-parts">
          {parts.map((part) => (
            <DamageEntry
              key={part.key}
              part={part}
              value={amounts[part.key] ?? ''}
              onChange={(v) => setAmounts((cur) => ({ ...cur, [part.key]: v }))}
              charId={charId}
              flavor={flavor}
            />
          ))}
        </div>
        {amountExtras}
        {breakdown && <p className="rs-breakdown">{breakdown}</p>}
        {guardLine}
        <button type="button" className="rs-pill" onClick={doFinish}>{finishLabel}</button>
      </>,
    );
  }

  // ── Screen 3 — result ─────────────────────────────────────────────────────
  if (phase === 'result') {
    let note = resultNote;
    if (note === undefined) {
      if (saveMode) note = 'Degrees in from the GM.';
      else if (hasAmount) note = `${amountTargets.length} hit — damage next.`;
      else if (results.length > 0 && amountTargets.length === 0) note = 'No hits. Nothing to roll.';
      else note = null;
    }
    const dieFace = committed?.face;
    let faceClass = '';
    if (dieFace === 20) faceClass = ' rs-headline-face--nat20';
    else if (dieFace === 1) faceClass = ' rs-headline-face--nat1';
    return shell(
      <div className="rs-result">
        <div className="rs-headline">
          {dieFace != null && <span className={`rs-headline-face${faceClass}`}>{dieFace}</span>}
          {committed?.math && <span className="rs-headline-math">{committed.math}</span>}
        </div>
        <div className="rs-rows">
          {results.map((r) => (
            <div className={`rs-row${toneClass(r.degree)}`} key={r.entryId}>
              <span className="rs-row-name">{r.name}</span>
              {r.dcLabel && <span className="rs-row-dc">{r.dcLabel}</span>}
              <span className="rs-row-degree">{degreeLabel(r.degree, { attack })}</span>
              {r.note && <span className="rs-row-note">{r.note}</span>}
            </div>
          ))}
        </div>
        {note && <p className="rs-note">{note}</p>}
        {resultExtras}
        <button
          type="button"
          className="rs-pill"
          onClick={() => setPhase(hasAmount ? 'amount' : 'done')}
        >
          {hasAmount ? ctaLabel : closeLabel}
        </button>
      </div>,
    );
  }

  // ── Screen 1 — phase 1: aim & roll ────────────────────────────────────────
  // The pill hides only while the Foundry one-tap is genuinely on screen; a
  // face during `roll` proves the pad took over (see the component doc).
  const showCommitPill = !hasD20 || !foundryOneTap || face != null;
  const note = preCommitNote ?? (saveMode
    ? 'The targets roll their saves — you commit first, the result comes back here.'
    : 'No degrees until you commit.');

  return shell(
    <>
      <div className="rs-summary">
        <div className="rs-summary-text">
          {summaryLine && <p className="rs-summary-line">{summaryLine}</p>}
          {blockLine && <p className="rs-block">{blockLine}</p>}
        </div>
        {editPanel && (
          <button type="button" className="rs-edit-btn" onClick={() => setEditOpen((o) => !o)}>
            {editOpen ? 'Done' : 'Edit'}
          </button>
        )}
      </div>

      {editPanel && editOpen && (
        <div className="rs-edit-panel">
          {editPanel}
          {editStatusLine && <p className="rs-edit-status">{editStatusLine}</p>}
        </div>
      )}

      {hasD20 && (
        <RollEntry
          face={face}
          onFaceChange={setFace}
          onCommit={doCommit}
          bonus={bonus}
          bonusLabel={bonusLabel}
          dcLine={dcLine}
          disabled={blocked}
          charId={charId}
          flavor={flavor}
        />
      )}

      {showCommitPill && (
        <button
          type="button"
          className="rs-pill"
          disabled={blocked || (hasD20 && face == null)}
          onClick={() => doCommit(face)}
        >
          {commitLabel}
        </button>
      )}

      <p className="rs-precommit-note">{note}</p>
    </>,
  );
}
