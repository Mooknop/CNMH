import React from 'react';
import { fireEvent, screen, within } from '@testing-library/react';
import { renderWithProviders, makeCharacter } from '../../test/renderWithProviders';
import { saveDocument } from '../../utils/gmApi';
import DockDowntimePane from './DockDowntimePane';

// GM Command Dock — Downtime pane (#1841, epic #206 S3). Everything runs
// against the REAL provider stack: `research` topics ride ContentProvider's
// initialContent seam, party progress rides the in-memory session bus through
// the real useSyncedState, and the RP math is the real utils/research.js. The
// only mock is the GM content API (a network call) — spread from the original
// module so a new export can't break this factory.
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

const progressState = (entry) => ({
  global: entry ? { research: { [TOPIC.id]: entry } } : {},
});

const mount = ({ topics = [TOPIC], progress, ...rest } = {}) =>
  renderWithProviders(<DockDowntimePane />, {
    content: {
      research: topics,
      lore: LORE,
      character: [makeCharacter({ id: 'pc-1', name: 'Pellias' })],
    },
    session: { state: progressState(progress) },
    ...rest,
  });

const card = () => screen.getByTestId(`dock-dt-topic-${TOPIC.id}`);

const lastResearchWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'research')?.value ?? null;

const lastLogWrite = (session) =>
  [...session.sent].reverse().find((s) => s.stateType === 'sessionlog')?.value ?? [];

const open = { available: true, rp: 0, perSourceRp: {} };

beforeEach(() => {
  window.localStorage.clear();
  saveDocument.mockResolvedValue({});
});

describe('DockDowntimePane (#1841)', () => {
  it('shows an import hint when there are no research topics', () => {
    mount({ topics: [] });
    expect(screen.getByRole('status')).toHaveTextContent(/research topic import CLI/i);
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
    const { session } = mount({ progress: open });
    const minus = within(card()).getByRole('button', {
      name: 'Remove a research point from The Pit',
    });
    expect(minus).toBeDisabled();

    fireEvent.click(
      within(card()).getByRole('button', { name: 'Add a research point to The Pit' })
    );
    // Manual fiat moves the topic total without touching perSourceRp.
    const next = lastResearchWrite(session)[TOPIC.id];
    expect(next.rp).toBe(1);
    expect(next.perSourceRp).toEqual({});

    // At the ceiling the + is dead (adjustRp clamps to totalMaxRp anyway).
    mount({ progress: { ...open, rp: 6 } });
    const [, ceiling] = screen.getAllByTestId(`dock-dt-topic-${TOPIC.id}`);
    expect(
      within(ceiling).getByRole('button', { name: 'Add a research point to The Pit' })
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
