import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useAuraRegionSync } from '../../hooks/useAuraRegionSync';

// Null-rendering: mirrors whatever aura each character projects to Foundry as
// `auraset` (#1733 S1 app half). Mounted once at app root alongside
// AuraKoSync; GM-only writer (gated inside the hook). One watcher per
// character so each holds its own synced subscriptions — same shape as
// AuraKoSync/AuraKoWatcher.
//
// Every character, not just the ones with a class aura (#1733 S3): an effect
// aura (Courageous Anthem) belongs to whoever cast it, and that is a runtime
// fact about the effect list, not a static fact about the sheet — a predicate
// here could only guess. The hook itself is the gate: a character with no
// authored aura of any kind never sends a thing, so the extra watchers cost a
// synced-state subscription each and nothing on the wire.
const AuraRegionWatcher = ({ character }) => {
  useAuraRegionSync(character);
  return null;
};

const AuraRegionSync = () => {
  const { characters } = useContent();
  return (
    <>
      {(characters || []).map((c) => (
        <AuraRegionWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default AuraRegionSync;
