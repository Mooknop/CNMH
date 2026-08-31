import React from 'react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { saveDocument } from '../../utils/gmApi';
import DockDowntimePane from './DockDowntimePane';

// GM Command Dock — Downtime pane. Covers the #1853 no-scroll shell (header +
// seven-view rail + view switching) and, through it, the two views that carry
// live logic today: Research (#1841, epic #206 S3) and Reputation (#1850).
// Everything runs against the REAL provider stack: `research` topics and
// `faction` docs ride ContentProvider's initialContent seam, party research
// progress / the downtime block / the clock ride the in-memory session bus
// through the real useSyncedState, and the RP/reputation math is the real
// utils/research.js + utils/reputation.js. The only mocks are the GM content
// API (a network call, spread from the original module so a new export can't
// break this factory) and the shared ReputationRadarChart (real `recharts`
// needs a ResizeObserver jsdom doesn't provide — see ReputationRadarChart.test.jsx
// for its own coverage of the chart's actual rendering).
//
// The rail is the reason most assertions below are container-scoped: the
// research and reputation suites each mount the pane more than once in a single
// test (two seeds, one comparison), and `screen` would then see both trees.
vi.mock('../../utils/gmApi', async (importOriginal) => ({
  ...(await importOriginal()),
  saveDocument: vi.fn(),
}));

vi.mock('../shared/ReputationRadarChart', () => ({
  default: (props) => (
    <div data-testid="dock-dt-rep-radar-mock" data-compact={String(!!props.compact)} />
  ),
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

/** Mount with the Reputation view selected — the rail is the only way in. */
const mountRep = (opts) => showView(mount(opts), 'Reputation');

const card = () => screen.getByTestId(`dock-dt-topic-${TOPIC.id}`);
const factionRow = (result, id = FACTION.id) =>
  within(result.container).getByTestId(`dock-dt-faction-${id}`);

const lastResearchWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'research')?.value ?? null;

const lastClockWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'clock')?.value ?? null;

const lastLogWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'sessionlog')?.value ?? [];

const open = { available: true, rp: 0, perSourceRp: {} };

beforeEach(() => {
  window.localStorage.clear();
  saveDocument.mockResolvedValue({});
  // Reputation's commit handler calls ContentContext's real `refresh()`
  // (a plain `fetch('/api/content')`, not the mocked gmApi) to re-pull the
  // committed doc. Stub it so that resolves deterministically instead of
  // hitting the network or racing undici's relative-URL handling.
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
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

    // Wave 1 moved Research and Reputation across with their old markup, so
    // their bodies still scroll (#1854 / #1855 re-lay them out). That is the
    // ONLY overflow allowed in the pane — if a third one appears, it wasn't
    // this exception.
    it('confines the temporary scroll exception to one opt-in class', () => {
      const scrollers = [...VIEW_CSS.matchAll(/([^\s{}]+)\s*\{[^}]*overflow-y:\s*auto/g)].map(
        (m) => m[1]
      );
      expect(scrollers).toEqual(['.dock-dt-view-body--scroll']);
    });
  });
});

