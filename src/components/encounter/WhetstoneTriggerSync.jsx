import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useWhetstoneHpTrigger } from '../../hooks/useWhetstoneHpTrigger';

// Null-rendering: fires HP-threshold whetstone triggers (#1216 — Valorous
// Coin) when a wielder drops below the item's HP fraction. Mounted once at
// app root alongside EffectExpirySync / AuraKoSync; GM-only writer (gated
// inside the hook). One watcher per character so each gets its own synced
// hp/effects subscription.
const WhetstoneTriggerWatcher = ({ character }) => {
  useWhetstoneHpTrigger(character);
  return null;
};

const WhetstoneTriggerSync = () => {
  const { characters } = useContent();
  return (
    <>
      {(characters || []).map((c) => (
        <WhetstoneTriggerWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default WhetstoneTriggerSync;
