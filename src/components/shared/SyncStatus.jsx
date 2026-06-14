import React from 'react';
import { useSession } from '../../contexts/SessionContext';
import './SyncStatus.css';

const SyncStatus = () => {
  const { connected } = useSession();
  return (
    <span
      data-testid="sync-status"
      data-connected={connected}
      className={`sync-badge ${connected ? 'sync-live' : 'sync-offline'}`}
      title={connected ? 'Live — synced with the campaign' : 'Offline — changes saved locally'}
    >
      {connected ? '⚡ Live' : '○ Offline'}
    </span>
  );
};

export default SyncStatus;
