import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { RELAY, APP } from '../../sync/keys';
import GmBystanderGate from './GmBystanderGate';

beforeEach(() => window.localStorage.clear());

const CHAR_ID = 'IzzyUncut';
const GHOUL = { entryId: 'e-g1', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' };
const ORDER = [
  { entryId: 'e-izzy', kind: 'pc', charId: CHAR_ID, name: 'Izzy' },
  GHOUL,
];

const immunity = () => ({
  effectId: 'ability-immunity',
  abilityKey: 'harmless-bystander',
  appliedBy: CHAR_ID,
  creatureName: 'Ghoul',
  expireAtSecs: Number.MAX_SAFE_INTEGER,
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
