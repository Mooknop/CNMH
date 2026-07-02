import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useVocoderConcealSweep } from '../../hooks/useVocoderConcealSweep';

// Null-rendering: grants/removes the Vocoder of Invisibility's Concealed as a
// PC starts/stops playing (#935). Mounted once at app root alongside
// AuraKoSync/WardSync; GM-only writer (gated inside the hook). One watcher per
// PC — the vocoder can change hands (player transfers, #654), so ownership is
// read from each character's live inventory rather than filtered up front.
const VocoderConcealWatcher = ({ character }) => {
  useVocoderConcealSweep(character);
  return null;
};

const VocoderConcealSync = () => {
  const { characters } = useContent();
  return (
    <>
      {(characters || []).map((c) => (
        <VocoderConcealWatcher key={c.id} character={c} />
      ))}
    </>
  );
};

export default VocoderConcealSync;
