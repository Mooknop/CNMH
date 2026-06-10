/**
 * Timeline utilities for organizing and displaying history entries
 */

/**
 * Relative age periods for grouping history entries
 * Defines the time ranges and labels for timeline groupings
 */
const AGE_PERIODS = [
  {
    key: 'age-of-lost-omens',
    label: 'Age of Lost Omens',
    minYear: 4606,
    maxYear: Infinity,
  },
  {
    key: 'age-of-enthronement',
    label: 'Age of Enthronement',
    minYear: 1,
    maxYear: 4606,
  },
  {
    key: 'age-of-destiny',
    label: 'Age of Destiny',
    minYear: -3470,
    maxYear: 1,
  },
  {
    key: 'age-of-anguish',
    label: 'Age of Anguish',
    minYear: -4294,
    maxYear: -3470,
  },
  {
    key: 'age-of-darkness',
    label: 'Age of Darkness',
    minYear: -5293,
    maxYear: -4294,
  },
  {
    key: 'age-before-ages',
    label: 'Age Before Ages',
    minYear: -Infinity,
    maxYear: -5293,
  },
];

/**
 * Gets the age period for a given year
 * @param {number} year - The year in AR
 * @returns {object} The age period object with key and label
 */
export const getAgePeriod = (year) => {
  return AGE_PERIODS.find((period) => year >= period.minYear && year < period.maxYear) || AGE_PERIODS[0];
};

/**
 * Filters lore entries to get only History category entries
 * @param {array} loreEntries - All lore entries
 * @returns {array} History entries only
 */
export const getHistoryEntries = (loreEntries) => {
  return loreEntries.filter((entry) => entry.category === 'History');
};

/**
 * Groups history entries by their age period
 * @param {array} entries - History entries to group
 * @returns {object} Entries grouped by period key
 */
export const groupByAgePeriod = (entries) => {
  const grouped = {};

  AGE_PERIODS.forEach((period) => {
    grouped[period.key] = {
      label: period.label,
      entries: entries.filter((entry) => {
        const year = entry.dateArStart || 0;
        return year >= period.minYear && year < period.maxYear;
      }),
    };
  });

  return grouped;
};

/**
 * Sorts history entries newest-to-oldest
 * @param {array} entries - Entries to sort
 * @returns {array} Sorted entries (newest first)
 */
export const sortByDateNewestFirst = (entries) => {
  return [...entries].sort((a, b) => {
    const yearA = a.dateArStart || 0;
    const yearB = b.dateArStart || 0;
    return yearB - yearA; // Newest first (descending)
  });
};

/**
 * Gets a formatted date label for a history entry
 * @param {object} entry - History entry
 * @returns {string} Formatted date label
 */
export const getDateLabel = (entry) => {
  if (!entry.dateArStart && !entry.dateArEnd) {
    return 'Unknown Date';
  }

  const start = entry.dateArStart;
  const end = entry.dateArEnd;

  if (start === end || !end) {
    if (start < 0) {
      return `${Math.abs(start)} years before AR`;
    }
    return `${start} AR`;
  }

  if (start < 0 && end < 0) {
    return `${Math.abs(end)}-${Math.abs(start)} years before AR`;
  }
  if (start < 0) {
    return `${Math.abs(start)} years before AR - ${end} AR`;
  }
  return `${start}-${end} AR`;
};

/**
 * Transforms timeline data into a structured format for rendering
 * @param {array} loreEntries - All lore entries
 * @returns {object} Timeline data grouped by age period
 */
export const buildTimelineData = (loreEntries) => {
  const historyEntries = getHistoryEntries(loreEntries);

  // Sort newest-to-oldest, then group by age period
  const groupedByPeriod = groupByAgePeriod(sortByDateNewestFirst(historyEntries));

  const timeline = AGE_PERIODS.map((period) => {
    const periodData = groupedByPeriod[period.key];
    return {
      periodKey: period.key,
      periodLabel: period.label,
      entries: periodData.entries || [],
    };
  });

  return {
    periods: timeline,
    totalEntries: historyEntries.length,
  };
};

/**
 * Gets all related entries for a given entry
 * @param {object} entry - The entry to get relations for
 * @param {array} loreEntries - All lore entries
 * @returns {array} Related entries
 */
export const getRelatedEntries = (entry, loreEntries) => {
  if (!entry.related || entry.related.length === 0) {
    return [];
  }

  return entry.related
    .map((id) => loreEntries.find((e) => e.id === id))
    .filter((e) => e !== undefined);
};
