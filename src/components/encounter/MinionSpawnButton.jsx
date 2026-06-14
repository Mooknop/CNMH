import React from 'react';
import { useMinionActors } from '../../hooks/useMinionActors';
import './MinionSpawnButton.css';

// Spawns a linked minion's token onto the active Foundry scene (#362). Renders
// nothing until the bridge has derived a Foundry-actor link for this owner/role.
// Once the minion is on the scene the button stays visible but disabled so the
// player/GM can see it's already placed. Shared by the companion/familiar modals
// and the GM encounter page.
const MinionSpawnButton = ({ ownerId, role, className = '' }) => {
  const { linkFor, spawn } = useMinionActors();
  const link = linkFor(ownerId, role);
  if (!link) return null;

  const label = link.onScene ? `${link.name} is on the map` : `Spawn ${link.name} on the map`;

  return (
    <button
      type="button"
      className={`btn-secondary minion-spawn-btn${className ? ` ${className}` : ''}`}
      onClick={() => spawn(ownerId, role)}
      disabled={link.onScene}
      aria-label={label}
      title={label}
    >
      {link.onScene ? 'On map' : 'Spawn on map'}
    </button>
  );
};

export default MinionSpawnButton;
