import React from 'react';
import DowntimeViewStub from './DowntimeViewStub';

// Downtime dock — Resources view (#1853 wave 1 placeholder). A NEW surface: one
// row per PC with HP steppers, focus pips and spell-slot pips read from real
// character data, plus a per-PC Rest. The footer's "Rest for the night"
// restores everything and advances the clock 8 hours — destructive to in-flight
// encounter state, so it routes through ConfirmDialog.
const ResourcesView = () => (
  <DowntimeViewStub
    title="Resources"
    summary="Hit points, focus, spell slots"
    note="Restore hit points, focus points and spell slots between encounters and overnight, per PC or for the whole party."
  />
);

export default ResourcesView;
