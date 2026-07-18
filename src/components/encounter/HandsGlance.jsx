import React, { useMemo } from 'react';
import { useCharacter } from '../../hooks/useCharacter';
import { deriveHands } from '../../utils/hands';
import IconTile from '../inventory/IconTile';
import './HandsGlance.css';

// Encounter tab: the slim, read-only at-a-glance hands strip (hand-management
// redesign). Replaces the boxy HandsPanel — every hand CHANGE now lives in the
// Segmented Deck's Items segment (HandsGroup); this strip only reflects the
// result, framed by a hand mark on each end. A two-handed grip renders as one
// chip spanning the row with a 2H badge; an empty hand keeps a dashed
// placeholder chip so both slots always read.

// Strapped-shield marker (bucklers S3): a buckler rides its hand chip without
// occupying the slot. Dimmed while the hand is tied up (can't Raise/Activate).
const StrapBadge = ({ strap }) => (
  <span
    className={`hands-glance-strapbadge${strap.strapUsable ? '' : ' hands-glance-strapbadge--blocked'}`}
    data-testid={`hands-glance-strap-${strap.strapHand}`}
    title={`${strap.name} strapped on${strap.strapUsable ? '' : ' — hand tied up'}`}
  >
    🛡
  </span>
);

const Chip = ({ item, slotLabel, twoHanded, n, straps = [] }) => {
  const badges = straps.filter(Boolean).map((s) => <StrapBadge key={s.uid} strap={s} />);
  if (!item) {
    return (
      <span className="hands-glance-chip hands-glance-chip--empty" data-testid={`hands-glance-slot-${n}`}>
        <span className="hands-glance-plus" aria-hidden="true">＋</span>
        <span className="hands-glance-text">
          <span className="hands-glance-name hands-glance-name--empty">Empty</span>
          <span className="hands-glance-slot">{slotLabel}{badges}</span>
        </span>
      </span>
    );
  }
  return (
    <span
      className={`hands-glance-chip${twoHanded ? ' hands-glance-chip--2h' : ''}`}
      data-testid={twoHanded ? 'hands-glance-both' : `hands-glance-slot-${n}`}
    >
      <IconTile item={item} size={26} glow={false} />
      <span className="hands-glance-text">
        <span className="hands-glance-name">
          {item.name}
          {twoHanded && <span className="hands-glance-badge">2H</span>}
        </span>
        <span className="hands-glance-slot">{slotLabel}{badges}</span>
      </span>
    </span>
  );
};

const HandsGlance = ({ character }) => {
  const charData = useCharacter(character);
  const inventory = useMemo(() => (charData ? charData.inventory : []), [charData]);
  const { slot1, slot2, strap1, strap2 } = useMemo(() => deriveHands(inventory), [inventory]);
  if (!charData) return null;

  const twoHanded = !!slot1 && slot1 === slot2;

  return (
    <section className="hands-glance" aria-label="Hands" data-testid="hands-glance">
      <i className="ti ti-hand-stop hands-glance-hand" aria-hidden="true" />
      {twoHanded ? (
        <Chip item={slot1} slotLabel="Both hands" twoHanded straps={[strap1, strap2]} />
      ) : (
        <>
          <Chip item={slot1} slotLabel="Hand 1" n={1} straps={[strap1]} />
          <Chip item={slot2} slotLabel="Hand 2" n={2} straps={[strap2]} />
        </>
      )}
      <i className="ti ti-hand-stop hands-glance-hand hands-glance-hand--mirror" aria-hidden="true" />
    </section>
  );
};

export default HandsGlance;
