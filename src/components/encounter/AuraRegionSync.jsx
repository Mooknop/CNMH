import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useAuraRegionSync } from '../../hooks/useAuraRegionSync';
import { characterHasKineticAura } from '../../utils/kineticAura';

// Null-rendering: mirrors each kineticist's aura activation to Foundry as
// `auraset` (#1733 S1 app half). Mounted once at app root alongside
// AuraKoSync; GM-only writer (gated inside the hook). One watcher per
// kineticist so each holds its own synced-aura subscription — same shape as
// AuraKoSync/AuraKoWatcher.
const AuraRegionWatcher = ({ character }) => {
  useAuraRegionSync(character);
  return null;
};

const AuraRegionSync = () => {
  const { characters } = useContent();
  const kineticists = (characters || []).filter(characterHasKineticAura);
  return (
    <>
      {kineticists.map((c) => (
        <AuraRegionWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default AuraRegionSync;
