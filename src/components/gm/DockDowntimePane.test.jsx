import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { saveDocument } from '../../utils/gmApi';
import DockDowntimePane from './DockDowntimePane';

// GM Command Dock — Downtime pane. Covers the #1853 no-scroll shell (header +
// seven-view rail + view switching) and, through it, the Research view
// (#1841, epic #206 S3), which still carries its wave-1 markup. Reputation's
// own coverage moved to downtime/ReputationView.test.jsx when its no-scroll
// ladder re-layout (#1855) gave it a real view file worth testing on its own.
// Everything runs against the REAL provider stack: `research` topics and
// `faction` docs ride ContentProvider's initialContent seam, party research
// progress / the downtime block / the clock ride the in-memory session bus
// through the real useSyncedState, and the RP math is the real
// utils/research.js. The only mock is the GM content API (a network call,
// spread from the original module so a new export can't break this factory).
//
// The rail is the reason most assertions below are container-scoped: the
// research suite mounts the pane more than once in a single test (two seeds,
// one comparison), and `screen` would then see both trees.
vi.mock('../../utils/gmApi', async (importOriginal) => ({
  ...(await importOriginal()),
  saveDocument: vi.fn(),
}));

const TOPIC = {
  id: 'the-pit-research',
  title: 'The Pit',
  level: 3,
  traits: ['Uncommon'],
  description: 'Something old sleeps under Sandpoint.',
  sources: [
    {
      name: 'Brodert Quink',
      note: 'The scholar will talk for hours, for a price.',
      costNote: '5 sp per day',
      maxRp: 2,
      checks: [{ skill: 'diplomacy', dc: 19 }, { skill: 'society', dc: 17 }],
    },
    {
      name: 'Turandarok Archives',
      maxRp: 4,
      checks: [{ skill: 'society', dc: 20 }],
    },
  ],
  unlocks: [
    { rp: 1, text: 'The pit predates the town.', loreId: 'the-pit' },
    { rp: 5, text: 'Arika Avertin remembers the digging.', loreId: 'arika-avertin' },
  ],
  reward: 'The party learns the safe way down.',
};

const LORE = [
  { id: 'the-pit', title: 'The Pit', category: 'Places', summary: 'A hole.', visibility: 'gm' },
  { id: 'arika-avertin', title: 'Arika Avertin', category: 'People', visibility: 'revealed' },
];

// The GMG default -50..50 ladder. Its outer bounds ARE its bounds — nothing
// covers 51+ or -51-, so a score pushed past 50 lands outside every rank
// (the graceful "no chip" case, #1850 ruling).
const FACTION = {
  id: 'scarnetti-consortium',
  name: 'Scarnetti Consortium',
  reputation: 0,
  ranks: [
    { name: 'Hunted', min: -50, max: -30 },
    { name: 'Disliked', min: -29, max: -10, effect: 'Prices rise 10% at Consortium-run shops.' },
    { name: 'Neutral', min: -9, max: 9 },
    { name: 'Friendly', min: 10, max: 29 },
    { name: 'Revered', min: 30, max: 50 },
  ],
};

// GameDateContext's DEFAULT_CLOCK is 5 Pharast 4725, 08:00 — a block stamped
// two days earlier therefore reads as day 3.
const BLOCK = { days: 7, active: true, startedAt: { day: 3, month: 2, year: 4725 } };

const sessionState = ({ progress, block } = {}) => ({
  global: {
    ...(progress ? { research: { [TOPIC.id]: progress } } : {}),
    ...(block ? { downtimeblock: block } : {}),
  },
});

const mount = ({
  topics = [TOPIC],
  progress,
  factions = [FACTION],
  block,
  characters = [makeCharacter({ id: 'pc-1', name: 'Pellias' })],
  ...rest
} = {}) =>
  renderWithProviders(<DockDowntimePane />, {
    content: {
      research: topics,
      lore: LORE,
      faction: factions,
      character: characters,
    },
    session: { state: sessionState({ progress, block }) },
    ...rest,
  });

