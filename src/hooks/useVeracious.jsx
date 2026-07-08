import { useCallback, useMemo } from 'react';
import { useSyncedState } from './useSyncedState';
import { useInvested } from './useInvested';
import { useContent } from '../contexts/ContentContext';
import { isPowerRing } from '../utils/InventoryUtils';
import { runeCatalogMap } from '../utils/contentUtils';

// Veracious Spell (#967 R7) — the power ring's activation. Arming it means the
// NEXT spell attack roll gains the ring's item bonus. This is a display-only
// reminder: the app never rolls spell attacks (Foundry does), so we surface the
// boosted number + a note rather than mutating any roll.
//
// App-only synced state, like the raised shield (useShield) — it broadcasts to
// the player's other tabs but is NOT relayed to the Foundry bridge (Foundry
// doesn't consume it), so it stays out of the app↔bridge relay key table.
//   cnmh_veracious_<charId> = { armed, ts }
//
// The item bonus applies to the attack ROLL only, never the spell DC, so the
// boost is layered on the displayed Atk in SpellsHeader — never folded into
// calculateSpellStats (which also derives the DC).
const IDLE = { armed: false, ts: 0 };

/**
 * @param {string} charId
 * @param {Array}  inventory - the character's effective inventory
 * @returns {{ ring: object|null, itemBonus: number, imbuedRunes: string[],
 *            imbuedRiders: Array<{rune: string, text: string}>,
 *            armed: boolean, arm: Function, disarm: Function }}
 */
export const useVeracious = (charId, inventory = []) => {
  const [state, setState] = useSyncedState(`cnmh_veracious_${charId || 'none'}`, IDLE);
  const { isInvested } = useInvested(charId);
  const { runes: catalogRunes } = useContent();

  // The invested power ring (first wins). The item bonus only exists while a
  // power ring is actually invested — an un-invested or absent ring grants none.
  const ring = useMemo(
    () => (Array.isArray(inventory) ? inventory : []).find((e) => isPowerRing(e) && isInvested(e?.uid)) || null,
    [inventory, isInvested]
  );
  const itemBonus = ring ? Number(ring.itemBonus) || 0 : 0;

  // Imbued ring-rune docs, hydrated against the rune catalog. Resolution may
  // leave runes.property as bare ids, {id, choice} refs, or hydrated docs — a
  // catalog miss falls back to whatever the entry itself carries.
  const imbued = useMemo(() => {
    const prop = ring && ring.runes && Array.isArray(ring.runes.property) ? ring.runes.property : [];
    const runeMap = runeCatalogMap(catalogRunes || []);
    return prop
      .map((p) => {
        const id = typeof p === 'string' ? p : p && p.id;
        return (id != null && runeMap.get(String(id)))
          || (p && typeof p === 'object' ? p : id != null ? { id } : null);
      })
      .filter(Boolean);
  }, [ring, catalogRunes]);

  // Names for the "these effects apply to a modified attack" reminder…
  const imbuedRunes = useMemo(
    () => imbued.map((r) => r.name || r.id).filter(Boolean),
    [imbued]
  );
  // …and each rune's rider text (the trigger/passive payload a human applies —
  // "target is immobilized on a crit" etc.), surfaced verbatim while armed.
  const imbuedRiders = useMemo(
    () => imbued.flatMap((r) =>
      (Array.isArray(r.riders) ? r.riders : [])
        .map((rd) => (rd && rd.text ? { rune: r.name || r.id, text: rd.text } : null))
        .filter(Boolean)
    ),
    [imbued]
  );

  // Armed only counts while a power ring is invested — clearing state if the
  // ring is later removed/un-invested so a stale flag can't boost nothing.
  const armed = !!state?.armed && !!ring;
  const arm = useCallback(() => setState({ armed: true, ts: Date.now() }), [setState]);
  const disarm = useCallback(() => setState({ armed: false, ts: Date.now() }), [setState]);

  return { ring, itemBonus, imbuedRunes, imbuedRiders, armed, arm, disarm };
};

export default useVeracious;
