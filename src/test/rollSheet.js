import { screen, fireEvent, within } from '@testing-library/react';

// Interaction idiom for the RollSheet two-phase sheet (#1685 / #1687). The
// pre-redesign resolvers took a typed d20 and computed degrees live, so a test
// could `fireEvent.change(getByLabelText('raw d20'))` and assert immediately.
// Under RollSheet the die is a 1–20 TAP PAD, nothing is resolved until the
// commit, and the damage total is only asked for afterwards — so every attack
// test walks: tap a face → commit → (Roll damage → total → Apply damage).
//
// The pill lookups go through `.rs-pill` rather than an accessible name because
// exactly one primary pill exists per phase and its label is caller-composed
// (`Use Mace Strike (1)` / `Cast Shocking Grasp (2)`); RollSheet.test.jsx owns
// the label contract itself.

/** RollEntry's 1–20 tap pad. */
export const rollPad = () => screen.getByRole('group', { name: 'raw d20' });

/** Tap one face. `exact` name matching matters — a loose `1` also hits 10–19. */
export const tapFace = (n) =>
  fireEvent.click(within(rollPad()).getByRole('button', { name: String(n), exact: true }));

/** The single primary pill on whatever phase is on screen. */
export const sheetPill = () => document.querySelector('.rs-pill');

/** Open the caller's edit disclosure (targets, MAP, gates, toggles). */
export const openEdit = () => fireEvent.click(screen.getByRole('button', { name: 'Edit' }));

/** Tap a face and commit — the one moment the confirm sequence fires. */
export const commitRoll = (face) => {
  tapFace(face);
  fireEvent.click(sheetPill());
};

/** Result → amount. */
export const rollDamage = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Roll damage' }));

/** Amount → done: the damage appliers run here. */
export const applyDamage = () =>
  fireEvent.click(screen.getByRole('button', { name: 'Apply damage' }));

/**
 * Finish the amount step — a NO-OP when the commit left nothing to roll (a
 * miss, or a damage-free ability), where the sheet goes result → done directly.
 * This is what the old `confirm()` tap becomes for suites whose assertions are
 * all about the confirm-time side effects.
 */
export const finishAmount = () => {
  const btn = screen.queryByRole('button', { name: 'Apply damage' });
  if (btn) fireEvent.click(btn);
};

export const enterDamage = (value, label = /rolled damage total/i) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value: String(value) } });

/** true once the sheet has left phase 1 (a result card / receipt is showing). */
export const committed = () => !!document.querySelector('.rs-result, .rs-receipt');

/**
 * The whole arc. `total` null/undefined stops at the result card (a miss, or an
 * ability with nothing to roll) — the caller then taps Close itself if it cares.
 */
export const resolveAttack = (face, total) => {
  commitRoll(face);
  if (total == null) return;
  rollDamage();
  enterDamage(total);
  applyDamage();
};
