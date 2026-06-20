import React from 'react';
import { useSession } from '../../contexts/SessionContext';
import './SyncStatus.css';

// Three states, keyed off the campaign DO link (`connected`) and Foundry bridge
// presence (`foundryConnected`):
//   Live     — DO up + Foundry up: the game is running, changes are saved.
//   Sandbox  — DO up, Foundry down: explore freely, but nothing is saved (#553).
//   Offline  — DO down: no connection to the campaign at all.
const STATES = {
  live: {
    className: 'sync-live',
    label: '⚡ Live',
    title: 'Live — the game is running, your changes are saved',
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
};

const SyncStatus = () => {
  const { connected, foundryConnected } = useSession();
  const key = !connected ? 'offline' : foundryConnected ? 'live' : 'sandbox';
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
