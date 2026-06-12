import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useAuraKoSweep } from '../../hooks/useAuraKoSweep';
import { characterHasKineticAura } from '../../utils/kineticAura';

// Null-rendering: deactivates a kineticist's aura when their HP hits 0
// (Channel Elements ends on KO). Mounted once at app root alongside
// EffectExpirySync so it runs regardless of which page is open; GM-only
// writer (gated inside the hook). One watcher per kineticist so each gets
// its own synced hp/aura subscription.
const AuraKoWatcher = ({ character }) => {
  useAuraKoSweep(character);
  return null;
};

const AuraKoSync = () => {
  const { characters } = useContent();
  const kineticists = (characters || []).filter(characterHasKineticAura);
  return (
    <>
      {kineticists.map((c) => (
        <AuraKoWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default AuraKoSync;
