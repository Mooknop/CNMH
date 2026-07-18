import React from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useBridgeStatus } from '../../hooks/useBridgeStatus';
import './SyncStatus.css';

// Four states, keyed off the campaign DO link (`connected`), Foundry bridge
// presence (`foundryConnected`), and the bridge protocol handshake (#1310):
//   Live     — DO up + Foundry up on a current bridge: changes are saved.
//   Stale    — DO up + Foundry up, but the bridge module predates the app's
//              minimum protocol (or never said hello): update it in Foundry.
//   Sandbox  — DO up, Foundry down: explore freely, but nothing is saved (#553).
//   Offline  — DO down: no connection to the campaign at all.
const STATES = {
  live: {
    className: 'sync-live',
    label: '⚡ Live',
    title: 'Live — the game is running, your changes are saved',
  },
  stale: {
    className: 'sync-stale',
    label: '⚠ Bridge outdated',
    title: 'Foundry is connected but the CNMH Bridge module is out of date — features will misbehave. Update the module in Foundry (Add-on Modules) and reload.',
  },
  sandbox: {
    className: 'sync-sandbox',
    label: '🧪 Sandbox',
    title: 'Sandbox — Foundry isn’t connected. Explore freely; nothing you do is saved.',
  },
  offline: {
    className: 'sync-offline',
    label: '○ Offline',
    title: 'Offline — no connection to the campaign',
  },
  // DO link down but writes made in the gap are queued (SessionContext
  // pendingSends) — they flush automatically on reconnect. Distinct from plain
  // Offline so a player mid-action knows their click wasn't eaten.
  pending: {
    className: 'sync-pending',
    label: '⏳ Reconnecting…',
    title: 'Reconnecting — your recent changes are pending and will sync automatically when the connection returns',
  },
};

const SyncStatus = () => {
  const { connected, foundryConnected, pendingWrites } = useSession();
  const { outdated } = useBridgeStatus();
  const key = !connected
    ? (pendingWrites > 0 ? 'pending' : 'offline')
    : !foundryConnected
    ? 'sandbox'
    : outdated
    ? 'stale'
    : 'live';
  const state = STATES[key];
  return (
    <span
      data-testid="sync-status"
      // E2E waits on this to know the relay subscription is live — it tracks the
      // DO link, not Foundry presence, so it stays meaningful in the bridge-less
      // test stack.
      data-connected={connected}
      data-state={key}
      className={`sync-badge ${state.className}`}
      title={state.title}
    >
      {state.label}
    </span>
  );
};

export default SyncStatus;
