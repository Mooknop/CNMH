import React from 'react';
import { usePartyDowntime } from '../../../hooks/usePartyDowntime';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { APP, globalKey } from '../../../sync/keys';
import { DOWNTIME_ACTIVITIES } from '../../../data/downtimeActivities';
import { segmentsFor } from '../../../utils/downtimeUtils';
import './DowntimeViews.css';

// Downtime dock — Party ledger view (#1857; fills the rail slot the #1853
// redesign reserved). Read-only: see how the whole party's days are committed
// across the period in one glance. The GM's own "week" allocator lives on the
// player side (DowntimePartyLedger.jsx / the downtime tab) — this view has no
// picker, no lock-in control, nothing to edit.
//
// SHARED SEGMENTS. `segmentsFor` (utils/downtimeUtils.js) is the exact function
// DowntimePartyLedger.jsx uses to turn a PC's `plan` into ordered,
// activity-colored day-groups plus a trailing free block — it was extracted
// here so the player ribbon and this GM ribbon can never drift into two
// different day-accounting rules. Read that util's header for the ordering and
// free-block contract; this file only renders what it returns.
//
// NO "YOU". usePartyDowntime's second argument is the viewer's character id,
// used only to sort them first and flag `isYou` — the GM has neither, so this
// passes `null`. `usePartyActivity` compares `char.id === youId`, which is
// simply false for every PC when `youId` is null (never throws), so every PC
// reads `isYou: false` and the roster keeps its natural order. No hook change
// was needed to support a GM-side caller.
//
// SEGMENT TAP IS OUT OF SCOPE (#1857 spec deferral): the design calls for a
// tap to open that activity's plan-detail modal, but that modal doesn't exist
// yet on the dock — reusing the existing one is future work. Segments carry a
// `title` tooltip ("Research · 3d") and are otherwise inert.
const LedgerView = () => {
  const [block] = useSyncedState(globalKey(APP.DOWNTIMEBLOCK), null);
  const blockActive = block?.active ?? false;
  const blockDays = block?.days ?? 0;
  const blockStartedAt = block?.startedAt ?? null;

  const { party } = usePartyDowntime(blockStartedAt, null, { budget: blockDays });

  return (
    <section className="dock-dt-view" aria-label="Ledger">
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Ledger</h2>
        </div>
        <ul className="dock-dt-ledger-legend">
          {DOWNTIME_ACTIVITIES.map((a) => (
            <li key={a.name} className="dock-dt-ledger-legend-item">
              <span className="dock-dt-ledger-swatch" style={{ background: a.hue }} aria-hidden="true" />
              {a.name}
            </li>
          ))}
          <li className="dock-dt-ledger-legend-item">
            <span className="dock-dt-ledger-swatch dock-dt-ledger-swatch--free" aria-hidden="true" />
            Free
          </li>
        </ul>
      </header>

      <div className="dock-dt-view-body dock-dt-ledger-body">
        {!blockActive ? (
          <div className="dock-dt-placeholder" role="status">
            <span className="dock-dt-placeholder-tag">No block open</span>
            <p>Open a downtime block in the Period view to see the party's ledger.</p>
          </div>
        ) : (
          <>
            <div className="dock-dt-ledger-grid dock-dt-ledger-dayhead">
              <span aria-hidden="true" />
              <div className="dock-dt-ledger-days">
                {Array.from({ length: blockDays }, (_, i) => (
                  <span key={i} className="dock-dt-ledger-day">{i + 1}</span>
                ))}
              </div>
            </div>

            <div className="dock-dt-ledger-rows">
              {party.map((p) => {
                const segs = segmentsFor(p.plan, p.paired, blockDays);
                return (
                  <div
                    key={p.char.id}
                    className="dock-dt-ledger-grid dock-dt-ledger-row"
                    data-testid={`dock-dt-ledger-row-${p.char.id}`}
                  >
                    <div className="dock-dt-ledger-who" style={{ '--c': p.color }}>
                      <span className="dock-dt-ledger-dot" aria-hidden="true" />
                      <div className="dock-dt-ledger-id">
                        <span className="dock-dt-ledger-name">{p.char.name}</span>
                        <span className="dock-dt-ledger-class">{p.char.class}</span>
                      </div>
                    </div>
                    <div className="dock-dt-ledger-ribbon">
                      {segs.map((seg, i) => {
                        const isFree = !seg.name;
                        return (
                          <div
                            key={i}
                            className={`dock-dt-ledger-seg${isFree ? ' dock-dt-ledger-seg--free' : ''}`}
                            style={isFree ? { flex: seg.days } : { flex: seg.days, '--seg-hue': seg.hue }}
                            title={isFree ? `${seg.days} free` : `${seg.name} · ${seg.days}d`}
                          >
                            <span className="dock-dt-ledger-seg-name">{isFree ? 'Free' : seg.name}</span>
                            <span className="dock-dt-ledger-seg-days">{seg.days}d</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </section>
  );
};

export default LedgerView;
