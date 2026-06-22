import React from 'react';
import { formatBulk, getBulkStatus } from '../../utils/InventoryUtils';

/**
 * Bulk meter for the inventory "Loadout Grid". A label + mono `used / limit`
 * readout whose colour shifts accent → gold (encumbered) → peril (at/over the
 * limit), over a 7px track with a tick mark at the encumbered threshold. The
 * accent is the character's theme colour (`var(--color-theme)` from the
 * surrounding scope), so no colour is threaded through as a prop.
 *
 * Encumbrance semantics come from the shared `getBulkStatus` helper so the bar
 * stays consistent with the rest of the app (#527/Bulk).
 *
 * @param {Object} props
 * @param {number} props.bulkUsed - Current Bulk carried
 * @param {number} props.encumberedThreshold - Bulk at which encumbered begins
 * @param {number} props.bulkLimit - Maximum Bulk before overencumbered
 */
const BulkBar = ({ bulkUsed, encumberedThreshold, bulkLimit }) => {
  const { percentage, isEncumbered, isOverencumbered } = getBulkStatus(
    bulkUsed,
    bulkLimit,
    encumberedThreshold
  );
  const fillPct = Math.min(100, Math.max(0, percentage));
  const tickPct =
    bulkLimit > 0 ? Math.min(100, (encumberedThreshold / bulkLimit) * 100) : 0;

  const cls = [
    'bulkbar',
    isOverencumbered ? 'is-over' : isEncumbered ? 'is-encumbered' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={cls} data-testid="inventory-bulkbar">
      <div className="bulkbar-row">
        <span className="bulkbar-label">Bulk</span>
        <span className="bulkbar-val">
          {formatBulk(bulkUsed)}
          <span className="bulkbar-sep">/</span>
          {bulkLimit}
          {(isEncumbered || isOverencumbered) && (
            <span className="bulkbar-flag">Encumbered</span>
          )}
        </span>
      </div>
      {/* Tick marks the encumbered threshold; the fill width is the only truly
          dynamic value, bridged through a CSS custom property. */}
      <div className="bulkbar-track" style={{ '--bulk-tick-x': `${tickPct}%` }}>
        <div className="bulkbar-fill" style={{ '--bulk-fill-w': `${fillPct}%` }} />
        <span className="bulkbar-tick" aria-hidden="true" />
      </div>
    </div>
  );
};

export default BulkBar;
