import React from 'react';
import DowntimeViewStub from './DowntimeViewStub';

// Downtime dock — Training board view (#1853 wave 1 placeholder). Wave 2
// re-houses PartyTrainingBoard here as a two-column card grid: one card per PC
// with a bar per in-progress track, a +8 h button and a completion confirm.
// Training tracks are NOT period-scoped — they persist across downtime blocks —
// so this view shows standing state, independent of the active block.
const TrainingView = () => (
  <DowntimeViewStub
    title="Training"
    summary="Tracks persist across periods"
    note="The party training board — hours banked against each track's benchmark, plus completion confirmation — moves here from the GM console."
  />
);

export default TrainingView;
