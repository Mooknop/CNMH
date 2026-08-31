import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../../test/renderWithProviders';
import ResourcesView from './ResourcesView';

// Downtime dock — Resources view (#1860). Runs against the REAL provider stack:
// HP, focus and spell slots all ride the in-memory session bus through the real
// useSyncedState / useCharacter, so pip counts and bar tones come from the same
// derivation the live dock uses. Assertions are on what was WRITTEN to the bus
// (session.sent), which is the only durable output this surface has.
//
// GameDateProvider's default clock is 5 Pharast 4725, 08:00 — the rest/refocus
// tests read the `clock` writes against that.

const FIGHTER = makeCharacter({ id: 'pc-fighter', name: 'Ashka', class: 'Fighter', maxHp: 40 });

const SORCERER = makeCharacter({
  id: 'pc-sorc',
  name: 'Jade',
  class: 'Sorcerer',
  maxHp: 30,
  spellcasting: {
    tradition: 'Arcane',
    focus: { max: 2, current: 2 },
    spell_slots: { 1: 3, 2: 2 },
    spells: [],
  },
});

// A caster with a focus pool and a tradition but NO slots — the "show only the
// note" branch of the spec.
const MONK = makeCharacter({
  id: 'pc-monk',
  name: 'Blu',
  class: 'Monk',
  maxHp: 34,
  monk: { focus_points: 1 },
});

const mount = ({ characters = [FIGHTER, SORCERER], state = {}, ...rest } = {}) =>
  renderWithProviders(<ResourcesView />, {
    content: { character: characters },
    session: { state },
    ...rest,
  });

const writes = (session, stateType, characterId) =>
  session.sent.filter(
    (s) => s.stateType === stateType && (!characterId || s.characterId === characterId)
  );

const lastWrite = (session, stateType, characterId) =>
  [...writes(session, stateType, characterId)].pop()?.value ?? null;

const row = (id) => screen.getByTestId(`dock-dt-res-${id}`);

beforeEach(() => {
  window.localStorage.clear();
});

