import React from 'react';
import DowntimeViewStub from './DowntimeViewStub';

// Downtime dock — Party inventory view (#1853 wave 1 placeholder). A NEW
// surface: one column per PC (hands strip over stowed items, per useLoadout),
// with a tap-item-then-tap-destination model instead of drag and drop, and a
// persistent selection bar along the bottom. Moves must respect bulk limits and
// hand availability and refuse with an inline message, never a silent drop.
const InventoryView = () => (
  <DowntimeViewStub
    title="Inventory"
    summary="Tap an item, then tap a destination"
    note="Hand items between party members and containers without leaving the dock — one column per PC, built for touch."
  />
);

export default InventoryView;
