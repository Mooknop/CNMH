import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { RELAY, APP } from '../../sync/keys';
import { DEFAULT_CLOCK } from '../../contexts/GameDateContext';
import { toGameSeconds } from '../../utils/gameTime';
import GmBystanderGate from './GmBystanderGate';

beforeEach(() => window.localStorage.clear());

const CHAR_ID = 'IzzyUncut';
const GHOUL = { entryId: 'e-g1', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' };
const ORDER = [
  { entryId: 'e-izzy', kind: 'pc', charId: CHAR_ID, name: 'Izzy' },
  GHOUL,
];

// localStorage is cleared per test and the bus seeds no clock, so the real
// GameDateProvider sits on DEFAULT_CLOCK — the immunity is stamped one day out
// from there, exactly as makeImmunityEntry would write it.
//
// It must be a REALISTIC moment, not a sentinel: this is the only test that
// takes the immune branch, which formats the expiry through
// gameSecondsToClock, and that walks the calendar forward ONE YEAR PER
// ITERATION from 4700. A Number.MAX_SAFE_INTEGER expiry is ~2.9e8 years out,
// i.e. ~285 million iterations — 1.9s locally and >10s under CI coverage
// instrumentation, which is what timed this test out.
const NOW_SECS = toGameSeconds(DEFAULT_CLOCK);
const ONE_DAY = 86400;

const immunity = () => ({
  effectId: 'ability-immunity',
  abilityKey: 'harmless-bystander',
  appliedBy: CHAR_ID,
  creatureName: 'Ghoul',
  expireAtSecs: NOW_SECS + ONE_DAY,
});

const render = () =>
  renderWithProviders(<GmBystanderGate entry={GHOUL} />, {
    content: { character: [makeCharacter({ id: CHAR_ID, name: 'Izzy' })] },
  });

const seedEncounter = (session) =>
  act(() => session.push('global', RELAY.ENCOUNTER, {
    active: true, phase: 'in-progress', round: 1, currentTurnIndex: 1,
    order: ORDER, log: [], saveRequests: [],
  }));

const declare = (session, extra = {}) =>
  act(() => session.push(CHAR_ID, APP.BYSTANDER, {
    active: true, mod: 'deception', ts: 1, ...extra,
  }));

describe('GmBystanderGate (#465)', () => {
  it('stays empty when nobody has declared', () => {
    const { session } = render();
    seedEncounter(session);
    expect(screen.getByTestId('gm-bystander-gate')).toBeEmptyDOMElement();
  });

  it('tells the GM this foe cannot react against the hiding PC', () => {
    const { session } = render();
    seedEncounter(session);
    declare(session);
    const gate = screen.getByTestId('gm-bystander-gate');
    expect(gate).toHaveTextContent('Harmless Bystander — no reactions vs Izzy');
    expect(gate).toHaveTextContent('must Sense Motive');
  });

  it('reports the foe as immune once it has watched her fight', () => {
    const { session } = render();
    seedEncounter(session);
    declare(session, { immune: { 'creature:ghoul': immunity() } });
    const gate = screen.getByTestId('gm-bystander-gate');
    expect(gate).toHaveTextContent('does not work on Ghoul');
    expect(gate).toHaveTextContent('It reacts normally.');
    expect(gate).not.toHaveTextContent('no reactions vs');
    // The expiry is formatted off the live clock — a day out from DEFAULT_CLOCK
    // (08:00) reads as tomorrow at the same time.
    expect(gate).toHaveTextContent('immune until tomorrow 08:00');
  });

  it('reports the lift once she has been recognized this fight', () => {
    const { session } = render();
    seedEncounter(session);
    declare(session, { revealed: true, revealedTs: 2 });
    expect(screen.getByTestId('gm-bystander-gate')).toHaveTextContent(
      'recognized as hostile — reactions against them are live again'
    );
  });

  it('renders nothing for a FRIENDLY-disposition NPC — allies react freely', () => {
    const { container, session } = renderWithProviders(
      <GmBystanderGate entry={{ ...GHOUL, disposition: 1 }} />,
      { content: { character: [makeCharacter({ id: CHAR_ID, name: 'Izzy' })] } },
    );
    seedEncounter(session);
    declare(session);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing at all for an entry with no creature key', () => {
    const { container, session } = renderWithProviders(
      <GmBystanderGate entry={{ kind: 'enemy', name: 'Nameless' }} />,
      { content: { character: [makeCharacter({ id: CHAR_ID, name: 'Izzy' })] } },
    );
    seedEncounter(session);
    expect(container.firstChild).toBeNull();
  });
});