describe('ResourcesView (#1860)', () => {
  it('renders the heading and the summary copy', () => {
    mount();
    expect(screen.getByRole('heading', { name: 'Resources', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Hit points, focus, spell slots')).toBeInTheDocument();
  });

  it('renders one row per PC with real HP, class and name', () => {
    mount({ state: { 'pc-fighter': { hp: { current: 21, max: 40, temp: 0 } } } });

    const ashka = row('pc-fighter');
    expect(within(ashka).getByText('Ashka')).toBeInTheDocument();
    expect(within(ashka).getByText('Fighter')).toBeInTheDocument();
    expect(within(ashka).getByText('21 / 40')).toBeInTheDocument();

    // No synced hp yet ⇒ seeded from the character's authored maxHp.
    expect(within(row('pc-sorc')).getByText('30 / 30')).toBeInTheDocument();
  });

  it('renders focus pips from the real pool and the spent count', () => {
    mount({ state: { 'pc-sorc': { focus: 1 } } });
    const jade = row('pc-sorc');

    // max 2 pips, one still available.
    expect(jade.querySelectorAll('.dock-dt-res-pip')).toHaveLength(2);
    expect(jade.querySelectorAll('.dock-dt-res-pip--on')).toHaveLength(1);
    expect(within(jade).getByText('1 / 2')).toBeInTheDocument();

    // A martial with no pool gets no Focus cluster at all.
    expect(within(row('pc-fighter')).queryByText('Focus')).not.toBeInTheDocument();
  });

  it('renders a slot pip per rank, filled while unspent, plus the tradition note', () => {
    mount({ state: { 'pc-sorc': { slots: { 1: 2 } } } });
    const jade = row('pc-sorc');

    const groups = jade.querySelectorAll('.dock-dt-res-slot-group');
    expect(groups).toHaveLength(2);
    expect(within(groups[0]).getByText('1st')).toBeInTheDocument();
    expect(groups[0].querySelectorAll('.dock-dt-res-slot-pip')).toHaveLength(3);
    expect(groups[0].querySelectorAll('.dock-dt-res-slot-pip--on')).toHaveLength(1); // 3 − 2 spent
    expect(groups[1].querySelectorAll('.dock-dt-res-slot-pip--on')).toHaveLength(2); // untouched
    expect(within(jade).getByText('Arcane')).toBeInTheDocument();
  });

  it('a slotless PC renders no slot pips (note only when one exists)', () => {
    mount({ characters: [MONK] });
    const blu = row('pc-monk');
    expect(blu.querySelectorAll('.dock-dt-res-slot-pip')).toHaveLength(0);
    expect(blu.querySelectorAll('.dock-dt-res-slot-group')).toHaveLength(0);
    // Focus still renders — the monk's pool comes from the class block.
    expect(within(blu).getByText('1 / 1')).toBeInTheDocument();
    // No authored tradition ⇒ no invented note.
    expect(blu.querySelector('.dock-dt-res-note')).toBeNull();
  });

  describe('HP steppers', () => {
    it('steps 5 HP per tap, preserving temp HP', () => {
      const { session } = mount({
        state: { 'pc-fighter': { hp: { current: 20, max: 40, temp: 6, wounded: 1 } } },
      });

      fireEvent.click(screen.getByRole('button', { name: "Restore 5 HP to Ashka" }));
      expect(lastWrite(session, 'hp', 'pc-fighter')).toMatchObject({ current: 25, temp: 6, wounded: 1 });

      fireEvent.click(screen.getByRole('button', { name: "Reduce Ashka's HP by 5" }));
      expect(lastWrite(session, 'hp', 'pc-fighter')).toMatchObject({ current: 20, temp: 6 });
    });

    it('clamps to max and disables + at full health', () => {
      const { session } = mount({
        state: { 'pc-fighter': { hp: { current: 38, max: 40, temp: 0 } } },
      });
      const up = screen.getByRole('button', { name: 'Restore 5 HP to Ashka' });
      fireEvent.click(up);
      expect(lastWrite(session, 'hp', 'pc-fighter')).toMatchObject({ current: 40 });
      expect(screen.getByRole('button', { name: 'Restore 5 HP to Ashka' })).toBeDisabled();
    });

    it('clamps to 0 and disables − at zero', () => {
      const { session } = mount({
        state: { 'pc-fighter': { hp: { current: 3, max: 40, temp: 0 } } },
      });
      fireEvent.click(screen.getByRole('button', { name: "Reduce Ashka's HP by 5" }));
      expect(lastWrite(session, 'hp', 'pc-fighter')).toMatchObject({ current: 0 });
      expect(screen.getByRole('button', { name: "Reduce Ashka's HP by 5" })).toBeDisabled();
    });
  });

  describe('HP bar tone', () => {
    const toneOf = (id) => {
      const bar = row(id).querySelector('.dock-dt-res-bar');
      return [...bar.classList].find((c) => c.startsWith('dock-dt-res-bar--'));
    };

    it('is verdant above 60%, gold above 30%, peril below', () => {
      mount({
        characters: [FIGHTER, SORCERER, MONK],
        state: {
          'pc-fighter': { hp: { current: 40, max: 40, temp: 0 } },
          'pc-sorc': { hp: { current: 15, max: 30, temp: 0 } },
          'pc-monk': { hp: { current: 5, max: 34, temp: 0 } },
        },
      });
      expect(toneOf('pc-fighter')).toBe('dock-dt-res-bar--verdant');
      expect(toneOf('pc-sorc')).toBe('dock-dt-res-bar--gold');
      expect(toneOf('pc-monk')).toBe('dock-dt-res-bar--peril');
    });
  });

  describe('per-PC Rest', () => {
    it('restores that PC only — full HP, wounded cleared, temp preserved', () => {
      const { session } = mount({
        state: {
          'pc-sorc': {
            hp: { current: 4, max: 30, temp: 3, wounded: 2, dying: 0 },
            focus: 2,
            slots: { 1: 3, 2: 1 },
          },
          'pc-fighter': { hp: { current: 10, max: 40, temp: 0 } },
        },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Rest Jade' }));

      expect(lastWrite(session, 'hp', 'pc-sorc')).toMatchObject({
        current: 30,
        temp: 3,
        wounded: 0,
        dying: 0,
      });
      expect(lastWrite(session, 'focus', 'pc-sorc')).toBe(0);
      expect(lastWrite(session, 'slots', 'pc-sorc')).toEqual({ 1: 0, 2: 0 });

      // Nobody else was touched, and the clock did not move.
      expect(writes(session, 'hp', 'pc-fighter')).toHaveLength(0);
      expect(writes(session, 'clock')).toHaveLength(0);
    });

    it('logs one rest line naming the PC', () => {
      const { session } = mount({ state: { 'pc-sorc': { focus: 1 } } });
      fireEvent.click(screen.getByRole('button', { name: 'Rest Jade' }));

      const log = lastWrite(session, 'sessionlog');
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ type: 'rest' });
      expect(log[0].text).toContain('Jade');
    });
  });

  describe('Refocus party', () => {
    it('zeroes focus for every PC and advances 10 minutes', () => {
      const { session } = mount({
        characters: [FIGHTER, SORCERER, MONK],
        state: { 'pc-sorc': { focus: 2 }, 'pc-monk': { focus: 1 } },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Refocus party' }));

      expect(lastWrite(session, 'focus', 'pc-fighter')).toBe(0);
      expect(lastWrite(session, 'focus', 'pc-sorc')).toBe(0);
      expect(lastWrite(session, 'focus', 'pc-monk')).toBe(0);
      expect(lastWrite(session, 'clock')).toMatchObject({ hour: 8, minute: 10 });
      expect(writes(session, 'clock')).toHaveLength(1);
    });

    it('leaves HP and spell slots alone', () => {
      const { session } = mount({ state: { 'pc-sorc': { slots: { 1: 2 } } } });
      fireEvent.click(screen.getByRole('button', { name: 'Refocus party' }));
      expect(writes(session, 'hp')).toHaveLength(0);
      expect(writes(session, 'slots')).toHaveLength(0);
    });
  });

  describe('Rest for the night', () => {
    it('is gated behind ConfirmDialog', () => {
      const { session } = mount({ state: { 'pc-sorc': { focus: 2 } } });
      fireEvent.click(screen.getByRole('button', { name: 'Rest for the night' }));

      // Nothing written until the dialog is confirmed.
      expect(writes(session, 'hp')).toHaveLength(0);
      expect(writes(session, 'clock')).toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(writes(session, 'clock')).toHaveLength(0);
    });

    it('restores everyone and advances the clock exactly 8 hours, once', () => {
      const { session } = mount({
        characters: [FIGHTER, SORCERER, MONK],
        state: {
          'pc-fighter': { hp: { current: 1, max: 40, temp: 0, wounded: 1 } },
          'pc-sorc': { hp: { current: 2, max: 30, temp: 0 }, focus: 2, slots: { 1: 3, 2: 2 } },
          'pc-monk': { hp: { current: 3, max: 34, temp: 0 }, focus: 1 },
        },
      });

      fireEvent.click(screen.getByRole('button', { name: 'Rest for the night' }));
      fireEvent.click(screen.getByRole('button', { name: 'Rest the party' }));

      expect(lastWrite(session, 'hp', 'pc-fighter')).toMatchObject({ current: 40, wounded: 0 });
      expect(lastWrite(session, 'hp', 'pc-sorc')).toMatchObject({ current: 30 });
      expect(lastWrite(session, 'hp', 'pc-monk')).toMatchObject({ current: 34 });
      expect(lastWrite(session, 'focus', 'pc-sorc')).toBe(0);
      expect(lastWrite(session, 'focus', 'pc-monk')).toBe(0);
      expect(lastWrite(session, 'slots', 'pc-sorc')).toEqual({ 1: 0, 2: 0 });

      const clockWrites = writes(session, 'clock');
      expect(clockWrites).toHaveLength(1);
      expect(clockWrites[0].value).toMatchObject({ hour: 16, minute: 0, day: 5, month: 2 });
    });

    it('logs a single party rest line', () => {
      const { session } = mount({ state: { 'pc-sorc': { focus: 1 } } });
      fireEvent.click(screen.getByRole('button', { name: 'Rest for the night' }));
      fireEvent.click(screen.getByRole('button', { name: 'Rest the party' }));

      const log = lastWrite(session, 'sessionlog');
      expect(log).toHaveLength(1);
      expect(log[0]).toMatchObject({ type: 'rest' });
      expect(log[0].text).toContain('party rested');
    });
  });
});
