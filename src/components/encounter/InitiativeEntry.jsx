import React, { useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useBystander } from '../../hooks/useBystander';
import { hasFeat } from '../../utils/CharacterUtils';
import './InitiativeEntry.css';

const fmtMod = (n) => `${n >= 0 ? '+' : ''}${n}`;

// Setup-phase banner shown above HandsPanel in the Encounter tab. Each player
// enters their roll into their own sheet — the GM panel waits until every
// entry has a number before enabling "Begin Round 1". Renders nothing
// outside the setup phase or for characters that aren't in the order
// (so e.g. a viewing-only screen stays empty).
//
// Harmless Bystander (#226 Slice D): if the character has the feat, a toggle
// switches the entry into "roll a d20, we add your Deception modifier" mode —
// the app computes the total and broadcasts the declaration so the GM sees it.
const InitiativeEntry = ({ charId: charIdProp, character }) => {
  const charId = character?.id ?? charIdProp;
  const { encounter, setInitiative } = useEncounter();
  const [scoutBonusCharId] = useSyncedState('cnmh_scoutbonus_global', null);
  const model = useCharacter(character);
  const { active: bystanderActive, declare, clear } = useBystander(charId);
  const [d20, setD20] = useState('');

  if (!encounter || encounter.phase !== 'setup') return null;
  const entry = (encounter.order || []).find(
    (e) => e && e.kind === 'pc' && e.charId === charId
  );
  if (!entry) return null;

  const hasBystander = !!character && hasFeat(character, 'Harmless Bystander');
  const deceptionMod = model?.skillModifiers?.deception ?? 0;
  const total = d20 === '' ? null : Number(d20) + deceptionMod;

  const handleToggle = (on) => {
    if (on) {
      declare('deception');
      setInitiative(entry.entryId, d20 === '' ? null : Number(d20) + deceptionMod);
    } else {
      clear();
      setD20('');
      setInitiative(entry.entryId, null); // back to manual total entry
    }
  };

  const handleD20 = (value) => {
    setD20(value);
    setInitiative(entry.entryId, value === '' ? null : Number(value) + deceptionMod);
  };

  return (
    <div className="initiative-entry" role="region" aria-label="Initiative entry">
      {scoutBonusCharId && scoutBonusCharId !== charId && (
        <div className="initiative-entry-scout">
          +1 circumstance bonus to initiative — Scout active
        </div>
      )}
      <div className="initiative-entry-inner">
        <div className="initiative-entry-prompt">
          <strong>Roll for initiative.</strong> Enter your roll below — the GM
          will start Round 1 once everyone has theirs in.
        </div>

        {hasBystander && (
          <label className="initiative-entry-bystander">
            <input
              type="checkbox"
              aria-label="harmless-bystander-toggle"
              checked={bystanderActive}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <span>Harmless Bystander — roll Deception ({fmtMod(deceptionMod)}) instead of Perception</span>
          </label>
        )}

        {bystanderActive ? (
          <>
            <label className="initiative-entry-field">
              <span>Your d20 roll</span>
              <input
                aria-label="d20-input"
                type="number"
                value={d20}
                onChange={(e) => handleD20(e.target.value)}
              />
            </label>
            <div className="initiative-entry-breakdown" aria-label="initiative-breakdown">
              {d20 === ''
                ? `Deception ${fmtMod(deceptionMod)}`
                : `d20 ${d20} + Deception ${fmtMod(deceptionMod)} = ${total}`}
            </div>
          </>
        ) : (
          <label className="initiative-entry-field">
            <span>Your initiative</span>
            <input
              aria-label="initiative-input"
              type="number"
              value={entry.initiative ?? ''}
              onChange={(e) => setInitiative(entry.entryId, e.target.value)}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export default InitiativeEntry;
