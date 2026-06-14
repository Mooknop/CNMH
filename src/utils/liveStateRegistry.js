// src/utils/liveStateRegistry.js
// Single source of truth describing the per-character live synced keys
// (`cnmh_<type>_<charId>`). Both the GM Character-State inspector (#229) and the
// party resource dashboard (#230) consume this so the two never drift apart.
//
// Each descriptor is pure: `format(value, character)` turns a raw synced value
// into a human label, `editor` is a hint for the #229 edit affordances, and
// `group` places it in the inspector layout. Keys not described here are not an
// error — they fall through to the inspector's raw escape hatch (partition's
// `unrecognized`), which is exactly how brand-new keys stay visible without a
// registry edit.
//
// React-free on purpose (mirrors dailyPrep.js / frequency.js): takes plain
// values + an optional resolved character, so it works in tests and from the
// non-reactive getState path as well as from hooks.
import { getFocusInfo } from './SpellUtils';

// Ordered groups — the inspector renders them in this order.
export const LIVE_STATE_GROUPS = [
  { key: 'turn',      label: 'Turn economy' },
  { key: 'resources', label: 'Resource pools' },
  { key: 'combat',    label: 'Combat state' },
  { key: 'class',     label: 'Class & spell state' },
];

const asArray  = (v) => (Array.isArray(v) ? v : []);
const asObject = (v) => (v && typeof v === 'object' ? v : {});

// ─── Descriptors ─────────────────────────────────────────────
// editor hints (consumed by #229 Slice 2): 'number' | 'toggle' | 'list' |
// 'text' | 'json'. Unspecialised shapes use 'json' (validated raw editor).
export const LIVE_STATE_REGISTRY = [
  // ── Turn economy ──
  {
    type: 'turnstate', group: 'turn', label: 'Actions & reaction', editor: 'json',
    format: (v) => {
      const a = Number(v?.actionsSpent) || 0;
      const parts = [`${a}/3 actions`];
      if (v?.attacksMade) parts.push(`${v.attacksMade} attack${v.attacksMade !== 1 ? 's' : ''} (MAP)`);
      if (v?.reactionSpent) parts.push('reaction spent');
      else if (v?.reactionAvailable === false) parts.push('no reaction');
      else parts.push('reaction ready');
      return parts.join(', ');
    },
  },

  // ── Resource pools ──
  {
    type: 'hp', group: 'resources', label: 'Hit points', editor: 'json',
    format: (v) => {
      const c = v?.current ?? 0;
      const m = v?.max ?? 0;
      let s = `${c}/${m}`;
      if (v?.temp) s += ` +${v.temp} temp`;
      if (v?.dying) s += `, dying ${v.dying}`;
      else if (v?.wounded) s += `, wounded ${v.wounded}`;
      if (v?.doomed) s += `, doomed ${v.doomed}`;
      return s;
    },
  },
  {
    type: 'slots', group: 'resources', label: 'Spell slots', editor: 'json',
    format: (v, character) => {
      const totals = asObject(character?.spellcasting?.spell_slots);
      const ranks = Object.keys(totals)
        .filter((k) => k !== 'cantrips' && Number(totals[k]) > 0)
        .sort((a, b) => Number(a) - Number(b));
      if (ranks.length === 0) {
        const spent = Object.entries(asObject(v)).filter(([, n]) => Number(n) > 0);
        return spent.length ? spent.map(([r, n]) => `R${r}: ${n} spent`).join(', ') : 'all available';
      }
      return ranks
        .map((r) => `R${r} ${Number(totals[r]) - (Number(asObject(v)[r]) || 0)}/${totals[r]}`)
        .join(', ');
    },
  },
  {
    type: 'focus', group: 'resources', label: 'Focus points', editor: 'number',
    format: (v, character) => {
      const spent = Number(v) || 0;
      const max = getFocusInfo(character)?.max;
      if (max != null) return `${Math.max(0, max - spent)}/${max}`;
      return spent > 0 ? `${spent} spent` : 'full';
    },
  },
  {
    type: 'staff', group: 'resources', label: 'Staff charges', editor: 'number',
    format: (v) => {
      const spent = Number(v) || 0;
      return spent > 0 ? `${spent} charge${spent !== 1 ? 's' : ''} spent` : 'full';
    },
  },
  {
    type: 'wands', group: 'resources', label: 'Wand uses', editor: 'json',
    format: (v) => {
      const entries = Object.entries(asObject(v));
      if (!entries.length) return 'none';
      const used = entries.filter(([, s]) => s !== 'available');
      return used.length ? `${used.length} of ${entries.length} used` : `${entries.length} available`;
    },
  },
  {
    type: 'heropoints', group: 'resources', label: 'Hero points', editor: 'number',
    format: (v) => `${Number(v) || 0}`,
  },
  {
    type: 'shieldstate', group: 'resources', label: 'Shield HP', editor: 'json',
    format: (v) => {
      const entries = Object.entries(asObject(v));
      if (!entries.length) return 'none';
      return entries.map(([, s]) => `${s?.hp ?? '?'} HP`).join(', ');
    },
  },
  {
    type: 'consumed', group: 'resources', label: 'Consumables used', editor: 'json',
    format: (v) => {
      const used = Object.entries(asObject(v)).filter(([, n]) => Number(n) > 0);
      return used.length ? used.map(([k, n]) => `${k}: ${n}`).join(', ') : 'none';
    },
  },

  // ── Combat state ──
  {
    type: 'shieldraise', group: 'combat', label: 'Shield raised', editor: 'toggle',
    format: (v) => (v?.raised ? 'raised' : 'lowered'),
  },
  {
    type: 'stance', group: 'combat', label: 'Stance', editor: 'json',
    format: (v) => (v?.active ? (v.name || 'active') : 'none'),
  },
  {
    type: 'aura', group: 'combat', label: 'Aura', editor: 'toggle',
    format: (v) => (v?.active ? 'active' : 'off'),
  },
  {
    type: 'huntprey', group: 'combat', label: 'Hunt Prey', editor: 'json',
    format: (v) => (v?.targetName ? `prey: ${v.targetName}` : 'none'),
  },
  {
    type: 'conditions', group: 'combat', label: 'Conditions', editor: 'list',
    format: (v) => {
      const arr = asArray(v);
      if (!arr.length) return 'none';
      return arr.map((c) => (c?.value != null ? `${c.id} ${c.value}` : c.id)).join(', ');
    },
  },
  {
    type: 'effects', group: 'combat', label: 'Effects', editor: 'list',
    format: (v) => {
      const arr = asArray(v);
      if (!arr.length) return 'none';
      return arr.map((e) => e.name || e.effectId || e.id).join(', ');
    },
  },
  {
    type: 'grantedactions', group: 'combat', label: 'Granted actions', editor: 'list',
    format: (v) => {
      const arr = asArray(v);
      return arr.length ? `${arr.length} granted` : 'none';
    },
  },

  // ── Class & spell state ──
  {
    type: 'eldattune', group: 'class', label: 'Eld attunement', editor: 'text',
    format: (v) => (typeof v === 'string' && v ? v : 'none'),
  },
  {
    type: 'omen', group: 'class', label: 'Omen', editor: 'json',
    format: (v) => (v?.suit ? `${v.suit}${v.pendingLoss ? ' (pending loss)' : ''}` : 'none'),
  },
  {
    type: 'freq', group: 'class', label: 'Frequency ledger', editor: 'json',
    format: (v) => {
      const total = Object.values(asObject(v)).reduce((n, recs) => n + asArray(recs).length, 0);
      return total ? `${total} use record${total !== 1 ? 's' : ''}` : 'none';
    },
  },
  {
    type: 'sustains', group: 'class', label: 'Sustained spells', editor: 'list',
    format: (v) => {
      const arr = asArray(v);
      if (!arr.length) return 'none';
      return arr.map((s) => s.spellName || s.spellId || s.id).join(', ');
    },
  },
  {
    type: 'spellcounters', group: 'class', label: 'Spell counters', editor: 'list',
    format: (v) => {
      const arr = asArray(v);
      if (!arr.length) return 'none';
      return arr.map((c) => `${c.id}: ${c.value}`).join(', ');
    },
  },
];

