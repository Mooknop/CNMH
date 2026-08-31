import React, { useMemo, useState } from 'react';
import { useContent } from '../../../contexts/ContentContext';
import { useSession } from '../../../contexts/SessionContext';
import { useSessionLog } from '../../../hooks/useSessionLog';
import { usePartyActivity } from '../../../hooks/usePartyActivity';
import { buildEffectiveInventory } from '../../../utils/effectiveInventory';
import { applyRemovedOverlay } from '../../../utils/removedOverlay';
import { deriveHands } from '../../../utils/hands';
import { consumedCountFor } from '../../../utils/consumedLedger';
import {
  itemCatalogMap,
  spellCatalogMap,
  runeCatalogMap,
  resolveInventory,
} from '../../../utils/contentUtils';
import {
  calculateItemsBulk,
  exceedsBulkThreshold,
  flattenInventory,
  isContainer,
} from '../../../utils/InventoryUtils';
import { calculateBulkLimit } from '../../../utils/CharacterUtils';
import {
  gmTransferItem,
  gmSetLoadoutEntry,
  handBlockReason,
  transferBlockReason,
} from '../../../utils/inventoryTransfer';
import { APP } from '../../../sync/keys';
import './DowntimeViews.css';

// Downtime dock — Party inventory view (#1859, redesign wave 2). A NEW surface:
// five PC columns (hands strip over the stowed list) and a persistent selection
// bar, driven by a tap-an-item-then-tap-a-destination model. NO drag and drop —
// this is a tablet screen, and a 34px chip is not a drag handle.
//
// ── Where the data comes from ────────────────────────────────────────────────
// The two-layer inventory model, assembled here for EVERY roster PC at once
// (useCharacter is per-character and can't be called in a loop). Five
// usePartyActivity subscriptions — one per overlay the effective tree needs —
// give both the live values and a re-render whenever any PC's overlay changes:
//
//   authored inventory (immutable, already catalog-resolved by ContentContext)
//   + cnmh_acquired_<id>  (additive; entries are unresolved refs → resolved here
//                          exactly the way useCharacter resolves them)
//   − cnmh_removed_<id>   (given-away mask)
//   ⨯ cnmh_loadout_<id>   (placement: worn / held1 / held2 / dropped + container)
//   = buildEffectiveInventory(...)  → deriveHands(...) for the hands strip
//
// cnmh_consumed_<id> nets the DISPLAYED quantity (and the quantity that travels
// on a transfer) so a half-burned stack can't be resurrected by handing it on.
// Bulk deliberately does NOT net it — calculateItemsBulk over the effective
// tree is what the character sheet shows, and the two must agree.
//
// cnmh_affixed_<id> is read only to REFUSE moves: an item tangled in the affix
// overlay (a talisman on a host, or a host carrying one) would strand that
// overlay behind on the giver. Same rule ItemModal's give already enforces.
//
// ── Mutations ────────────────────────────────────────────────────────────────
// All three go through utils/inventoryTransfer.js, which is also where the
// player-side give (useGiveItem) gets its reuid/subtreeUids from — so the GM
// and player paths can't drift:
//
//   give   → gmTransferItem      credit-before-debit, force:true, no mode gate
//   hand   → gmSetLoadoutEntry   { state:'held1', hand:n, container:null }
//   stow   → gmSetLoadoutEntry   { container:<uid> } (contents are always Stowed)
//
// Every refusal (bulk limit, occupied hand, full container, tattoo, affix) is
// surfaced INLINE in the selection bar — never a toast, never a silent drop.
//
// ── Judgment calls (recorded on #1859) ──────────────────────────────────────
// * Hand slots are BUTTONS, not the spec's static divs. gmTransferItem
//   explicitly allows held items ("unhand on transfer"), which is unreachable
//   if the only selectable things are the stowed chips. Same visual spec.
// * "Stow in {container}" enumerates the SELECTION OWNER's containers, not
//   every container in the party. A cross-PC container move is a transfer, and
//   the transfer already has its own affordance (the column's Give button);
//   five PCs' worth of container buttons would also blow the bar's width.
// * NO SCROLLING: a column whose stowed list overflows paginates in place with
//   ‹ / › buttons (STOWED_PAGE_SIZE per page).

// Sized so a full column (name row + hands + label + page controls + the
// destination button) still fits the fixed 1024px-tall pane at five PCs.
const STOWED_PAGE_SIZE = 12;

const firstNameOf = (name) => String(name || '').split(' ')[0] || 'them';

// One decimal, no trailing ".0" — Bulk is a display number here, not the
// formatBulk() badge vocabulary (which renders 0 as an em dash, unreadable
// inside "Bulk — / 10").
const bulkNum = (n) => String(Math.round((Number(n) || 0) * 10) / 10);

