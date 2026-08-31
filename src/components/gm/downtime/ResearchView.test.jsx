import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders } from '../../../test/renderWithProviders';
import { saveDocument } from '../../../utils/gmApi';
import ResearchView from './ResearchView';

// Downtime dock — Research view (#1841, epic #206 S3; list + detail re-layout
// #1854). Split out of DockDowntimePane.test.jsx when the view moved from a
// single scrolling card column to a 320px topic-list + detail-pane split.
// Runs against the REAL provider stack: `research` topic docs and `lore`
// entries ride ContentProvider's `initialContent` seam, party research
// progress rides the in-memory session bus through the real `useSyncedState`,
// and the RP/tier math is the real utils/research.js. The only mock is the GM
// content API (a network call, spread from the original module so a new
// export can't break this factory).
vi.mock('../../../utils/gmApi', async (importOriginal) => ({
  ...(await importOriginal()),
  saveDocument: vi.fn(),
}));

const TOPIC = {
  id: 'the-pit-research',
  title: 'The Pit',
  level: 3,
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

const TOPIC_2 = {
  id: 'other-topic',
  title: 'Something Else',
  level: 1,
  sources: [{ name: 'A Source', maxRp: 3, checks: [] }],
  unlocks: [],
};

const LORE = [
  { id: 'the-pit', title: 'The Pit', category: 'Places', summary: 'A hole.', visibility: 'gm' },
  { id: 'arika-avertin', title: 'Arika Avertin', category: 'People', visibility: 'revealed' },
];

const open = { available: true, rp: 0, perSourceRp: {} };

const sessionState = (progress) => ({
  global: progress ? { research: progress } : {},
});

const mount = ({ topics = [TOPIC], progress, ...rest } = {}) =>
  renderWithProviders(<ResearchView />, {
    content: { research: topics, lore: LORE },
    session: { state: sessionState(progress) },
    ...rest,
  });

const lastResearchWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'research')?.value ?? null;

const lastLogWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'sessionlog')?.value ?? [];

const detail = (id = TOPIC.id) => screen.getByTestId(`dock-dt-topic-${id}`);

beforeEach(() => {
  window.localStorage.clear();
  saveDocument.mockResolvedValue({});
});

