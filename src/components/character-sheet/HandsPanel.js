import React, { useMemo, useState } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { useLoadout } from '../../hooks/useLoadout';
import ActionIcon from '../shared/ActionIcon';
import './HandsPanel.css';

// Encounter tab: just the two hand slots + a SWAP flow. Everything else
// (drop / pick up / stow / retrieve / unhand / release) lives in the Inventory
// tab. Hands are derived from the effective tree; SWAP writes the loadout
// atomically via useLoadout().setHands. Source is the character's currently
// Worn items; an item bumped out of a hand returns to Worn.

const HandsPanel = ({ character, characterColor }) => {
  const charData = useCharacter(character);
  const cid = charData ? charData.id : character && character.id;
  const { setHands } = useLoadout(cid);

  const inventory = useMemo(
    () => (charData ? charData.inventory : []),
    [charData]
  );

  // Current hand occupants from the effective tree.
  const { slot1, slot2 } = useMemo(() => {
    const two = inventory.find((e) => e && e.state === 'held2');
    if (two) return { slot1: two, slot2: two };
    const ones = inventory.filter((e) => e && e.state === 'held1');
    const byHand = (h) => ones.find((e) => e.hand === h);
    return {
      slot1: byHand(1) || ones.find((e) => e.hand == null) || null,
      slot2: byHand(2) || ones.filter((e) => e.hand == null)[1] || null,
    };
  }, [inventory]);

  const wornItems = useMemo(
    () => inventory.filter((e) => e && e.state === 'worn'),
    [inventory]
  );

  const [swapping, setSwapping] = useState(false);
  const [pending, setPending] = useState({ h1: null, h2: null });

  if (!charData) return null;

  const openSwap = () => {
    setPending({
      h1: slot1 ? slot1.uid : null,
      h2: slot2 ? slot2.uid : null,
    });
    setSwapping(true);
  };
  const cancel = () => setSwapping(false);
  const confirm = () => {
    setHands({ hand1: pending.h1, hand2: pending.h2 });
    setSwapping(false);
  };

  const nameFor = (uid) => {
    if (!uid) return null;
    const e = inventory.find((x) => x && x.uid === uid);
    return e ? e.name : uid;
  };
  const assign = (hand, uid) =>
    setPending((p) => ({ ...p, [hand]: p[hand] === uid ? null : uid }));

  const Slot = ({ n, item }) => (
    <div className="hands-slot" data-testid={`hands-slot-${n}`}>
      <span className="hands-slot-label">Hand {n}</span>
      <span className="hands-slot-item">{item ? item.name : 'Empty'}</span>
    </div>
  );

  return (
    <section className="hands-panel" aria-label="hands">
      <div className="hands-header">
        <h3>Hands</h3>
      </div>

      <div className="hands-slots">
        <Slot n={1} item={slot1} />
        <Slot n={2} item={slot2} />
      </div>

      {!swapping ? (
        <button className="btn-small btn-primary" data-testid="hands-swap" onClick={openSwap}>
          Swap <ActionIcon actionText="One Action" size="small" showTooltip={false} />
        </button>
      ) : (
        <div className="hands-swap" data-testid="hands-swap-panel">
          <div className="hands-pending">
            <div>
              <strong>Hand 1:</strong>{' '}
              <span data-testid="hands-pending-1">{nameFor(pending.h1) || 'Empty'}</span>
              {pending.h1 && (
                <button
                  className="btn-small btn-secondary"
                  data-testid="hands-clear-1"
                  onClick={() => setPending((p) => ({ ...p, h1: null }))}
                >
                  Clear
                </button>
              )}
            </div>
            <div>
              <strong>Hand 2:</strong>{' '}
              <span data-testid="hands-pending-2">{nameFor(pending.h2) || 'Empty'}</span>
              {pending.h2 && (
                <button
                  className="btn-small btn-secondary"
                  data-testid="hands-clear-2"
                  onClick={() => setPending((p) => ({ ...p, h2: null }))}
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <p className="hands-pick-hint">Choose worn items for each hand (same item in both = two-handed):</p>
          <div className="hands-pick-list">
            {wornItems.length === 0 && <p className="hands-empty">No worn items to draw.</p>}
            {wornItems.map((e) => (
              <div className="hands-pick-row" data-testid={`hands-pick-${e.uid}`} key={e.uid}>
                <span className="hands-pick-name">{e.name}</span>
                <span className="hands-pick-btns">
                  <button
                    className={`btn-small ${pending.h1 === e.uid ? 'btn-primary' : 'btn-secondary'}`}
                    aria-label={`pick-${e.uid}-h1`}
                    onClick={() => assign('h1', e.uid)}
                  >
                    Hand 1
                  </button>
                  <button
                    className={`btn-small ${pending.h2 === e.uid ? 'btn-primary' : 'btn-secondary'}`}
                    aria-label={`pick-${e.uid}-h2`}
                    onClick={() => assign('h2', e.uid)}
                  >
                    Hand 2
                  </button>
                </span>
              </div>
            ))}
          </div>

          <div className="hands-swap-actions">
            <button className="btn-small btn-primary" data-testid="hands-confirm" onClick={confirm}>
              Confirm
            </button>
            <button className="btn-small btn-secondary" data-testid="hands-cancel" onClick={cancel}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
};

export default HandsPanel;