// What's left of a stack after the consumed ledger.
const remainingQty = (item, consumed) =>
  Math.max(0, (item?.quantity ?? 1) - consumedCountFor(item, consumed));

const InventoryView = () => {
  const { items, spells, runes } = useContent();
  const { getState, sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();

  // One subscription per overlay the effective tree needs. Each call returns
  // the roster in the SAME order (no viewer to sort first), so they zip by
  // index. `color` rides along from roster position, as everywhere else.
  const { party: loadouts } = usePartyActivity(APP.LOADOUT);
  const { party: acquireds } = usePartyActivity(APP.ACQUIRED);
  const { party: removeds } = usePartyActivity(APP.REMOVED);
  const { party: consumeds } = usePartyActivity(APP.CONSUMED);
  const { party: affixeds } = usePartyActivity(APP.AFFIXED);

  // { pcId, uid } — the tapped item. Local, not synced: which item this GM's
  // tablet is holding mid-move is not campaign state. The shell remounts each
  // view on switch (keyed on the view id), so plain useState is the whole of
  // the "clears on view change" requirement.
  const [held, setHeld] = useState(null);
  const [message, setMessage] = useState('');
  const [pages, setPages] = useState({}); // charId -> stowed page index

  const itemMap = useMemo(() => itemCatalogMap(items || []), [items]);
  const spellMap = useMemo(() => spellCatalogMap(spells || []), [spells]);
  const runeMap = useMemo(() => runeCatalogMap(runes || []), [runes]);

  const columns = loadouts.map((p, i) => {
    const char = p.char;
    const consumed = consumeds[i]?.state;
    const resolvedAcquired = resolveInventory(
      Array.isArray(acquireds[i]?.state) ? acquireds[i].state : [],
      itemMap,
      spellMap,
      char.level || 1,
      runeMap,
    );
    const present = applyRemovedOverlay(
      [...(char.inventory || []), ...resolvedAcquired],
      removeds[i]?.state,
    );
    const effective = buildEffectiveInventory(present, p.state);
    const hands = deriveHands(effective);
    const handUids = new Set(
      [hands.slot1?.uid, hands.slot2?.uid].filter((u) => u != null),
    );
    // Everything carryable that is not currently in a hand — top-level worn /
    // dropped entries, containers, and container contents. The spec labels the
    // whole block "Stowed"; the hands strip above it is the other half.
    const stowed = flattenInventory(effective).filter(
      (e) => e && e.uid != null && !handUids.has(e.uid) && remainingQty(e, consumed) > 0,
    );
    const carried = calculateItemsBulk(effective);
    const { bulkLimit } = calculateBulkLimit(char);

    return {
      char,
      color: p.color,
      affixed: affixeds[i]?.state,
      consumed,
      effective,
      hands,
      stowed,
      containers: effective.filter(isContainer),
      carried,
      bulkLimit,
      overBulk: exceedsBulkThreshold(carried, bulkLimit),
    };
  });

  const byId = (id) => columns.find((c) => c.char.id === id) || null;
  const owner = held ? byId(held.pcId) : null;
  const heldItem = owner
    ? flattenInventory(owner.effective).find((e) => e && e.uid === held.uid) || null
    : null;
  // A held item whose entry vanished (a remote peer moved it) drops the
  // selection rather than leaving a dangling bar.
  const holding = heldItem ? { column: owner, item: heldItem } : null;

  const select = (column, item) => {
    setMessage('');
    setHeld((cur) =>
      cur && cur.pcId === column.char.id && cur.uid === item.uid
        ? null // tapping the held item again cancels
        : { pcId: column.char.id, uid: item.uid },
    );
  };

  const clear = () => {
    setHeld(null);
    setMessage('');
  };

  const refuse = (reason) => {
    setMessage(reason);
    return false;
  };

  // ── Give to another PC ──────────────────────────────────────────────────
  const giveTo = (target) => {
    if (!holding) return;
    const { column: from, item } = holding;
    if (target.char.id === from.char.id) return;

    const blocked = transferBlockReason(item, from.affixed);
    if (blocked) return refuse(blocked);

    // The quantity that actually travels is the un-burned remainder.
    const moving = { ...item, quantity: remainingQty(item, from.consumed) };
    const added = calculateItemsBulk([moving]);
    if (exceedsBulkThreshold(target.carried + added, target.bulkLimit)) {
      return refuse(
        `${target.char.name} can't take ${item.name} — that would be Bulk ` +
          `${bulkNum(target.carried + added)} against a limit of ${target.bulkLimit}.`,
      );
    }

    const { ok, reason } = gmTransferItem({
      getState,
      sendUpdate,
      fromId: from.char.id,
      toId: target.char.id,
      item: moving,
      affixed: from.affixed,
    });
    if (!ok) return refuse(reason || 'That move was refused.');

    appendEvent({
      type: 'action',
      text: `GM moved ${item.name} from ${from.char.name} to ${target.char.name}`,
    });
    clear();
    return true;
  };

  // ── Put in a hand ───────────────────────────────────────────────────────
  const toHand = (hand) => {
    if (!holding) return;
    const { column, item } = holding;
    const blocked = handBlockReason(item);
    if (blocked) return refuse(blocked);

    const occupant = hand === 2 ? column.hands.slot2 : column.hands.slot1;
    if (occupant && occupant.uid !== item.uid) {
      return refuse(
        `${column.char.name}'s hand ${hand} is holding ${occupant.name} — free it first.`,
      );
    }

    gmSetLoadoutEntry({
      getState,
      sendUpdate,
      charId: column.char.id,
      uid: item.uid,
      patch: { state: 'held1', hand, container: null },
    });
    appendEvent({
      type: 'action',
      text: `GM put ${item.name} in ${column.char.name}'s hand ${hand}`,
    });
    clear();
    return true;
  };

  // ── Stow in one of the owner's containers ───────────────────────────────
  const stowIn = (container) => {
    if (!holding) return;
    const { column, item } = holding;
    if (container.uid === item.uid) return refuse("A container can't hold itself.");

    const capacity = Number(container.container?.capacity) || 0;
    const contents = container.container?.contents || [];
    const alreadyInside = contents.some((c) => c && c.uid === item.uid);
    if (capacity > 0 && !alreadyInside && contents.length >= capacity) {
      return refuse(`${container.name} is full (${contents.length} / ${capacity}).`);
    }

    gmSetLoadoutEntry({
      getState,
      sendUpdate,
      charId: column.char.id,
      uid: item.uid,
      // Contents are always Stowed in the effective tree — the container
      // pointer alone does the work; state/hand are reset so the entry can't
      // read as held while it sits in a bag.
      patch: { state: 'worn', hand: undefined, container: container.uid },
    });
    appendEvent({
      type: 'action',
      text: `GM stowed ${item.name} in ${column.char.name}'s ${container.name}`,
    });
    clear();
    return true;
  };

  const pageOf = (charId, count) => {
    const last = Math.max(0, Math.ceil(count / STOWED_PAGE_SIZE) - 1);
    return Math.min(pages[charId] || 0, last);
  };
  const turnPage = (charId, delta, count) => {
    const last = Math.max(0, Math.ceil(count / STOWED_PAGE_SIZE) - 1);
    setPages((cur) => ({
      ...cur,
      [charId]: Math.max(0, Math.min(last, (cur[charId] || 0) + delta)),
    }));
  };

  return (
    <section
      className="dock-dt-view dock-dt-view--footer"
      aria-label="Party inventory"
    >
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Party inventory</h2>
        </div>
        <span className="dock-dt-count">Tap an item, then tap a destination</span>
      </header>

      {columns.length === 0 ? (
        <div className="dock-dt-note" role="status">
          <p>No characters on the roster — nothing to move.</p>
        </div>
      ) : (
        <div
          className="dock-dt-inv-grid"
          style={{ '--dock-dt-inv-cols': columns.length }}
        >
          {columns.map((col) => {
            const isTarget = !!holding && holding.column.char.id !== col.char.id;
            const total = col.stowed.length;
            const page = pageOf(col.char.id, total);
            const paged = total > STOWED_PAGE_SIZE;
            const shown = col.stowed.slice(
              page * STOWED_PAGE_SIZE,
              page * STOWED_PAGE_SIZE + STOWED_PAGE_SIZE,
            );
            const lastPage = Math.max(0, Math.ceil(total / STOWED_PAGE_SIZE) - 1);
            return (
              <div
                key={col.char.id}
                className="dock-dt-inv-col"
                data-testid={`dock-dt-inv-col-${col.char.id}`}
              >
                <div className="dock-dt-inv-who">
                  <span className="dock-dt-inv-name-row">
                    <span
                      className="dock-dt-inv-dot"
                      style={{ '--x-theme': col.color }}
                      aria-hidden="true"
                    />
                    <span className="dock-dt-inv-name">{col.char.name}</span>
                  </span>
                  <span
                    className={`dock-dt-inv-bulk${col.overBulk ? ' dock-dt-inv-bulk--over' : ''}`}
                    data-testid={`dock-dt-inv-bulk-${col.char.id}`}
                  >
                    Bulk {bulkNum(col.carried)} / {col.bulkLimit}
                  </span>
                </div>

                <div className="dock-dt-inv-hands">
                  {[1, 2].map((n) => {
                    const item = n === 2 ? col.hands.slot2 : col.hands.slot1;
                    const selected =
                      !!item && !!held && held.pcId === col.char.id && held.uid === item.uid;
                    return (
                      <button
                        key={n}
                        type="button"
                        className={`dock-dt-inv-hand${item ? '' : ' dock-dt-inv-hand--empty'}${
                          selected ? ' dock-dt-inv-hand--on' : ''
                        }`}
                        disabled={!item}
                        aria-pressed={selected}
                        data-testid={`dock-dt-inv-hand-${col.char.id}-${n}`}
                        onClick={() => item && select(col, item)}
                      >
                        <span className="dock-dt-inv-hand-label">Hand {n}</span>
                        <span className="dock-dt-inv-hand-item">
                          {item ? item.name : 'empty'}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <span className="dock-dt-inv-label">Stowed</span>
                <div className="dock-dt-inv-stowed">
                  {shown.map((item) => {
                    const selected =
                      !!held && held.pcId === col.char.id && held.uid === item.uid;
                    const qty = remainingQty(item, col.consumed);
                    return (
                      <button
                        key={item.uid}
                        type="button"
                        className={`dock-dt-inv-item${selected ? ' dock-dt-inv-item--on' : ''}`}
                        aria-pressed={selected}
                        data-testid={`dock-dt-inv-item-${item.uid}`}
                        onClick={() => select(col, item)}
                      >
                        <span className="dock-dt-inv-item-name">{item.name}</span>
                        {qty > 1 && <span className="dock-dt-inv-item-qty">{qty}</span>}
                      </button>
                    );
                  })}
                  {total === 0 && (
                    <span className="dock-dt-inv-empty">Nothing stowed</span>
                  )}
                </div>

                {/* No scrolling anywhere: an overlong stowed list pages in
                    place instead of growing the column past the pane. */}
                {paged && (
                  <div className="dock-dt-inv-pager">
                    <button
                      type="button"
                      className="dock-dt-inv-page-btn"
                      aria-label={`Previous stowed page for ${col.char.name}`}
                      disabled={page === 0}
                      onClick={() => turnPage(col.char.id, -1, total)}
                    >
                      ‹
                    </button>
                    <span className="dock-dt-inv-page-count">
                      {page + 1} / {lastPage + 1}
                    </span>
                    <button
                      type="button"
                      className="dock-dt-inv-page-btn"
                      aria-label={`Next stowed page for ${col.char.name}`}
                      disabled={page >= lastPage}
                      onClick={() => turnPage(col.char.id, 1, total)}
                    >
                      ›
                    </button>
                  </div>
                )}

                <button
                  type="button"
                  className={`dock-dt-inv-drop${isTarget ? ' dock-dt-inv-drop--on' : ''}`}
                  disabled={!isTarget}
                  data-testid={`dock-dt-inv-give-${col.char.id}`}
                  onClick={() => giveTo(col)}
                >
                  {isTarget
                    ? `Give to ${firstNameOf(col.char.name)}`
                    : 'Tap an item to move it'}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="dock-dt-inv-bar">
        <span className="dock-dt-inv-bar-label">Holding</span>
        {holding ? (
          <span className="dock-dt-inv-bar-item">{holding.item.name}</span>
        ) : (
          <span className="dock-dt-inv-bar-item dock-dt-inv-bar-item--none">
            nothing selected
          </span>
        )}
        {/* Inline refusal — the spec's explicit alternative to a toast or a
            silently dropped move. */}
        <span className="dock-dt-inv-bar-msg" role="alert">
          {message}
        </span>
        <div className="dock-dt-inv-bar-spacer" />
        <button
          type="button"
          className="dock-dt-btn dock-dt-inv-bar-btn"
          disabled={!holding}
          onClick={() => toHand(1)}
        >
          To hand 1
        </button>
        <button
          type="button"
          className="dock-dt-btn dock-dt-inv-bar-btn"
          disabled={!holding}
          onClick={() => toHand(2)}
        >
          To hand 2
        </button>
        {(holding?.column.containers || [])
          .filter((c) => c.uid !== holding?.item.uid)
          .map((c) => (
            <button
              key={c.uid}
              type="button"
              className="dock-dt-btn dock-dt-inv-bar-btn"
              data-testid={`dock-dt-inv-stow-${c.uid}`}
              onClick={() => stowIn(c)}
            >
              Stow in {c.name}
            </button>
          ))}
        <button
          type="button"
          className="dock-dt-btn dock-dt-inv-bar-btn"
          disabled={!holding && !message}
          onClick={clear}
        >
          Clear
        </button>
      </div>
    </section>
  );
};

export default InventoryView;
