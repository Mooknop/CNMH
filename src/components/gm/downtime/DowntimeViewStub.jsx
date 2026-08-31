import React from 'react';
import './DowntimeViews.css';

// Shared body for the downtime views the #1853 shell reserves a rail slot for
// but does not yet fill (Period, Ledger, Training, Inventory, Resources).
//
// It is NOT a view: it renders the view frame (`.dock-dt-view`, the two-row
// grid that makes a view fill the screen instead of hugging its content) plus
// the shared section-header pattern, so a wave-2 slice replaces only the body.
// The point of shipping the frame empty is that the no-scroll chain is provable
// on all seven rail slots before any of them has content to overflow with.
//
// Props: `title` (the h2 and the view's aria-label), `summary` (the header's
// right-hand string) and `note` (what the finished view will hold).
const DowntimeViewStub = ({ title, summary, note }) => (
  <section className="dock-dt-view" aria-label={title}>
    <header className="dock-dt-head">
      <div className="dock-dt-title">
        <span className="dock-dt-kicker">Downtime</span>
        <h2 className="dock-dt-heading">{title}</h2>
      </div>
      <span className="dock-dt-count">{summary}</span>
    </header>

    <div className="dock-dt-placeholder" role="status">
      <span className="dock-dt-placeholder-tag">Not built yet</span>
      <p>{note}</p>
    </div>
  </section>
);

export default DowntimeViewStub;