describe('DockDowntimePane — Research (#1841)', () => {
  it('empty state offers the Research editor as the primary path', () => {
    mount({ topics: [] });
    const links = screen.getAllByRole('link', { name: /research editor|manage topics/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((l) => expect(l).toHaveAttribute('href', '/gm/world/research'));
    expect(screen.getByRole('status')).toHaveTextContent(/no research topics yet/i);
  });

  it('header links to the Research editor when topics exist', () => {
    mount({ progress: open });
    expect(screen.getByRole('link', { name: /manage topics/i })).toHaveAttribute(
      'href',
      '/gm/world/research'
    );
  });

  it('keeps the bulk-import hint in the empty state', () => {
    mount({ topics: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/importResearchTopicsCli/);
  });

  it('renders an available topic with its sources, DC chips and cost note', () => {
    mount({ progress: open });
    const topic = card();

    expect(within(topic).getByText('The Pit')).toBeInTheDocument();
    expect(within(topic).getByText('Level 3')).toBeInTheDocument();
    expect(within(topic).getByText('Uncommon')).toBeInTheDocument();
    expect(within(topic).getByText('Brodert Quink')).toBeInTheDocument();
    expect(within(topic).getByText('Turandarok Archives')).toBeInTheDocument();
    // One chip per check on the source, plus its cost note.
    expect(within(topic).getByText('Diplomacy 19')).toBeInTheDocument();
    expect(within(topic).getByText('Society 17')).toBeInTheDocument();
    expect(within(topic).getByText('5 sp per day')).toBeInTheDocument();
    // Total RP is the sum of every source's cap (utils/research totalMaxRp).
    expect(within(topic).getByLabelText('0 of 6 research points')).toBeInTheDocument();
  });

  it('collapses an unavailable topic to title + toggle, and the toggle opens it', () => {
    const { session } = mount();
    const topic = card();

    expect(within(topic).getByText('The Pit')).toBeInTheDocument();
    expect(within(topic).queryByText('Brodert Quink')).not.toBeInTheDocument();
    expect(within(topic).queryByText('The pit predates the town.')).not.toBeInTheDocument();

    const toggle = within(topic).getByRole('switch', { name: /The Pit available to the party/i });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(toggle);

    expect(lastResearchWrite(session)[TOPIC.id].available).toBe(true);
    expect(within(card()).getByText('Brodert Quink')).toBeInTheDocument();
  });

  it('accrues RP per source and disables the stepper at that source’s own cap', () => {
    const { session } = mount({
      progress: { ...open, rp: 2, perSourceRp: { 'Brodert Quink': 2 } },
    });
    const topic = card();

    // Brodert is exhausted (maxRp 2) while the archives still have room —
    // the per-source cap, not the topic total (which is only 2 of 6).
    expect(
      within(topic).getByRole('button', { name: 'Add a research point to Brodert Quink' })
    ).toBeDisabled();
    const archives = within(topic).getByRole('button', {
      name: 'Add a research point to Turandarok Archives',
    });
    expect(archives).toBeEnabled();

    fireEvent.click(archives);
    const next = lastResearchWrite(session)[TOPIC.id];
    expect(next.perSourceRp).toEqual({ 'Brodert Quink': 2, 'Turandarok Archives': 1 });
    expect(next.rp).toBe(3);
  });

  it('shows unlocked tier text only — a locked tier contributes nothing but its tick', () => {
    mount({ progress: { ...open, rp: 1, perSourceRp: { 'Brodert Quink': 1 } } });
    const topic = card();

    expect(within(topic).getByText('The pit predates the town.')).toBeInTheDocument();
    expect(
      within(topic).queryByText('Arika Avertin remembers the digging.')
    ).not.toBeInTheDocument();
    // No teaser, no remaining-tier count anywhere on the card.
    expect(within(topic).queryByText(/more tier/i)).not.toBeInTheDocument();
    // The reward stays sealed until every tier is unlocked.
    expect(
      within(topic).queryByText('The party learns the safe way down.')
    ).not.toBeInTheDocument();
  });

  it('reveals the crossed tier’s lore entry and logs the crossing, once', () => {
    const { session } = mount({ progress: open });

    fireEvent.click(
      within(card()).getByRole('button', { name: 'Add a research point to Brodert Quink' })
    );

    // Tier 1 carries loreId 'the-pit' (GM-only in the seed above) — revealed
    // by spreading the FULL live doc and changing only `visibility`.
    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(saveDocument).toHaveBeenCalledWith(
      'lore',
      'the-pit',
      expect.objectContaining({ id: 'the-pit', title: 'The Pit', summary: 'A hole.', visibility: 'revealed' })
    );
    expect(lastLogWrite(session)[0]).toEqual(
      expect.objectContaining({ type: 'research', text: 'Research: The Pit reached 1 RP' })
    );
  });

  it('does not re-reveal an already-revealed lore entry', () => {
    // rp 4 → 5 crosses the tier wired to 'arika-avertin', which the seed
    // already has revealed.
    mount({
      progress: {
        ...open,
        rp: 4,
        perSourceRp: { 'Brodert Quink': 2, 'Turandarok Archives': 2 },
      },
    });

    fireEvent.click(
      within(card()).getByRole('button', { name: 'Add a research point to Turandarok Archives' })
    );

    expect(saveDocument).not.toHaveBeenCalled();
    expect(
      within(card()).getByText('Arika Avertin remembers the digging.')
    ).toBeInTheDocument();
  });

  it('clamps the manual total-RP adjust to 0…max', () => {
    const first = mount({ progress: open });
    const minus = within(first.container).getByRole('button', {
      name: 'Remove a research point from The Pit',
    });
    expect(minus).toBeDisabled();

    fireEvent.click(
      within(first.container).getByRole('button', { name: 'Add a research point to The Pit' })
    );
    // Manual fiat moves the topic total without touching perSourceRp.
    const next = lastResearchWrite(first.session)[TOPIC.id];
    expect(next.rp).toBe(1);
    expect(next.perSourceRp).toEqual({});

    // At the ceiling the + is dead (adjustRp clamps to totalMaxRp anyway).
    const ceiling = mount({ progress: { ...open, rp: 6 } });
    expect(
      within(ceiling.container).getByRole('button', { name: 'Add a research point to The Pit' })
    ).toBeDisabled();
  });

  it('shows the reward once every tier is unlocked', () => {
    mount({ progress: { ...open, rp: 6 } });
    expect(
      within(card()).getByText('The party learns the safe way down.')
    ).toBeInTheDocument();
  });

  it('pushes a check by opening the VP challenge modal prefilled from the source', () => {
    mount({ progress: open });
    const topic = card();

    fireEvent.click(within(topic).getAllByRole('button', { name: 'Push a check' })[0]);

    expect(screen.getByLabelText('challenge name')).toHaveValue(
      'Research: The Pit — Brodert Quink'
    );
    expect(screen.getByLabelText('skill 1')).toHaveValue('diplomacy');
    expect(screen.getByLabelText('skill 1 DC')).toHaveValue(19);
    expect(screen.getByLabelText('skill 2')).toHaveValue('society');
    expect(screen.getByLabelText('skill 2 DC')).toHaveValue(17);
  });
});

describe('DockDowntimePane — Reputation (#1850)', () => {
  it('renders the rank chip at exact rank boundaries', () => {
    const low = mountRep({ factions: [{ ...FACTION, reputation: 9 }] });
    expect(within(factionRow(low)).getByText('Neutral')).toBeInTheDocument();

    const high = mountRep({ factions: [{ ...FACTION, reputation: 10 }] });
    expect(within(factionRow(high)).getByText('Friendly')).toBeInTheDocument();
  });

  it('shows the score with no chip when it falls outside every rank', () => {
    const r = mountRep({ factions: [{ ...FACTION, reputation: 51 }] });
    const row = factionRow(r);
    expect(within(row).getByText('51')).toBeInTheDocument();
    expect(within(row).queryByText('Revered')).not.toBeInTheDocument();
    // No rank matched, so no chip element at all — not just an empty one.
    expect(row.querySelector('.dock-dt-rep-rank')).toBeNull();
  });

  it('shows the current rank\'s effect text when present, and omits it when absent', () => {
    const disliked = mountRep({ factions: [{ ...FACTION, reputation: -15 }] });
    expect(
      within(disliked.container).getByText('Prices rise 10% at Consortium-run shops.')
    ).toBeInTheDocument();

    const neutral = mountRep({ factions: [{ ...FACTION, reputation: 0 }] });
    expect(within(factionRow(neutral)).queryByText(/Prices/)).not.toBeInTheDocument();
  });

  it('clamps the steppers at the ladder\'s outer bounds', () => {
    const top = mountRep({ factions: [{ ...FACTION, reputation: 50 }] });
    expect(
      within(factionRow(top)).getByRole('button', { name: `Raise ${FACTION.name} reputation` })
    ).toBeDisabled();

    const bottom = mountRep({ factions: [{ ...FACTION, reputation: -50 }] });
    expect(
      within(factionRow(bottom)).getByRole('button', { name: `Lower ${FACTION.name} reputation` })
    ).toBeDisabled();
  });

  it('falls back to a +-50 ladder for a faction authored with no ranks', () => {
    const r = mountRep({ factions: [{ id: 'unaligned', name: 'Unaligned', reputation: 0 }] });
    const row = factionRow(r, 'unaligned');
    expect(within(row).getByText('0')).toBeInTheDocument();
    expect(row.querySelector('.dock-dt-rep-rank')).toBeNull();
    expect(
      within(row).getByRole('button', { name: 'Raise Unaligned reputation' })
    ).toBeEnabled();
  });

  it('collapses a burst of taps into ONE debounced saveDocument call', () => {
    vi.useFakeTimers();
    try {
      const r = mountRep();
      const raise = within(factionRow(r)).getByRole('button', {
        name: `Raise ${FACTION.name} reputation`,
      });

      fireEvent.click(raise);
      fireEvent.click(raise);
      fireEvent.click(raise);
      // Each tap shows immediately (optimistic) — no write has landed yet.
      expect(within(factionRow(r)).getByText('3')).toBeInTheDocument();
      expect(saveDocument).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(saveDocument).toHaveBeenCalledTimes(1);
      expect(saveDocument).toHaveBeenCalledWith(
        'faction',
        FACTION.id,
        expect.objectContaining({ id: FACTION.id, reputation: 3 })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('logs a rank change once the committed value crosses a boundary', () => {
    vi.useFakeTimers();
    try {
      // Neutral, top edge.
      const r = mountRep({ factions: [{ ...FACTION, reputation: 9 }] });
      fireEvent.click(
        within(factionRow(r)).getByRole('button', { name: `Raise ${FACTION.name} reputation` })
      );

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(lastLogWrite(r.session)[0]).toEqual(
        expect.objectContaining({
          type: 'reputation',
          text: 'Reputation: Scarnetti Consortium rose to Friendly (10)',
        })
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it('stays silent when a committed change lands in the same rank', () => {
    vi.useFakeTimers();
    try {
      // Neutral, interior.
      const r = mountRep({ factions: [{ ...FACTION, reputation: 0 }] });
      fireEvent.click(
        within(factionRow(r)).getByRole('button', { name: `Raise ${FACTION.name} reputation` })
      );

      act(() => {
        vi.advanceTimersByTime(600);
      });

      expect(saveDocument).toHaveBeenCalledTimes(1);
      expect(lastLogWrite(r.session)).toEqual([]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('collapses the mini radar by default and toggles it open', () => {
    const r = mountRep();
    expect(within(r.container).queryByTestId('dock-dt-rep-radar')).not.toBeInTheDocument();

    const toggle = within(r.container).getByRole('button', { name: 'Radar' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(within(r.container).getByTestId('dock-dt-rep-radar')).toBeInTheDocument();
    expect(within(r.container).getByTestId('dock-dt-rep-radar-mock')).toHaveAttribute(
      'data-compact',
      'true'
    );

    fireEvent.click(within(r.container).getByRole('button', { name: 'Hide radar' }));
    expect(within(r.container).queryByTestId('dock-dt-rep-radar')).not.toBeInTheDocument();
  });
});
