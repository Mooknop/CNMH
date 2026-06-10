// useCastingResources — one hook wrapping every pool a cast can be paid from:
// spell slots, focus points, staff charges, wand daily uses, and consumable
// (scroll) quantities. UseAbilityModal uses it to offer/spend the casting cost;
// the per-list pip components remain the manual remediation surface and MUST
// stay in sync, so the keys and initial-value expressions here mirror
// SpellsRepertoire / FocusSpellsList / StaffSpells / WandSpells exactly.
//
// Consumables use the player-writable overlay key `cnmh_consumed_<charId>`
// ({ [itemName]: consumedCount }) because inventory itself is GM-gated content.

import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useCharacter } from './useCharacter';
import { getFocusInfo } from '../utils/SpellUtils';

const EMPTY_SLOTS = {};

const wandKeyFor = (spell) => spell.wandName || spell.id;

/**
 * @param {Object|null} character - Raw character object
 * @returns {{
 *   slots:       { totals: Object, remainingFor: (rank) => number, spend: (rank) => void },
 *   focus:       { max: number, remaining: number, spend: () => void },
 *   staff:       { max: number, remaining: number, spend: (n) => void },
 *   wands:       { stateFor: (key) => string, spend: (key) => void },
 *   consumables: { remainingFor: (name) => number, spend: (name) => void, restore: (name) => void, map: Object },
 *   optionsFor:  (spell, castSource) => Array<{type, label, enabled, rank?, key?, reason?}>,
 *   spend:       (option) => { ok: boolean, label: string|null },
 * }}
 */
