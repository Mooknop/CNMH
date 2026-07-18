import React, { useMemo, useState } from 'react';
import { useCharacter } from '../../../hooks/useCharacter';
import { useLoadout } from '../../../hooks/useLoadout';
import { useTurnState } from '../../../hooks/useTurnState';
import { useEncounter } from '../../../hooks/useEncounter';
import { deriveHands, isTwoHanded, wieldableWorn, strappableWorn } from '../../../utils/hands';
import { itemTint } from '../../../utils/inventoryTile';
import ActionSymbol from '../../shared/ActionSymbol';
import IconTile from '../../inventory/IconTile';
import './HandsGroup.css';

// Items-segment Hands group (hand-management redesign) — the single home for
// spending Interact on gear. Held items show their slot with a Sheathe/Stow
// button; every worn wieldable exposes Swap, which opens the inline
// hand-setter (replacing the old HandsPanel modal). The setter stages a full
// rearrangement locally (release either/both hands, assign up to two items)
// and commits ONCE as a single Interact action — one atomic setHands write,
// one 1-action spend, one log line — no matter how many items moved.

const isWeapon = (item) => !!(item && item.strikes);

const HandsGroup = ({ character, encounterMode }) => {
  const charData = useCharacter(character);
  const cid = charData ? charData.id : character && character.id;
  const { setHands, strapTo, unstrap } = useLoadout(cid);
  const { spendActions } = useTurnState(cid);
  const { appendLog } = useEncounter();

  const inventory = useMemo(
    () => (charData ? charData.inventory : []),
    [charData]
  );
  const { slot1, slot2 } = useMemo(() => deriveHands(inventory), [inventory]);
  const worn = useMemo(() => wieldableWorn(inventory), [inventory]);
  const strappable = useMemo(() => strappableWorn(inventory), [inventory]);

  const [setterOpen, setSetterOpen] = useState(false);
  const [pending, setPending] = useState({ h1: null, h2: null });
  // Which hand the next placement fills: the user's explicit slot tap, or the
  // first empty pending hand ("if both full, the tapped hand is being edited").
  const [target, setTarget] = useState(null);

  if (!charData) return null;

  const charName = charData.name || (character && character.name) || 'Someone';
  const twoHandedGrip = !!slot1 && slot1 === slot2;
  const heldRows = twoHandedGrip ? [slot1] : [slot1, slot2].filter(Boolean);
  if (heldRows.length + worn.length + strappable.length === 0) return null;

  const spendAndLog = (text) => {
    if (encounterMode) spendActions(1, 'Interact');
    appendLog?.({
      type: 'action',
      charId: cid,
      text: `${text}${encounterMode ? ' (1 act)' : ''}`,
    });
  };

  const commit = (next, text) => {
    setHands(next);
    spendAndLog(text);
  };

  // Strap / Unstrap — a buckler-class shield's own 1-action flow, deliberately
  // separate from Swap: setHands never touches strapped items, and the setter
  // pool never offers them.
  const doStrap = (item, n) => {
    strapTo(item.uid, n);
    spendAndLog(`${charName} straps the ${item.name} to hand ${n}`);
  };
  const doUnstrap = (item) => {
    unstrap(item.uid);
    spendAndLog(`${charName} unstraps the ${item.name}`);
  };

  // Sheathe (weapon) / Stow — drop this item from its hand(s), keep the other.
  const stowHeld = (item) => {
    commit(
      {
        hand1: slot1 && slot1.uid !== item.uid ? slot1.uid : null,
        hand2: slot2 && slot2.uid !== item.uid ? slot2.uid : null,
      },
      `${charName} ${isWeapon(item) ? 'sheathes' : 'stows'} the ${item.name}`
    );
  };

  const openSetter = () => {
    setPending({ h1: slot1 ? slot1.uid : null, h2: slot2 ? slot2.uid : null });
    setTarget(null);
    setSetterOpen(true);
  };
  const cancelSetter = () => setSetterOpen(false);

  const effectiveTarget = target ?? (pending.h1 == null ? 1 : 2);

  // × on a filled slot — back to the Worn pool (pending only). Releasing a
  // two-handed grip clears both slots; the freed hand becomes the target.
  const release = (n) => {
    setPending((p) =>
      p.h1 != null && p.h1 === p.h2
        ? { h1: null, h2: null }
        : { ...p, [`h${n}`]: null }
    );
    setTarget(n);
  };

  // Place a one-handed item into the target hand, bumping any occupant back to
  // the pool. A pending two-handed grip can't stay in one hand — placing over
  // either half clears both first.
  const placeOne = (uid) => {
    setPending((p) => {
      const base = p.h1 != null && p.h1 === p.h2 ? { h1: null, h2: null } : p;
      return { ...base, [`h${effectiveTarget}`]: uid };
    });
    setTarget(null);
  };
  // A two-handed item fills both slots, releasing whatever held them.
  const placeBoth = (uid) => {
    setPending({ h1: uid, h2: uid });
    setTarget(null);
  };

  const confirmSetter = () => {
    setSetterOpen(false);
    const before = {
      h1: slot1 ? slot1.uid : null,
      h2: slot2 ? slot2.uid : null,
    };
    if (before.h1 === pending.h1 && before.h2 === pending.h2) return; // no change — no action
    const nameOf = (uid) => {
      const e = inventory.find((x) => x && x.uid === uid);
      return e ? e.name : uid;
    };
    const beforeSet = new Set([before.h1, before.h2].filter(Boolean));
    const afterSet = new Set([pending.h1, pending.h2].filter(Boolean));
    const released = [...beforeSet].filter((u) => !afterSet.has(u)).map(nameOf);
    const drawn = [...afterSet]
      .filter((u) => !beforeSet.has(u))
      .map((u) =>
        pending.h1 === u && pending.h2 === u
          ? `${nameOf(u)} in both hands`
          : nameOf(u)
      );
    const parts = [];
    if (released.length) parts.push(`releases the ${released.join(' and ')}`);
    if (drawn.length) parts.push(`grips the ${drawn.join(' and ')}`);
    if (parts.length === 0) parts.push('adjusts grip');
    commit(
      { hand1: pending.h1, hand2: pending.h2 },
      `${charName} ${parts.join(', ')}`
    );
  };

  // Setter pool: every candidate not currently assigned to a pending hand.
  const pool = [...heldRows, ...worn].filter(
    (e) => e.uid !== pending.h1 && e.uid !== pending.h2
  );
  const pendingItem = (n) => {
    const uid = pending[`h${n}`];
    return uid ? inventory.find((x) => x && x.uid === uid) || null : null;
  };

  const Badge2H = () => <span className="hands-badge-2h">2H</span>;

  const renderRows = () => (
    <div className="hands-rows" data-testid="hands-rows">
      {heldRows.map((item) => (
        <div className="hands-row" key={item.uid} data-testid={`hands-row-${item.uid}`}>
          <IconTile item={item} size={26} glow={false} />
          <span className="hands-row-main">
            <span className="hands-row-name">{item.name}</span>
            <span className={`hands-row-state hands-row-state--${itemTint(item)}`}>
              {twoHandedGrip
                ? 'In both hands'
                : `In Hand ${slot1 === item ? 1 : 2}`}
              {twoHandedGrip && <Badge2H />}
            </span>
          </span>
          <button
            type="button"
            className="hands-btn hands-btn--neutral"
            aria-label={`${isWeapon(item) ? 'Sheathe' : 'Stow'} ${item.name}`}
            onClick={() => stowHeld(item)}
          >
            {isWeapon(item) ? 'Sheathe' : 'Stow'} <ActionSymbol cost={1} />
          </button>
        </div>
      ))}
      {worn.map((item) => (
        <div className="hands-row hands-row--worn" key={item.uid} data-testid={`hands-row-${item.uid}`}>
          <IconTile item={item} size={26} glow={false} />
          <span className="hands-row-main">
            <span className="hands-row-name">{item.name}</span>
            <span className="hands-row-state">
              Worn
              {isTwoHanded(item) && <Badge2H />}
            </span>
          </span>
          <button
            type="button"
            className="hands-btn hands-btn--accent"
            aria-label={`Swap ${item.name}`}
            onClick={openSetter}
          >
            Swap <ActionSymbol cost={1} />
          </button>
        </div>
      ))}
      {strappable.map((item) => (
        <div className="hands-row hands-row--strap" key={item.uid} data-testid={`hands-row-${item.uid}`}>
          <IconTile item={item} size={26} glow={false} />
          <span className="hands-row-main">
            <span className="hands-row-name">{item.name}</span>
            {item.strapHand ? (
              <span
                className={`hands-row-state hands-row-state--${item.strapUsable ? 'strapped' : 'blocked'}`}
              >
                On Hand {item.strapHand}
                {!item.strapUsable && ' — hand tied up'}
              </span>
            ) : (
              <span className="hands-row-state">Worn</span>
            )}
          </span>
          {item.strapHand ? (
            <button
              type="button"
              className="hands-btn hands-btn--neutral"
              aria-label={`Unstrap ${item.name}`}
              data-testid={`hands-unstrap-${item.uid}`}
              onClick={() => doUnstrap(item)}
            >
              Unstrap <ActionSymbol cost={1} />
            </button>
          ) : (
            [1, 2].map((n) => (
              <button
                key={n}
                type="button"
                className="hands-btn hands-btn--accent"
                aria-label={`Strap ${item.name} to hand ${n}`}
                data-testid={`hands-strap-${item.uid}-${n}`}
                onClick={() => doStrap(item, n)}
              >
                Strap {n} <ActionSymbol cost={1} />
              </button>
            ))
          )}
        </div>
      ))}
    </div>
  );

  const renderSlot = (n) => {
    const item = pendingItem(n);
    const targeted = effectiveTarget === n;
    return (
      <div
        key={n}
        className={`hands-setter-slot${item ? ' hands-setter-slot--filled' : ' hands-setter-slot--empty'}${targeted ? ' hands-setter-slot--target' : ''}`}
      >
        <button
          type="button"
          className="hands-setter-slot-body"
          aria-pressed={targeted}
          aria-label={`Hand ${n}: ${item ? item.name : 'empty'}`}
          onClick={() => setTarget(n)}
        >
          {item ? (
            <IconTile item={item} size={26} glow={false} />
          ) : (
            <span className="hands-setter-plus" aria-hidden="true">＋</span>
          )}
          <span className="hands-setter-slot-text">
            <span className="hands-setter-slot-label">Hand {n}</span>
            <span className={`hands-setter-slot-name${item ? '' : ' hands-setter-slot-name--empty'}`}>
              {item ? item.name : 'Choose below'}
            </span>
          </span>
        </button>
        {item && (
          <button
            type="button"
            className="hands-setter-release"
            aria-label={`Release ${item.name}`}
            data-testid={`hands-release-${n}`}
            onClick={() => release(n)}
          >
            ×
          </button>
        )}
      </div>
    );
  };

  const renderSetter = () => (
    <div className="hands-setter" data-testid="hands-setter">
      <div className="hands-setter-head">
        <span className="hands-setter-title">Set Hands</span>
        <span className="hands-setter-hint">
          one action <ActionSymbol cost={1} />
        </span>
        <button
          type="button"
          className="hands-setter-cancel"
          data-testid="hands-cancel"
          onClick={cancelSetter}
        >
          Cancel
        </button>
      </div>
      <div className="hands-setter-slots">
        {renderSlot(1)}
        {renderSlot(2)}
      </div>
      <div className="hands-setter-pool-label">Worn — tap to place</div>
      <div className="hands-setter-pool">
        {pool.length === 0 && (
          <p className="hands-setter-empty">Nothing worn to draw.</p>
        )}
        {pool.map((item) => (
          <div className="hands-pool-row" key={item.uid}>
            <IconTile item={item} size={26} glow={false} />
            <span className="hands-pool-name">
              {item.name}
              {isTwoHanded(item) && <Badge2H />}
            </span>
            {isTwoHanded(item) ? (
              <button
                type="button"
                className="hands-btn hands-btn--neutral"
                data-testid={`hands-place-${item.uid}`}
                onClick={() => placeBoth(item.uid)}
              >
                Both hands
              </button>
            ) : (
              <button
                type="button"
                className="hands-btn hands-btn--neutral"
                data-testid={`hands-place-${item.uid}`}
                onClick={() => placeOne(item.uid)}
              >
                Hand {effectiveTarget}
              </button>
            )}
          </div>
        ))}
      </div>
      <button
        type="button"
        className="hands-setter-confirm"
        data-testid="hands-confirm"
        onClick={confirmSetter}
      >
        Confirm hands <ActionSymbol cost={1} />
      </button>
    </div>
  );

  return (
    <section className="hands-group" aria-label="Hands">
      <div className="deck-sec deck-sec--ember">
        <span className="deck-sec-label">Hands</span>
        <span className="deck-sec-rule" aria-hidden="true" />
        <span className="deck-sec-right">
          Interact <ActionSymbol cost={1} />
        </span>
      </div>
      {setterOpen ? renderSetter() : renderRows()}
    </section>
  );
};

export default HandsGroup;
