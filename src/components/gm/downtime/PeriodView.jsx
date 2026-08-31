import React from 'react';
import DowntimeViewStub from './DowntimeViewStub';

// Downtime dock — Period & clock view (#1853 wave 1 placeholder). Wave 2
// re-houses DowntimeControl's period setter here: days granted (+/− and
// Update, which resizes the OPEN period in place without re-stamping it),
// "Close block without advancing" behind ConfirmDialog, the per-PC locked-in
// list, and the per-PC task-level / benchmark override table whose DC column is
// read from utils/earnIncome (the Earn Income table is not linear — never
// recompute it with a formula).
const PeriodView = () => (
  <DowntimeViewStub
    title="Period"
    summary="Block length, lock-ins and per-PC overrides"
    note="The downtime period setter, the party's lock-in list and the per-PC task-level and benchmark overrides move here from the GM console."
  />
);

export default PeriodView;