export const useCastingResources = (character) => {
  const charId = character?.id || 'unknown';
  const { staff, scrollItems, wandSpells } = useCharacter(character) || {};

  const rawSlots = character?.spellcasting?.spell_slots;
  const spellSlots = useMemo(() => rawSlots || EMPTY_SLOTS, [rawSlots]);
  const focusInfo = getFocusInfo(character);
  const focusMax = focusInfo?.max ?? 0;
  const chargesMax = staff?.charges?.max ?? 0;

  // Pool states — keys and initializers identical to the pip components.
  const [slotsSpent, setSlotsSpent] = useSyncedState(
    `cnmh_slots_${charId}`,
    () => Object.fromEntries(Object.keys(spellSlots || {}).map((k) => [k, 0]))
  );
  const [focusSpent, setFocusSpent] = useSyncedState(
    `cnmh_focus_${charId}`,
    focusMax - (focusInfo?.current ?? focusMax)
  );
  const [staffSpent, setStaffSpent] = useSyncedState(
    `cnmh_staff_${charId}`,
    chargesMax - (staff?.charges?.current ?? chargesMax)
  );
  const [wandStates, setWandStates] = useSyncedState(
    `cnmh_wands_${charId}`,
    () => Object.fromEntries((wandSpells || []).map((s) => [wandKeyFor(s), 'available']))
  );
  const [consumed, setConsumed] = useSyncedState(`cnmh_consumed_${charId}`, {});

  const slotRemainingFor = useCallback(
    (rank) => (spellSlots[String(rank)] || 0) - ((slotsSpent || {})[String(rank)] || 0),
    [spellSlots, slotsSpent]
  );
  const spendSlot = useCallback(
    (rank) =>
      setSlotsSpent((prev) => {
        const key = String(rank);
        const total = spellSlots[key] || 0;
        return {
          ...(prev || {}),
          [key]: Math.min(((prev || {})[key] || 0) + 1, total),
        };
      }),
    [setSlotsSpent, spellSlots]
  );

  const focusRemaining = Math.max(0, focusMax - (focusSpent || 0));
  const spendFocus = useCallback(
    () => setFocusSpent((prev) => Math.min((prev || 0) + 1, focusMax)),
    [setFocusSpent, focusMax]
  );

  const staffRemaining = Math.max(0, chargesMax - (staffSpent || 0));
  const spendStaff = useCallback(
    (n = 1) => setStaffSpent((prev) => Math.min((prev || 0) + n, chargesMax)),
    [setStaffSpent, chargesMax]
  );

  const wandStateFor = useCallback(
    (key) => (wandStates || {})[key] || 'available',
    [wandStates]
  );
  const spendWand = useCallback(
    (key) => setWandStates((prev) => ({ ...(prev || {}), [key]: 'used' })),
    [setWandStates]
  );

  const consumableQuantity = useCallback(
    (name) => {
      const item = (scrollItems || []).find((it) => it.name === name);
      return item ? (item.quantity ?? 1) : 0;
    },
    [scrollItems]
  );
  const consumableRemainingFor = useCallback(
    (name) => Math.max(0, consumableQuantity(name) - ((consumed || {})[name] || 0)),
    [consumableQuantity, consumed]
  );
  const spendConsumable = useCallback(
    (name) => setConsumed((prev) => ({ ...(prev || {}), [name]: ((prev || {})[name] || 0) + 1 })),
    [setConsumed]
  );
  const restoreConsumable = useCallback(
    (name) =>
      setConsumed((prev) => ({
        ...(prev || {}),
        [name]: Math.max(0, ((prev || {})[name] || 0) - 1),
      })),
    [setConsumed]
  );

  /**
   * Build the cast-cost options for a spell. `castSource` says which list the
   * cast started from ('slot'|'focus'|'staff'|'wand'|'scroll'|'innate'); spell
   * flags (fromScroll/fromWand/fromStaff/innate) act as a fallback.
   */
  const optionsFor = useCallback(
    (spell, castSource) => {
      if (!spell) return [];
      const source =
        castSource ||
        (spell.fromScroll ? 'scroll'
          : spell.fromWand ? 'wand'
          : spell.fromStaff ? 'staff'
          : (spell.innate || spell.fromInnate) ? 'innate'
          : 'slot');

      // Cantrips are free from every source except a consumed scroll.
      if (spell.level === 0 && source !== 'scroll') {
        return [{ type: 'cantrip', label: 'Cantrip — no cost', enabled: true }];
      }
      if (source === 'innate') {
        return [{ type: 'innate', label: 'Innate — no cost', enabled: true }];
      }

      if (source === 'focus') {
        return [{
          type: 'focus',
          label: `1 Focus Point (${focusRemaining} left)`,
          enabled: focusRemaining > 0,
          reason: focusRemaining > 0 ? null : 'No Focus Points remaining',
        }];
      }

      if (source === 'scroll') {
        const name = spell.scrollName || spell.name;
        const remaining = consumableRemainingFor(name);
        return [{
          type: 'scroll',
          key: name,
          label: `Consume scroll — ${name} (${remaining} left)`,
          enabled: remaining > 0,
          reason: remaining > 0 ? null : 'No copies of this scroll remaining',
        }];
      }

      if (source === 'wand') {
        const key = wandKeyFor(spell);
        const state = wandStateFor(key);
        return [{
          type: 'wand',
          key,
          label: `Wand daily use — ${spell.wandName || spell.name}`,
          enabled: state === 'available',
          reason: state === 'available' ? null : 'Wand already used today',
        }];
      }

      if (source === 'staff') {
        const rank = spell.level || 1;
        const opts = [{
          type: 'staff',
          rank,
          label: `Staff: ${rank} charge${rank !== 1 ? 's' : ''} (${staffRemaining} left)`,
          enabled: staffRemaining >= rank,
          reason: staffRemaining >= rank ? null : 'Not enough staff charges',
        }];
        // Spontaneous staff rule: a spell slot of the spell's rank can replace
        // the charges entirely (Jade's case from #213).
        if (spellSlots[String(rank)] != null) {
          const remaining = slotRemainingFor(rank);
          opts.push({
            type: 'staff-slot',
            rank,
            label: `Rank ${rank} slot instead (${remaining} left)`,
            enabled: remaining > 0,
            reason: remaining > 0 ? null : `No rank-${rank} slots remaining`,
          });
        }
        return opts;
      }

      // Repertoire slot cast. Signature spells may be heightened to any rank
      // the character has slots for; everything else spends its native rank.
      // A rank with no slot pool at all is untracked (≠ empty) — no options,
      // no gating, nothing to spend.
      const nativeRank = spell.level || 1;
      const ranks = spell.signature
        ? Object.keys(spellSlots)
            .filter((k) => k !== 'cantrips' && Number(k) >= nativeRank)
            .sort((a, b) => Number(a) - Number(b))
        : [String(nativeRank)].filter((k) => spellSlots[k] != null);
      return ranks.map((r) => {
        const remaining = slotRemainingFor(r);
        return {
          type: 'slot',
          rank: Number(r),
          label: `Rank ${r} slot (${remaining} left)`,
          enabled: remaining > 0,
          reason: remaining > 0 ? null : `No rank-${r} slots remaining`,
        };
      });
    },
    [spellSlots, slotRemainingFor, focusRemaining, staffRemaining, wandStateFor, consumableRemainingFor]
  );

  /**
   * Decrement the pool behind a chosen option. Returns the log fragment for
   * the combat log ('rank 2 slot', '1 Focus Point', …); null = costless.
   */
  const spend = useCallback(
    (option) => {
      if (!option) return { ok: false, label: null };
      switch (option.type) {
        case 'cantrip':
        case 'innate':
          return { ok: true, label: null };
        case 'slot':
          spendSlot(option.rank);
          return { ok: true, label: `rank ${option.rank} slot` };
        case 'focus':
          spendFocus();
          return { ok: true, label: '1 Focus Point' };
        case 'staff':
          spendStaff(option.rank);
          return { ok: true, label: `staff — ${option.rank} charge${option.rank !== 1 ? 's' : ''}` };
        case 'staff-slot':
          spendSlot(option.rank);
          return { ok: true, label: `rank ${option.rank} slot (staff)` };
        case 'wand':
          spendWand(option.key);
          return { ok: true, label: 'wand daily use' };
        case 'scroll':
          spendConsumable(option.key);
          return { ok: true, label: `scroll consumed — ${option.key}` };
        default:
          return { ok: false, label: null };
      }
    },
    [spendSlot, spendFocus, spendStaff, spendWand, spendConsumable]
  );

  return {
    slots: { totals: spellSlots, remainingFor: slotRemainingFor, spend: spendSlot },
    focus: { max: focusMax, remaining: focusRemaining, spend: spendFocus },
    staff: { max: chargesMax, remaining: staffRemaining, spend: spendStaff },
    wands: { stateFor: wandStateFor, spend: spendWand },
    consumables: {
      map: consumed || {},
      remainingFor: consumableRemainingFor,
      spend: spendConsumable,
      restore: restoreConsumable,
    },
    optionsFor,
    spend,
  };
};

export default useCastingResources;