const REGISTRY_BY_TYPE = Object.fromEntries(LIVE_STATE_REGISTRY.map((d) => [d.type, d]));

/** Descriptor for a key-type, or undefined if unregistered. */
export function getLiveStateDescriptor(type) {
  return REGISTRY_BY_TYPE[type];
}

/** Format a single value defensively; falls back to compact JSON on any throw. */
export function formatLiveValue(type, value, character) {
  const d = REGISTRY_BY_TYPE[type];
  if (!d) return safeJson(value);
  try {
    return d.format(value, character);
  } catch {
    return safeJson(value);
  }
}

function safeJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Split a character's full live-state object (the per-character map from
 * serverState, `{ [type]: value }`) into registry-known entries grouped for
 * display, plus an `unrecognized` list (the raw escape hatch). Group + entry
 * order follow LIVE_STATE_GROUPS / LIVE_STATE_REGISTRY so output is stable.
 *
 * @param {Object} liveState - { [type]: value } for one character
 * @param {Object} [character] - resolved character (lets formatters show maxes)
 * @returns {{ groups: Array<{key,label,entries:Array}>, unrecognized: Array<{type,value}> }}
 */
export function partitionLiveState(liveState, character) {
  const obj = asObject(liveState);
  const groups = LIVE_STATE_GROUPS.map((g) => ({ ...g, entries: [] }));
  const byKey = Object.fromEntries(groups.map((g) => [g.key, g]));

  // Registry order within each group.
  for (const d of LIVE_STATE_REGISTRY) {
    if (!(d.type in obj)) continue;
    byKey[d.group].entries.push({
      type: d.type,
      value: obj[d.type],
      descriptor: d,
      label: d.label,
      editor: d.editor,
      formatted: formatLiveValue(d.type, obj[d.type], character),
    });
  }

  const unrecognized = Object.keys(obj)
    .filter((type) => !REGISTRY_BY_TYPE[type])
    .sort()
    .map((type) => ({ type, value: obj[type] }));

  return { groups: groups.filter((g) => g.entries.length), unrecognized };
}
