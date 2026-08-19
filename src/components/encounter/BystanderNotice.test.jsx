import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { APP } from '../../sync/keys';
import BystanderNotice from './BystanderNotice';

beforeEach(() => window.localStorage.clear());

const CHAR_ID = 'IzzyUncut';
const ORDER = [
  { entryId: 'e-izzy', kind: 'pc', charId: CHAR_ID, name: 'Izzy' },
  { entryId: 'e-g1', kind: 'enemy', name: 'Ghoul', creatureKey: 'creature:ghoul' },
  { entryId: 'e-b', kind: 'enemy', name: 'Bandit' },
];

const SWORD = {
  uid: 'w1', name: 'Longsword', state: 'held1', hand: 1, strikes: [{ name: 'Longsword' }],
};

// A far-future expiry so the live game clock (4725 AR) never ages it out.
const immunity = (name) => ({
  effectId: 'ability-immunity',
  abilityKey: 'harmless-bystander',
  appliedBy: CHAR_ID,
  creatureName: name,
  expireAtSecs: Number.MAX_SAFE_INTEGER,
});

const render = (props = {}) =>
  renderWithProviders(<BystanderNotice charId={CHAR_ID} order={ORDER} {...props} />);

const declare = (session, extra = {}) =>
  act(() => session.push(CHAR_ID, APP.BYSTANDER, {
    active: true, mod: 'deception', ts: 1, ...extra,
  }));

describe('BystanderNotice (#465)', () => {
  it('renders nothing until the declaration is made', () => {
    const { container } = render();
    expect(container.firstChild).toBeNull();
  });

  it('states the reaction gate while she is still hiding', () => {
    const { session } = render();
    declare(session);
    expect(screen.getByTestId('bystander-notice')).toHaveTextContent(
      'cannot use reactions against you until you take a hostile action'
    );
  });

  it('warns about the +4 Sense Motive bonus when a weapon is in hand', () => {
    const { session } = render({ inventory: [SWORD] });
    declare(session);
    const hint = screen.getByTestId('bystander-armed-hint');
    expect(hint).toHaveTextContent('+4 circumstance bonus');
    expect(hint).toHaveTextContent('Longsword');
  });

  it('omits the armed hint with empty hands', () => {
    const { session } = render({ inventory: [] });
    declare(session);
    expect(screen.queryByTestId('bystander-armed-hint')).not.toBeInTheDocument();
  });

  it('names the creatures in this encounter that are already immune', () => {
    const { session } = render();
    declare(session, { immune: { 'creature:ghoul': immunity('Ghoul') } });
    const list = screen.getByTestId('bystander-immune-list');
    expect(list).toHaveTextContent('Ghoul');
    expect(list).not.toHaveTextContent('Bandit');
  });

  it('switches to the past tense once she has been recognized', () => {
    const { session } = render({ inventory: [SWORD] });
    declare(session, { revealed: true, revealedTs: 2 });
    expect(screen.getByTestId('bystander-notice')).toHaveTextContent(
      'observed taking a hostile action'
    );
    // The +4 hint is about fooling them; there is nothing left to fool.
    expect(screen.queryByTestId('bystander-armed-hint')).not.toBeInTheDocument();
  });
});
