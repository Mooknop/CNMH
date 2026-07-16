import { HistoryTimeline } from 'chaotic-neutral-milk-hotel';

// The app is dark throughout — the timeline sits on the shell surface.
//
// CAPTURE NOTE: the component unconditionally renders ALL SIX Golarion age
// periods, each with a long era description from eras.json (~4000px tall in
// total), while the capture viewport is a fixed 900x700. Each story therefore
// scopes the render to ONE period (display:none on the others) and zooms
// slightly so a complete period — header, era description, spine, entries —
// fits the shot. The markup inside the kept period is untouched.
const Shell = ({ children }: { children?: any }) => (
  <div
    style={{
      background: 'var(--shell-bg)',
      color: 'var(--shell-text-primary)',
      fontFamily: 'var(--font-ui)',
      padding: '16px',
      borderRadius: '10px',
    }}
  >
    {children}
  </div>
);

// Period order: 1 Lost Omens, 2 Enthronement, 3 Destiny, 4 Anguish,
// 5 Darkness, 6 Before Ages.
const OnePeriod = ({ n, zoom, cls, children }: { n: number; zoom: number; cls: string; children?: any }) => (
  <div className={cls} style={{ zoom }}>
    <style>{`.${cls} .timeline-period:not(:nth-of-type(${n})) { display: none; } .${cls} .timeline-period { margin-bottom: 0; }`}</style>
    {children}
  </div>
);

// Realistic campaign-history lore entries (category 'History' is what the
// timeline filters on; dateArStart drives the age-period grouping).
const loreEntries = [
  {
    id: 'swallowtail-raid',
    category: 'History',
    title: 'The Swallowtail Festival Raid',
    dateArStart: 4707,
    summary:
      'Goblins of the Thistletop tribe raid Sandpoint during the consecration of the rebuilt cathedral, burning carts and stealing the remains of Father Tobyn.',
    content: '',
    related: ['late-unpleasantness'],
  },
  {
    id: 'late-unpleasantness',
    category: 'History',
    title: 'The Late Unpleasantness',
    dateArStart: 4702,
    summary:
      'The murderer known as Chopper stalks Sandpoint, and a fire guts the town chapel — a dark year the locals still speak of only in whispers.',
    content: '',
    related: [],
  },
  {
    id: 'death-of-aroden',
    category: 'History',
    title: 'The Death of Aroden',
    dateArStart: 4606,
    summary:
      'The Last Azlanti dies on the eve of his prophesied return. Prophecy itself fails, and the Age of Lost Omens begins.',
    content: '',
    related: [],
  },
  {
    id: 'earthfall',
    category: 'History',
    title: 'Earthfall',
    dateArStart: -5293,
    summary:
      'The Starstone crashes into Golarion, drowning Azlant and burying the runelord empire of Thassilon beneath ash and ruin.',
    content: '',
    related: [],
  },
  {
    id: 'gap-of-anguish-record',
    category: 'History',
    title: 'Survivors Scatter Across Avistan',
    dateArStart: -4290,
    summary:
      'Refugee clans emerge from the Darklands and the ruins of Thassilon, resettling the Varisian coast in the wake of the long dark.',
    content: '',
    related: [],
  },
];

export const AgeOfLostOmens = () => (
  <Shell>
    <OnePeriod n={1} zoom={0.62} cls="ht-lost-omens">
      <HistoryTimeline loreEntries={loreEntries} />
    </OnePeriod>
  </Shell>
);

export const AgeOfDarkness = () => (
  <Shell>
    <OnePeriod n={5} zoom={0.85} cls="ht-darkness">
      <HistoryTimeline loreEntries={loreEntries} />
    </OnePeriod>
  </Shell>
);

export const EmptyPeriod = () => (
  <Shell>
    <OnePeriod n={4} zoom={0.85} cls="ht-anguish">
      <HistoryTimeline loreEntries={[]} />
    </OnePeriod>
  </Shell>
);
