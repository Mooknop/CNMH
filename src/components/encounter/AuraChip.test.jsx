import React from 'react';
import { render, screen } from '@testing-library/react';

vi.mock('../../hooks/useSyncedState', () => {
  const ReactLib = require('react');
  const store = {};
  const subs = new Set();
  const useSyncedState = (key, init) => {
    const [, force] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => { subs.add(force); return () => subs.delete(force); }, []);
    if (!(key in store)) store[key] = typeof init === 'function' ? init() : init;
    const set = (u) => {
      store[key] = typeof u === 'function' ? u(store[key]) : u;
      subs.forEach((f) => f());
    };
    return [store[key], set];
  };
  return {
    __esModule: true,
    useSyncedState,
    __store: store,
    __reset: () => { for (const k of Object.keys(store)) delete store[k]; },
  };
});

import { __store, __reset } from '../../hooks/useSyncedState';
import AuraChip from './AuraChip';

const pellias = { entryId: 'e-pellias', name: 'Pellias', kind: 'pc', charId: 'Pellias' };

beforeEach(() => __reset());

describe('AuraChip', () => {
  it('renders nothing while the aura is down', () => {
    const { container } = render(<AuraChip entry={pellias} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing for a non-pc entry even with an active aura', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    const { container } = render(<AuraChip entry={{ ...pellias, kind: 'enemy' }} />);
    expect(container.firstChild).toBeNull();
  });

  it('keeps the plain tooltip when membership is unknown (no bridge push)', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    render(<AuraChip entry={pellias} />);
    expect(screen.getByTitle('Kinetic aura active')).toBeInTheDocument();
  });

  it('enriches the tooltip with the visible ally count when membership is known', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_auramembers_Pellias'] = {
      inside: [
        { entryId: 'e-ashka', tokenId: 't-ashka', name: 'Ashka', disposition: 1, hidden: false },
        // Hidden ally + a hostile — neither should count toward this player-facing tooltip.
        { entryId: 'e-scout', tokenId: 't-scout', name: 'Hidden Scout', disposition: 1, hidden: true },
        { tokenId: 't-goblin', name: 'Goblin', disposition: -1, hidden: false },
      ],
      ts: 2,
    };
    render(<AuraChip entry={pellias} />);
    expect(screen.getByTitle('Kinetic aura active — 1 ally inside')).toBeInTheDocument();
  });

  it('pluralizes for more than one visible ally', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_auramembers_Pellias'] = {
      inside: [
        { entryId: 'e-ashka', tokenId: 't-ashka', name: 'Ashka', disposition: 1, hidden: false },
        { entryId: 'e-borin', tokenId: 't-borin', name: 'Borin', disposition: 1, hidden: false },
      ],
      ts: 2,
    };
    render(<AuraChip entry={pellias} />);
    expect(screen.getByTitle('Kinetic aura active — 2 allies inside')).toBeInTheDocument();
  });

  it('reports zero when the aura is active but the region is empty (known, not unknown)', () => {
    __store['cnmh_aura_Pellias'] = { active: true, ts: 1 };
    __store['cnmh_auramembers_Pellias'] = { inside: [], ts: 2 };
    render(<AuraChip entry={pellias} />);
    expect(screen.getByTitle('Kinetic aura active — 0 allies inside')).toBeInTheDocument();
  });
});
