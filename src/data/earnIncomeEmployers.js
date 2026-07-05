// Sandpoint Earn Income employers (#1152 S1) — the gazetteer's town economy as
// data. Pure static module, React-free.
//
// The Seven Dooms gazetteer lets any PC Earn Income in Sandpoint (Crafting, a
// Lore, or Performance) up to the town's level (4). Beyond that, ~30 locations
// act as EMPLOYERS: once the party earns that location's NPC support (attitude
// → Helpful), the location offers Earn Income tasks up to its own level using
// Crafting plus the skills named in its entry, sometimes with a circumstance
// bonus or a special condition.
//
// Shape:
//   id      — the Location lore doc id (the same ids shops key off). Every
//             employer already has a lore doc except the Mercantile League
//             office, whose doc lands in #1156 (S4); its id is reserved here.
//   name    — display name.
//   level   — the max Earn Income task level once supported.
//   faction — exact faction name from faction.json (see FACTIONS below); the
//             first-support RP bump is against this faction.
//   skills  — lowercase core-skill ids this location unlocks for Earn Income.
//   lores   — Lore base names it unlocks (no " Lore" suffix; matched by name
//             against a character's loreSkills).
//   anyLore — true when the location accepts most/any Lore (GM discretion),
//             e.g. a school or a scriptorium.
//   bonus   — null | { value, type: 'circumstance'|'item', skills:[…], note }
//             a bonus the GM/player applies by hand (we never auto-add it).
//   note    — null | short paraphrased flavor/clarification.
//   risk    — null | short paraphrased warning (illicit work, conditional support).
//
// Notes are paraphrased mechanics summaries — no verbatim gazetteer prose lives
// in this public repo (same rule as the room/event import capture guard).

// Faction names, verbatim from faction.json, so employer.faction stays in sync
// (the data test asserts membership). Note the data's "Merchantile" spelling.
export const FACTIONS = {
  cathedral: 'Sandpoint Cathedral',
  mercantile: 'Sandpoint Merchantile League',
  scarnetti: 'Scarnetti Consortium',
  bunyip: 'The Bunyip Club',
  townWatch: 'Town Watch',
  townsfolk: 'Townsfolk',
  runewatchers: 'Runewatchers',
};

// The freelance "anywhere in town" option every PC always has, with no support
// required. Not a location; id is a sentinel the resolver treats specially.
export const FREELANCE_ID = 'freelance';

export const FREELANCE = {
  id: FREELANCE_ID,
  name: 'Freelance (around Sandpoint)',
  level: 4, // the town's own level caps unsupported work
  faction: null,
  skills: ['crafting', 'performance', 'thievery'],
  lores: [],
  anyLore: true, // any trained Lore
  bonus: null,
  note: 'Open to anyone, no support needed: Crafting, any Lore, or Performance.',
  risk: 'Thievery here is petty crime — on a failure you can drop the pay to slip away, but a critical failure means getting caught, and each capture costs the party Reputation.',
};

