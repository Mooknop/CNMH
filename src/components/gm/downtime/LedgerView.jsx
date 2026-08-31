import React from 'react';
import DowntimeViewStub from './DowntimeViewStub';

// Downtime dock — Party ledger view (#1853 wave 1 placeholder). Wave 2
// re-houses DowntimePartyLedger here as a day-ribbon board: a day-number header
// row, then one row per PC whose committed activities become proportionally
// sized segments in the activity hues from data/downtimeActivities.js, with the
// unspent remainder as a single trailing dashed "Free" segment.
const LedgerView = () => (
  <DowntimeViewStub
    title="Ledger"
    summary="How the party's days are committed"
    note="The party ledger's day ribbon — one row per PC, one segment per committed activity — moves here from the downtime tab."
  />
);

export default LedgerView;
