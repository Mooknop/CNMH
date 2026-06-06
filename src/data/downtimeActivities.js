// Downtime activities the party can pursue while the GM has set a downtime
// period. Mirrors explorationActivities.js so DowntimeList can reuse the same
// filter/highlight helpers (requiresFlag / requiresAnyFlag / requiresTrainedInAny
// / highlightSkills via explorationUtils).
//
// type:
//   'instant'    — one roll consumes a full 8-hour block in one go (Earn Income).
//   'accumulate' — banks hours toward `benchmarkHours` across multiple blocks
//                  (Retrain / Research / Crafting).
//
// The *end results* of these activities (gold earned, finished item, retrained
// option, research unlocked) are intentionally out of scope for now;
// `benchmarkHours` is a soft display hint, not enforced completion logic.

export const DOWNTIME_ACTIVITY_TYPES = ['instant', 'accumulate'];

export const DOWNTIME_ACTIVITIES = [
  {
    name: 'Earn Income',
    type: 'instant',
    traits: ['Downtime'],
    skill: 'Lore / Crafting (varies)',
    highlightSkills: ['crafting'],
    mechanics: {
      note: 'One roll consumes a full 8-hour block. Each day you Earn Income is a separate roll.',
    },
    description:
      'You use one of your skills to earn money during downtime. The GM assigns a task of a given level; you attempt a check against its DC. Each day spent earning income is a single roll that takes the full working day.',
  },
  {
    name: 'Retrain',
    type: 'accumulate',
    benchmarkHours: 8,
    traits: ['Downtime'],
    mechanics: {
      note: 'Spend downtime hours retraining a feat, skill, or other choice; progress accumulates until the benchmark is met.',
    },
    description:
      'You spend downtime reworking a character choice — retraining a feat, swapping a skill increase, or changing a class option. Retraining takes a stretch of dedicated downtime; hours accumulate until the required time has been spent.',
  },
  {
    name: 'Research',
    type: 'accumulate',
    benchmarkHours: 8,
    traits: ['Downtime', 'Secret'],
    mechanics: {
      note: 'Bank hours of study toward a research goal until the benchmark is met.',
    },
    description:
      'You study a subject, comb a library, or investigate a mystery over time. Each block of study banks hours toward uncovering what you are looking for; the GM sets how much research a given topic requires.',
  },
  {
    name: 'Crafting',
    type: 'accumulate',
    benchmarkHours: 8,
    traits: ['Downtime', 'Manipulate'],
    skill: 'Crafting',
    highlightSkills: ['crafting'],
    requiresTrainedInAny: ['crafting'],
    mechanics: {
      note: 'Spend hours at the workbench from a formula you know; progress accumulates until the benchmark is met.',
    },
    description:
      'You spend downtime crafting an item you have the formula for and the raw materials to build. Crafting takes hours of focused work that accumulate toward completing the item. Browse your known recipes below.',
  },
];
