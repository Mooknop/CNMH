import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useWardSweep } from '../../hooks/useWardSweep';
import { characterHasShieldWard } from '../../utils/ward';

// Null-rendering: strips a champion's Devoted Guardian ward from allies when
// their shield is no longer raised. Mounted once at app root alongside
// AuraKoSync; GM-only writer (gated inside the hook). One watcher per
// ward-capable character so each holds its own shield-state subscription.
const WardWatcher = ({ character }) => {
  useWardSweep(character);
  return null;
};

const WardSync = () => {
  const { characters } = useContent();
  const guardians = (characters || []).filter(characterHasShieldWard);
  return (
    <>
      {guardians.map((c) => (
        <WardWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default WardSync;
