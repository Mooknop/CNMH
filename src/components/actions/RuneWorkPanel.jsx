import React from 'react';
import { useRuneWork } from '../../hooks/useRuneWork';
import { orderStatus } from '../../utils/runeWorkOrder';
import './RuneWorkPanel.css';

// "At the smith" — a player's pending rune work orders (#802). Each shows the
// weapon, the rune being etched, and a status: ready to collect, waiting on the
// 24h turnaround, or waiting to be back in the shop's town. Collect is enabled
// only when the order is ready; collecting returns the runed weapon.
const RuneWorkPanel = ({ character }) => {
  const { orders, collect, nowSeconds, locationId } = useRuneWork(character?.id);
  if (!orders.length) return null;

  return (
    <div className="rune-work" data-testid="rune-work-panel">
      <div className="rune-work-head">
        <span role="img" aria-label="Anvil">⚒️</span>
        <span className="rune-work-title">At the smith</span>
        <span className="rune-work-count">{orders.length}</span>
      </div>
      <ul className="rune-work-list" aria-label="rune work orders">
        {orders.map((o) => {
          const st = orderStatus(o, nowSeconds, locationId);
          const statusText = st.ready
            ? 'Ready to collect'
            : st.waitingTime && st.waitingPlace
              ? 'Etching — return to the shop’s town once it’s done'
              : st.waitingTime
                ? 'Etching (ready 24h after purchase)'
                : 'Ready — return to the shop’s town to collect';
          return (
            <li key={o.id} className="rune-work-row" data-testid={`rune-work-${o.id}`}>
              <div className="rune-work-info">
                <span className="rune-work-weapon">{o.weaponName}</span>
                <span className="rune-work-rune">+ {o.runeName}</span>
                <span className={`rune-work-status${st.ready ? ' is-ready' : ''}`}>{statusText}</span>
              </div>
              <button
                type="button"
                className="btn-small btn-primary rune-work-collect"
                disabled={!st.ready}
                onClick={() => collect(o.id)}
              >
                Collect
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default RuneWorkPanel;