export const EARN_INCOME_EMPLOYERS = [
  {
    id: 'sandpoint-boneyard',
    name: 'Sandpoint Boneyard',
    level: 3,
    faction: FACTIONS.cathedral,
    skills: ['religion'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Assistant caretaker work for the gravedigger.',
    risk: null,
  },
  {
    id: 'the-white-deer',
    name: 'The White Deer',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['survival'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Hunt game to deliver to the tavern kitchen.',
    risk: null,
  },
  {
    id: 'the-way-north',
    name: 'The Way North',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Scouting'],
    anyLore: false,
    bonus: null,
    note: 'Draw new maps to sell — Scouting Lore or any terrain-based Lore qualifies.',
    risk: null,
  },
  {
    id: 'sandpoint-locksmith',
    name: 'Locksmith',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['thievery'],
    lores: [],
    anyLore: false,
    bonus: {
      value: 1,
      type: 'item',
      skills: ['crafting', 'thievery'],
      note: 'On-site, the shop tools give +1 item on Crafting and Thievery checks involving locks.',
    },
    note: 'Troubleshoot the locksmith’s creations with Thievery.',
    risk: null,
  },
  {
    id: 'sandpoint-garrison',
    name: 'Sandpoint Garrison',
    level: 5,
    faction: FACTIONS.townWatch,
    skills: ['society'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Join the town militia and patrol the streets (Society).',
    risk: null,
  },
  {
    id: 'risas-place',
    name: 'Risa’s Place',
    level: 3,
    faction: FACTIONS.mercantile,
    skills: ['occultism', 'religion'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Entertain patrons with fanciful tales (Occultism or Religion).',
    risk: null,
  },
  {
    id: 'red-dog-smithy',
    name: 'Red Dog Smithy',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['athletics'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Haul wares and work the forge (Athletics).',
    risk: null,
  },
  {
    id: 'pillbugs-pantry',
    name: 'The Pillbug’s Pantry',
    level: 6,
    faction: FACTIONS.bunyip,
    skills: ['deception'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Spread flattering rumors to bolster the alchemist’s reputation (Deception).',
    risk: 'Criminal work for a Bunyip Club member.',
  },
  {
    id: 'bottled-solutions',
    name: 'Bottled Solutions',
    level: 3,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Accounting', 'Library', 'Mercantile'],
    anyLore: false,
    bonus: null,
    note: 'Keep the shop organized (Accounting, Library, or Mercantile Lore).',
    risk: null,
  },
  {
    id: 'sandpoint-savories',
    name: 'Sandpoint Savories',
    level: 5,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Baking', 'Cooking'],
    anyLore: false,
    bonus: null,
    note: 'Bake for the shop (Baking or Cooking Lore).',
    risk: null,
  },
  {
    id: 'the-curious-goblin',
    name: 'The Curious Goblin',
    level: 5,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Scribing'],
    anyLore: false,
    bonus: null,
    note: 'Copy books for sale (Scribing Lore). With support you can also sell your own writing using any Lore, but only once per week.',
    risk: null,
  },
  {
    id: 'sandpoint-theater',
    name: 'Sandpoint Theater',
    level: 6,
    faction: FACTIONS.runewatchers,
    skills: ['performance'],
    lores: ['Theater'],
    anyLore: false,
    bonus: null,
    note: 'Play minor roles (Performance) or work backstage (Theater Lore). Rack up crit successes on stage to earn starring roles at a higher task level.',
    risk: null,
  },
  {
    id: 'carpenters-guild',
    name: 'Carpenter’s Guild',
    level: 5,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Accounting', 'Architecture', 'Engineering', 'Guild'],
    anyLore: false,
    bonus: null,
    note: 'Keep records and work orders (Accounting, Architecture, Engineering, or Guild Lore).',
    risk: null,
  },
  {
    id: 'sandpoint-lumber-mill',
    name: 'Sandpoint Lumber Mill',
    level: 3,
    faction: FACTIONS.scarnetti,
    skills: ['athletics'],
    lores: ['Labor', 'Forest'],
    anyLore: false,
    bonus: null,
    note: 'Work as a logger (Athletics, Labor Lore, or Forest Lore).',
    risk: null,
  },
  {
    id: 'turandarok-academy',
    name: 'Turandarok Academy',
    level: 6,
    faction: FACTIONS.runewatchers,
    skills: [],
    lores: [],
    anyLore: true,
    bonus: null,
    note: 'Help teach classes using most Lore skills (GM’s discretion).',
    risk: null,
  },
  {
    id: 'grocers-hall',
    name: 'Grocer’s Hall',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['society'],
    lores: ['Mercantile'],
    anyLore: false,
    bonus: null,
    note: 'Grocer work (Mercantile Lore) or support the guild in the hinterlands (Society).',
    risk: null,
  },
  {
    id: 'wheens-wagons',
    name: 'Wheen’s Wagons',
    level: 3,
    faction: FACTIONS.mercantile,
    skills: ['society'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Run deliveries around town (Society).',
    risk: null,
  },
  {
    id: 'scarnetti-mill',
    name: 'Scarnetti Mill',
    level: 3,
    faction: FACTIONS.scarnetti,
    skills: ['deception'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Quietly undermine Scarnetti influence for the foreman (Deception).',
    risk: 'The work only holds while the Scarnettis stay unsuspecting.',
  },
  {
    id: 'the-hagfish',
    name: 'The Hagfish',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['diplomacy'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Officiate the tavern’s boasting and yarning contests (Diplomacy).',
    risk: null,
  },
  {
    id: 'valdemar-fish-market',
    name: 'Valdemar Fish Market',
    level: 5,
    faction: FACTIONS.mercantile,
    skills: ['survival'],
    lores: ['Fishing'],
    anyLore: false,
    bonus: null,
    note: 'Sell the daily catch (Fishing Lore or Survival).',
    risk: null,
  },
  {
    id: 'the-rusty-dragon',
    name: 'The Rusty Dragon',
    level: 5,
    faction: FACTIONS.mercantile,
    skills: ['performance'],
    lores: [],
    anyLore: false,
    bonus: {
      value: 1,
      type: 'circumstance',
      skills: ['performance'],
      note: '+1 circumstance when the performance is a rousing tale of adventure.',
    },
    note: 'Perform for the inn’s guests (Performance).',
    risk: null,
  },
  {
    id: 'goblin-squash-stables',
    name: 'Goblin Squash Stables',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['nature'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Care for and groom the horses (Nature).',
    risk: null,
  },
  {
    id: 'two-knight-brewing',
    name: 'Two Knight Brewery',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Alcohol'],
    anyLore: false,
    bonus: null,
    note: 'Assist the brewing (Alcohol Lore).',
    risk: null,
  },
  {
    id: 'mercantile-league',
    name: 'Mercantile League',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['society'],
    lores: ['Accounting', 'Legal', 'Mercantile', 'Scribing'],
    anyLore: false,
    bonus: null,
    note: 'League office work (Accounting, Legal, Mercantile, or Scribing Lore, or Society).',
    risk: null,
  },
  {
    id: 'sandpoint-boutique',
    name: 'Sandpoint Boutique',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['society'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Help restock consignment and salvaged goods (Society).',
    risk: null,
  },
  {
    id: 'fatmans-feedbag',
    name: 'The Feedbag',
    level: 5,
    faction: FACTIONS.bunyip,
    skills: ['thievery'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Sanctioned petty theft — a cut goes to the Bunyip Club, and a failure no longer risks getting caught.',
    risk: 'A critical failure means probation until you pay a fine (level × 10 gp) and costs you the Feedbag’s support.',
  },
  {
    id: 'hannahs',
    name: 'Hannah’s',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: ['nature', 'survival'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Gather herbs from the hinterlands (Nature or Survival).',
    risk: null,
  },
  {
    id: 'sandpoint-shipyard',
    name: 'Sandpoint Shipyard',
    level: 4,
    faction: FACTIONS.mercantile,
    skills: [],
    lores: ['Engineering', 'Labor', 'Sailing'],
    anyLore: false,
    bonus: null,
    note: 'Shipyard work (Engineering, Labor, or Sailing Lore).',
    risk: null,
  },
  {
    id: 'scarnetti-manor',
    name: 'Scarnetti Manor',
    level: 4,
    faction: FACTIONS.scarnetti,
    skills: ['deception'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Spread flattering misinformation about the Scarnettis (Deception).',
    risk: 'Only available while the party supports no other municipal site.',
  },
  {
    id: 'kaijitsu-manor',
    name: 'Kaijitsu Manor',
    level: 5,
    faction: FACTIONS.townsfolk,
    skills: ['society'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Odd jobs keeping the town looking vibrant (Society).',
    risk: null,
  },
  {
    id: 'deverin-manor',
    name: 'Deverin Manor',
    level: 6,
    faction: FACTIONS.townsfolk,
    skills: ['diplomacy'],
    lores: [],
    anyLore: false,
    bonus: null,
    note: 'Aid the mayor with political tasks (Diplomacy).',
    risk: null,
  },
];

// Employers grouped by faction, in the FACTIONS declaration order, for the GM
// Town Support panel. Returns [{ faction, employers: [...] }], factions with no
// employers omitted.
export function employersByFaction() {
  const order = Object.values(FACTIONS);
  return order
    .map((faction) => ({
      faction,
      employers: EARN_INCOME_EMPLOYERS.filter((e) => e.faction === faction),
    }))
    .filter((g) => g.employers.length > 0);
}

// Look up a single employer (or freelance) by id.
export function employerById(id) {
  if (id === FREELANCE_ID) return FREELANCE;
  return EARN_INCOME_EMPLOYERS.find((e) => e.id === id) || null;
}
