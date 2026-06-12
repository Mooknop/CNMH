// GM remediation: override a character's Eld attunement (cnmh_eldattune_<id>)
// without running daily preparations. Players normally set this through the
// DailyPrepModal; this is the GM's escape hatch for mis-taps and corrections.
// Renders nothing when no character has Eld Powers.

import React from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import './EldAttunementControl.css';

const AttunementRow = ({ character }) => {
  const [attuned, setAttuned] = useSyncedState(`cnmh_eldattune_${character.id}`, '');
  const { appendEvent } = useSessionLog();
  const sources = (character.spellcasting?.eldPowers || []).map((s) => s.source);

  const onChange = (value) => {
    setAttuned(value);
    appendEvent({
      type: 'gm',
      text: value
        ? `GM: set ${character.name}'s Eld attunement to ${value}`
        : `GM: cleared ${character.name}'s Eld attunement`,
    });
  };

  return (
    <div className="gm-eldattune-row">
      <span className="gm-eldattune-char">{character.name}</span>
      <select
        aria-label={`eld-attunement-${character.id}`}
        value={sources.includes(attuned) ? attuned : ''}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— not attuned —</option>
        {sources.map((src) => (
          <option key={src} value={src}>{src}</option>
        ))}
      </select>
    </div>
  );
};

const EldAttunementControl = () => {
  const { characters } = useContent();
  const eldCharacters = (characters || []).filter(
    (c) => (c.spellcasting?.eldPowers || []).length > 0,
  );
  if (eldCharacters.length === 0) return null;

  return (
    <section className="gm-eldattune" aria-label="Eld attunement">
      <h3 className="gm-eldattune-title">Eld Attunement</h3>
      <p className="gm-eldattune-hint">
        Attunement is normally chosen at daily preparations — override it here
        for corrections. Changes are live on the player's sheet.
      </p>
      {eldCharacters.map((c) => (
        <AttunementRow key={c.id} character={c} />
      ))}
    </section>
  );
};

export default EldAttunementControl;