// ── Scoped locators ─────────────────────────────────────────────────────────
// A rail button's accessible name is "{label} {live meta}", so anchor the label.
const railButton = (result, label) =>
  within(result.container).getByRole('button', { name: new RegExp(`^${label}`) });

const header = (result) => within(result.container.querySelector('.dock-dt-header'));

const showView = (result, label) => {
  fireEvent.click(railButton(result, label));
  return result;
};


const lastClockWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'clock')?.value ?? null;


const open = { available: true, rp: 0, perSourceRp: {} };

beforeEach(() => {
  window.localStorage.clear();
  saveDocument.mockResolvedValue({});
});

describe('DockDowntimePane — shell (#1853)', () => {
  const LABELS = [
    'Research',
    'Reputation',
    'Period',
    'Ledger',
    'Training',
    'Inventory',
    'Resources',
  ];

  const railButtons = (result) =>
    within(within(result.container).getByRole('navigation', { name: 'Downtime views' }))
      .getAllByRole('button');

  it('renders all seven views in the rail, Research pressed by default', () => {
    const r = mount({ progress: open });
    const buttons = railButtons(r);

    expect(buttons).toHaveLength(7);
    expect(buttons.map((b) => b.querySelector('.dock-dt-rail-label').textContent)).toEqual(LABELS);
    expect(buttons.map((b) => b.getAttribute('aria-pressed'))).toEqual([
      'true', 'false', 'false', 'false', 'false', 'false', 'false',
    ]);
  });

  // e2e/helpers/dock.ts `gotoDowntimeDock` gates on this heading — it is the
  // pane-only element proving the dock resolved to downtime mode, so Research
  // must be the default view and must render its h2 on first paint.
  it('renders the Research heading immediately (the e2e dock gate)', () => {
    mount({ progress: open });
    expect(screen.getByRole('heading', { name: 'Research', level: 2 })).toBeInTheDocument();
  });

  it('switching the rail swaps the view outright', () => {
    const r = mount({ progress: open });

    showView(r, 'Ledger');
    expect(within(r.container).getByRole('heading', { name: 'Ledger' })).toBeInTheDocument();
    expect(railButton(r, 'Ledger')).toHaveAttribute('aria-pressed', 'true');
    // One view at a time — the outgoing pane is unmounted, not hidden.
    expect(
      within(r.container).queryByRole('heading', { name: 'Research' })
    ).not.toBeInTheDocument();
    expect(railButton(r, 'Research')).toHaveAttribute('aria-pressed', 'false');
  });

  // The selected view is a DEVICE preference, not synced campaign state: a
  // reopen on this tablet returns to the same pane, and no other client sees it.
  it('persists the selected view per device', () => {
    const first = mount({ progress: open });
    showView(first, 'Training');

    const second = mount({ progress: open });
    expect(within(second.container).getByRole('heading', { name: 'Training' })).toBeInTheDocument();
    expect(railButton(second, 'Training')).toHaveAttribute('aria-pressed', 'true');
  });

  it('computes each rail meta line live', () => {
    const r = mount({
      progress: open,
      topics: [TOPIC, { ...TOPIC, id: 'other-topic', title: 'Something else' }],
    });

    // Only TOPIC has an `available` flag in the seeded progress map.
    expect(railButton(r, 'Research')).toHaveTextContent('1 open · 1 locked');
    expect(railButton(r, 'Reputation')).toHaveTextContent('1 faction');
    expect(railButton(r, 'Period')).toHaveTextContent('No block');
    expect(railButton(r, 'Ledger')).toHaveTextContent('0 / 1 locked in');
    expect(railButton(r, 'Training')).toHaveTextContent('0 tracks');
    expect(railButton(r, 'Inventory')).toHaveTextContent('Hands & bags');
    expect(railButton(r, 'Resources')).toHaveTextContent('HP · focus · slots');
  });

  it('reads the day of the block off the clock, not a stored counter', () => {
    const r = mount({ progress: open, block: BLOCK });
    expect(header(r).getByText('Day 3 / 7')).toBeInTheDocument();
    expect(header(r).getByText('0 / 1 locked in')).toBeInTheDocument();
    expect(railButton(r, 'Period')).toHaveTextContent('Day 3 / 7');
  });

  it('clamps the day readout to the block budget', () => {
    // Stamped 30 days back — the block only granted 7, so it stays at day 7.
    const r = mount({
      progress: open,
      block: { ...BLOCK, startedAt: { day: 5, month: 1, year: 4725 } },
    });
    expect(header(r).getByText('Day 7 / 7')).toBeInTheDocument();
  });

  it('says so quietly when no block is open', () => {
    const r = mount({ progress: open });
    expect(header(r).getByText('No open block')).toBeInTheDocument();
    expect(header(r).queryByText(/locked in/)).not.toBeInTheDocument();
    expect(header(r).queryByText(/^Day /)).not.toBeInTheDocument();
  });

  it('advances the shared clock forwards and backwards', () => {
    const { session } = mount({ progress: open });

    fireEvent.click(screen.getByRole('button', { name: 'Forward eight hours' }));
    expect(lastClockWrite(session)).toEqual(expect.objectContaining({ hour: 16, day: 5 }));

    fireEvent.click(screen.getByRole('button', { name: 'Back one day' }));
    expect(lastClockWrite(session)).toEqual(expect.objectContaining({ hour: 16, day: 4 }));
  });

  it('closes back to the GM dashboard', () => {
    mount({ progress: open });
    expect(screen.getByRole('link', { name: 'Close downtime dock' })).toHaveAttribute(
      'href',
      '/gm'
    );
  });

  // jsdom has no layout — every element reports scrollHeight === clientHeight === 0,
  // so a DOM overflow walk here would pass whatever the CSS said. The contract
  // that actually prevents the overflow this redesign exists to kill lives in
  // the stylesheets, so assert THAT: each link of the no-scroll chain, and the
  // absence of any viewport-size fallback (a #1853 decision — this fixed layout
  // is the only downtime dock UI, there is nothing to fall back to).
  describe('the no-scroll CSS contract', () => {
    const read = (path) => readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    const SHELL_CSS = read('./DockDowntimePane.css');
    const VIEW_CSS = read('./downtime/DowntimeViews.css');

    const declarations = (css, selector) => {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = css.match(new RegExp(`(?:^|\\n)${escaped}\\s*\\{([^}]*)\\}`));
      return match ? match[1] : '';
    };

    it.each([
      ['.dock-dt', ['overflow: hidden', 'flex-direction: column', 'min-height: 0']],
      ['.dock-dt-header', ['flex: none', 'height: 66px']],
      [
        '.dock-dt-body',
        ['min-height: 0', 'overflow: hidden', 'grid-template-columns: 148px minmax(0, 1fr)'],
      ],
      ['.dock-dt-content', ['min-height: 0', 'overflow: hidden']],
    ])('%s keeps its link of the chain', (selector, required) => {
      const rule = declarations(SHELL_CSS, selector);
      expect(rule).not.toBe('');
      required.forEach((decl) => expect(rule).toContain(decl));
    });

    it('the view frame fills its column instead of hugging its content', () => {
      const rule = declarations(VIEW_CSS, '.dock-dt-view');
      expect(rule).toContain('flex: 1');
      expect(rule).toContain('min-height: 0');
      expect(rule).toContain('grid-template-rows: var(--dock-dt-view-rows, auto minmax(0, 1fr))');
    });

    it('ships no viewport-size fallback layout', () => {
      expect(SHELL_CSS).not.toMatch(/@media[^{]*(width|height)/);
      expect(VIEW_CSS).not.toMatch(/@media[^{]*(width|height)/);
    });

    // The wave-1 scroll escape hatch is gone (#1854/#1855 were its last
    // users). NO view may scroll — content that cannot fit is paginated or
    // sub-divided with buttons instead.
    it('allows no scrolling anywhere in the views stylesheet', () => {
      expect(VIEW_CSS).not.toMatch(/overflow(-y|-x)?:\s*(auto|scroll)/);
    });
  });
});

