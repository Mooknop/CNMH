import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useCodaPlayingSweep } from '../../hooks/useCodaPlayingSweep';

// Null-rendering: grants/removes the Coda staves' while-playing bonuses as a
// PC starts/stops playing (#935). Mounted once at app root alongside
// VocoderConcealSync; GM-only writer (gated inside the hook). One watcher per
// PC — the instruments can change hands (player transfers, #654), so ownership
// is read from each character's live inventory rather than filtered up front.
const CodaPlayingWatcher = ({ character }) => {
  useCodaPlayingSweep(character);
  return null;
};

const CodaPlayingSync = () => {
  const { characters } = useContent();
  return (
    <>
      {(characters || []).map((c) => (
        <CodaPlayingWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default CodaPlayingSync;
