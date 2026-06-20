import React, { createContext, useContext, useState, useMemo } from 'react';

// Local-only play-mode override for the offline sandbox (#554). When Foundry is
// disconnected, players pick a mode (encounter / exploration / downtime) to roam
// the app untethered from the GM. This lives ONLY in memory — it is never synced
// and never written to localStorage, so it can't leak into real campaign state
// and vanishes on reload. usePlayMode reads it and applies it solely while in the
// sandbox; when live, Foundry + the GM-set global key stay authoritative.

const DEFAULT = { localMode: null, setLocalMode: () => {} };

const PlayModeOverrideContext = createContext(DEFAULT);

export const PlayModeOverrideProvider = ({ children }) => {
  const [localMode, setLocalMode] = useState(null);
  const value = useMemo(() => ({ localMode, setLocalMode }), [localMode]);
  return (
    <PlayModeOverrideContext.Provider value={value}>
      {children}
    </PlayModeOverrideContext.Provider>
  );
};

// Safe default when no provider is mounted (e.g. unit tests rendering a
// usePlayMode consumer bare): the override is simply inert.
export const usePlayModeOverride = () => useContext(PlayModeOverrideContext) || DEFAULT;

export { PlayModeOverrideContext };
