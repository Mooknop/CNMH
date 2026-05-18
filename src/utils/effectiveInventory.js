// Slice 2: merge the GM-authored (resolved) inventory tree with the durable
// live-loadout layer into ONE effective tree. Every downstream consumer (Bulk,
// inventory display, Hands panel) reads this so the "real" item state is
// consistent for everyone.
//
// loadout shape: { [entryUid]: { state?, container?, hand? } }
//   state     : 'worn'|'held1'|'held2'|'dropped'  (top-level only; an entry
//               inside a container is always Stowed regardless)
//   container : parent container entry's uid, or null = top-level.
//               Absent ⇒ keep the authored placement.
//   hand      : 1 | 2 — which hand a held1 item occupies (so the Encounter
//               panel can render two distinct slots). Inert to Bulk/badges;
//               carried through onto the effective entry when present.
//
// Constraints preserved from the authored model: containers never nest
// (depth-1) — a container entry is always top-level, and a move whose target
// is unknown / not a container / itself falls back to top-level (never throws,
// never loses the entry). An empty/absent loadout ⇒ the effective tree is the
// authored tree with derived state stamped (top-level→worn, contents→stowed);
// Bulk is then byte-identical to today (state is inert to the math except
// `dropped`, which no authored sheet carries).
import { STOWED, normalizeItemState } from './itemState';

const isContainer = (entry) =>
  !!(entry && entry.container && Array.isArray(entry.container.contents));

// Depth-first walk of the authored resolved tree, recording each entry with
// its authored parent uid (null at the top level).
const flatten = (list, parentUid, acc) => {
  (Array.isArray(list) ? list : []).forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    acc.push({ entry, uid: entry.uid != null ? entry.uid : null, parentUid });
    if (isContainer(entry)) flatten(entry.container.contents, entry.uid, acc);
  });
  return acc;
};

export const buildEffectiveInventory = (resolvedInventory, loadout) => {
  const lo = loadout && typeof loadout === 'object' ? loadout : {};
  const flat = flatten(resolvedInventory, null, []);

  // uids that name a container (the only valid move targets).
  const containerUids = new Set(
    flat.filter((n) => isContainer(n.entry) && n.uid != null).map((n) => n.uid)
  );

  // Effective parent uid for a node (null = top-level). A container always
  // stays top-level; an override to an unknown/non-container/self target is
  // ignored (→ top-level) so an entry is never orphaned.
  const effParent = ({ entry, uid, parentUid }) => {
    if (isContainer(entry)) return null;
    const ov = uid != null ? lo[uid] : undefined;
    if (ov && Object.prototype.hasOwnProperty.call(ov, 'container')) {
      const target = ov.container;
      if (target == null) return null;
      if (target !== uid && containerUids.has(target)) return target;
      return null;
    }
    return parentUid;
  };

  // Group children by effective parent, preserving authored DFS order.
  const childrenByParent = new Map(); // containerUid -> node[]
  const topLevel = [];
  flat.forEach((node) => {
    const p = effParent(node);
    if (p == null) topLevel.push(node);
    else {
      if (!childrenByParent.has(p)) childrenByParent.set(p, []);
      childrenByParent.get(p).push(node);
    }
  });

  const stateFor = (uid) =>
    normalizeItemState(uid != null && lo[uid] ? lo[uid].state : undefined);
  const handFor = (uid) =>
    uid != null && lo[uid] && lo[uid].hand ? { hand: lo[uid].hand } : null;

  // Rebuild immutably (never mutate the shared resolved objects). Top-level
  // state comes from the loadout (default Worn); contents are always Stowed.
  return topLevel.map(({ entry, uid }) => {
    if (isContainer(entry)) {
      const contents = (childrenByParent.get(uid) || []).map(({ entry: ce }) => ({
        ...ce,
        state: STOWED,
      }));
      return {
        ...entry,
        state: stateFor(uid),
        ...handFor(uid),
        container: { ...entry.container, contents },
      };
    }
    return { ...entry, state: stateFor(uid), ...handFor(uid) };
  });
};

export default buildEffectiveInventory;