describe('ResearchView — empty state (#1841)', () => {
  it('offers the Research editor as the primary path when no topics exist', () => {
    mount({ topics: [] });
    const links = screen.getAllByRole('link', { name: /research editor|manage topics/i });
    expect(links.length).toBeGreaterThanOrEqual(2);
    links.forEach((l) => expect(l).toHaveAttribute('href', '/gm/world/research'));
    expect(screen.getByRole('status')).toHaveTextContent(/no research topics yet/i);
  });

  it('keeps the bulk-import hint in the empty state', () => {
    mount({ topics: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/importResearchTopicsCli/);
  });

  it('header links to the Research editor when topics exist', () => {
    mount({ progress: { [TOPIC.id]: open } });
    expect(screen.getByRole('link', { name: /manage topics/i })).toHaveAttribute(
      'href',
      '/gm/world/research'
    );
  });
});

describe('ResearchView — list + detail selection (#1854)', () => {
  it('defaults the detail pane to the first open topic and shows its sources/chips', () => {
    mount({ progress: { [TOPIC.id]: open } });
    const panel = detail();

    expect(within(panel).getByText('The Pit')).toBeInTheDocument();
    expect(within(panel).getByText('Level 3')).toBeInTheDocument();
    expect(within(panel).getByText('Brodert Quink')).toBeInTheDocument();
    expect(within(panel).getByText('Turandarok Archives')).toBeInTheDocument();
    expect(within(panel).getByText('Diplomacy 19')).toBeInTheDocument();
    expect(within(panel).getByText('Society 17')).toBeInTheDocument();
    expect(within(panel).getByText('5 sp per day')).toBeInTheDocument();
    expect(within(panel).getByLabelText('0 of 6 research points')).toBeInTheDocument();

    // The corresponding list card is marked active.
    expect(screen.getByTestId(`dock-dt-topic-list-${TOPIC.id}`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
  });

  it('shows the summary counts and per-topic tier-found line in the list', () => {
    mount({
      progress: { [TOPIC.id]: { ...open, rp: 1, perSourceRp: { 'Brodert Quink': 1 } } },
    });
    expect(screen.getByText('1 open · 0 not yet open')).toBeInTheDocument();
    expect(
      within(screen.getByTestId(`dock-dt-topic-list-${TOPIC.id}`)).getByText('1 of 2 tiers found')
    ).toBeInTheDocument();
  });

  it('selecting a different open topic swaps the detail pane instantly', () => {
    mount({
      topics: [TOPIC, TOPIC_2],
      progress: { [TOPIC.id]: open, [TOPIC_2.id]: open },
    });
    expect(within(detail()).getByText('The Pit')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`dock-dt-topic-list-${TOPIC_2.id}`));

    expect(screen.getByTestId(`dock-dt-topic-list-${TOPIC_2.id}`)).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByTestId(`dock-dt-topic-list-${TOPIC.id}`)).toHaveAttribute(
      'aria-pressed',
      'false'
    );
    const panel = detail(TOPIC_2.id);
    expect(within(panel).getByText('Something Else')).toBeInTheDocument();
    expect(within(panel).queryByText('The Pit')).not.toBeInTheDocument();
  });
});

describe('ResearchView — locked topics (#1854)', () => {
  it('renders a locked topic as a dashed chip, not a detail target', () => {
    mount();
    // No open topics — the detail column says so instead of showing a card.
    expect(screen.getByText(/no topics are open to the party yet/i)).toBeInTheDocument();

    const chip = screen.getByTestId(`dock-dt-topic-${TOPIC.id}`);
    expect(within(chip).getByText('The Pit')).toBeInTheDocument();
    expect(chip).toHaveAttribute('aria-checked', 'false');
    expect(chip).toHaveAttribute('aria-label', 'The Pit available to the party');
    // The chip itself carries no source/tier content — it is not a detail surface.
    expect(within(chip).queryByText('Brodert Quink')).not.toBeInTheDocument();
  });

  it('tapping a locked chip opens the topic and it becomes the shown detail', () => {
    const { session } = mount();
    const chip = screen.getByTestId(`dock-dt-topic-${TOPIC.id}`);

    fireEvent.click(chip);

    expect(lastResearchWrite(session)[TOPIC.id].available).toBe(true);
    const panel = detail();
    expect(within(panel).getByText('Brodert Quink')).toBeInTheDocument();
    expect(
      within(panel).getByRole('switch', { name: 'The Pit available to the party' })
    ).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling the selected topic closed drops it out of the detail pane', () => {
    mount({ progress: { [TOPIC.id]: open } });
    const toggle = within(detail()).getByRole('switch', {
      name: 'The Pit available to the party',
    });

    fireEvent.click(toggle);

    expect(screen.getByText(/no topics are open to the party yet/i)).toBeInTheDocument();
    expect(screen.getByTestId(`dock-dt-topic-${TOPIC.id}`)).toHaveAttribute(
      'aria-checked',
      'false'
    );
  });
});

describe('ResearchView — RP accrual (#1841)', () => {
  it('accrues RP per source and disables the stepper at that source’s own cap', () => {
    const { session } = mount({
      progress: { [TOPIC.id]: { ...open, rp: 2, perSourceRp: { 'Brodert Quink': 2 } } },
    });
    const panel = detail();

    // Brodert is exhausted (maxRp 2) while the archives still have room — the
    // per-source cap, not the topic total (which is only 2 of 6).
    expect(
      within(panel).getByRole('button', { name: 'Add a research point to Brodert Quink' })
    ).toBeDisabled();
    const archives = within(panel).getByRole('button', {
      name: 'Add a research point to Turandarok Archives',
    });
    expect(archives).toBeEnabled();

    fireEvent.click(archives);
    const next = lastResearchWrite(session)[TOPIC.id];
    expect(next.perSourceRp).toEqual({ 'Brodert Quink': 2, 'Turandarok Archives': 1 });
    expect(next.rp).toBe(3);
  });

  it('clamps the manual total-RP adjust to 0…max', () => {
    const first = mount({ progress: { [TOPIC.id]: open } });
    const minus = within(detail()).getByRole('button', {
      name: 'Remove a research point from The Pit',
    });
    expect(minus).toBeDisabled();

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Add a research point to The Pit' })
    );
    // Manual fiat moves the topic total without touching perSourceRp.
    const next = lastResearchWrite(first.session)[TOPIC.id];
    expect(next.rp).toBe(1);
    expect(next.perSourceRp).toEqual({});

    // At the ceiling the + is dead (adjustRp clamps to totalMaxRp anyway).
    // Scoped to its own container — the first mount's tree is still in the
    // document (RTL doesn't unmount between renders within one test), so an
    // unscoped `screen` query here would see both trees' matching testid.
    const ceiling = mount({ progress: { [TOPIC.id]: { ...open, rp: 6 } } });
    expect(
      within(ceiling.container).getByRole('button', {
        name: 'Add a research point to The Pit',
      })
    ).toBeDisabled();
  });
});

describe('ResearchView — tier reveal + reward gating (#1841)', () => {
  it('shows unlocked tier text only — a locked tier contributes nothing but its tick', () => {
    mount({
      progress: {
        [TOPIC.id]: { ...open, rp: 1, perSourceRp: { 'Brodert Quink': 1 } },
      },
    });
    const panel = detail();

    expect(within(panel).getByText('The pit predates the town.')).toBeInTheDocument();
    expect(
      within(panel).queryByText('Arika Avertin remembers the digging.')
    ).not.toBeInTheDocument();
    expect(within(panel).queryByText(/more tier/i)).not.toBeInTheDocument();
    expect(
      within(panel).queryByText('The party learns the safe way down.')
    ).not.toBeInTheDocument();
  });

  it('reveals the crossed tier’s lore entry and logs the crossing, once', () => {
    const { session } = mount({ progress: { [TOPIC.id]: open } });

    fireEvent.click(
      within(detail()).getByRole('button', { name: 'Add a research point to Brodert Quink' })
    );

    expect(saveDocument).toHaveBeenCalledTimes(1);
    expect(saveDocument).toHaveBeenCalledWith(
      'lore',
      'the-pit',
      expect.objectContaining({
        id: 'the-pit',
        title: 'The Pit',
        summary: 'A hole.',
        visibility: 'revealed',
      })
    );
    expect(lastLogWrite(session)[0]).toEqual(
      expect.objectContaining({ type: 'research', text: 'Research: The Pit reached 1 RP' })
    );
  });

  it('does not re-reveal an already-revealed lore entry', () => {
    mount({
      progress: {
        [TOPIC.id]: {
          ...open,
          rp: 4,
          perSourceRp: { 'Brodert Quink': 2, 'Turandarok Archives': 2 },
        },
      },
    });

    fireEvent.click(
      within(detail()).getByRole('button', {
        name: 'Add a research point to Turandarok Archives',
      })
    );

    expect(saveDocument).not.toHaveBeenCalled();
    expect(
      within(detail()).getByText('Arika Avertin remembers the digging.')
    ).toBeInTheDocument();
  });

  it('shows the reward once every tier is unlocked', () => {
    mount({ progress: { [TOPIC.id]: { ...open, rp: 6 } } });
    expect(
      within(detail()).getByText('The party learns the safe way down.')
    ).toBeInTheDocument();
  });
});

describe('ResearchView — Push a check (#1841)', () => {
  it('opens the VP challenge modal prefilled from the source', () => {
    mount({ progress: { [TOPIC.id]: open } });
    const panel = detail();

    fireEvent.click(within(panel).getAllByRole('button', { name: 'Push a check' })[0]);

    expect(screen.getByLabelText('challenge name')).toHaveValue(
      'Research: The Pit — Brodert Quink'
    );
    expect(screen.getByLabelText('skill 1')).toHaveValue('diplomacy');
    expect(screen.getByLabelText('skill 1 DC')).toHaveValue(19);
    expect(screen.getByLabelText('skill 2')).toHaveValue('society');
    expect(screen.getByLabelText('skill 2 DC')).toHaveValue(17);
  });
});
