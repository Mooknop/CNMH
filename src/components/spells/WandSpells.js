import React from 'react';
import { organizeSpellsByRank, getSortedRankList, filterSpellsByDefense } from '../../utils/SpellUtils';
import useLocalStorage from '../../hooks/useLocalStorage';

const SpellNameChip = ({ spell, character }) => {
  const isSignature = !!spell.signature;
  const isBloodline = !!spell.bloodline;

  const chipClass = `spell-name-chip${isSignature ? ' signature-indicator' : isBloodline ? ' bloodline-indicator' : ''}`;
  const symbol = isSignature ? '★' : isBloodline ? '✦' : null;
  const tooltipText = isSignature
    ? 'Signature Spell: Cast at any rank up to your highest available spell rank.'
    : isBloodline
    ? (character?.spellcasting?.bloodline?.blood_magic || '')
    : null;

  const aonUrl = `https://2e.aonprd.com/Search.aspx?q=${encodeURIComponent(spell.name)}`;

  return (
    <div className={chipClass}>
      <a
        className="chip-name"
        href={aonUrl}
        target="_blank"
        rel="noopener noreferrer"
      >
        {spell.name}
      </a>
      {symbol && <span className="chip-symbol">{symbol}</span>}
      {tooltipText && <div className="spell-tooltip">{tooltipText}</div>}
    </div>
  );
};

const WandInfoBox = ({ themeColor }) => (
  <div className="bloodline-info">
    <h3 style={{ color: themeColor }}>Using Wands</h3>
    <p className="bloodline-description">
      To cast a spell from a wand, you must hold the wand in one hand and activate it with a Cast a Spell activity.
      This uses the spell's normal number of actions. A spell cast from a wand has the standard effects of that spell for someone
      of your level, without the need to meet the spell's requirements. A wand's spells are automatically heightened to half the
      wand's level rounded up. Each wand can be used to cast its spell only once per day without risking the wand's destruction.
    </p>
    <div className="bloodline-magic">
      <span className="bloodline-magic-label">Overcharging Wands:</span>
      <span className="bloodline-magic-effect">
        After the spell is cast from the wand for the day, you can attempt to cast it one more time—overcharging the wand at the risk of destroying it.
        Cast the Spell again, then roll a DC 10 flat check. On a success, the wand is broken.
        On a failure, the wand is destroyed.
        If anyone tries to overcharge a wand when it's already been overcharged that day, the wand is automatically destroyed (even if it had been repaired) and no spell is cast.
      </span>
    </div>
  </div>
);

const wandKey = (spell) => spell.wandName || spell.id;

// State cycle per wand: 'available' → 'used' → 'overcharged' → 'available'
const WandSpells = ({ spells, themeColor, defenseFilter, activeSpellRank, character }) => {
  const characterKey = character?.name || 'unknown';
  const [wandStates, setWandStates] = useLocalStorage(
    `cnmh_wands_${characterKey}`,
    () => Object.fromEntries(spells.map(s => [wandKey(s), 'available']))
  );

  const handleSlotClick = (key) => {
    setWandStates(prev => ({
      ...prev,
      [key]: prev[key] === 'available' ? 'used' : 'available',
    }));
  };

  const handleOvercharge = (key) => {
    setWandStates(prev => ({ ...prev, [key]: 'overcharged' }));
  };

  const handleReset = (key) => {
    setWandStates(prev => ({ ...prev, [key]: 'available' }));
  };

  const filtered = filterSpellsByDefense(spells, defenseFilter);
  const spellsByRank = organizeSpellsByRank(filtered);
  const ranksToShow = getSortedRankList(
    Object.keys(spellsByRank).filter(r => spellsByRank[r].length > 0)
  ).slice(1).filter(r => activeSpellRank === 'all' || r === activeSpellRank);

  const hasActiveFilter = activeSpellRank !== 'all' || defenseFilter !== 'all';

  return (
    <div className="spells-container">
      <WandInfoBox themeColor={themeColor} />

      {ranksToShow.map(rank => (
        <div className="repertoire-rank-section" key={rank}>
          <div className="rank-section-header">
            <span className="rank-label" style={{ color: themeColor }}>
              {rank === 'cantrips' ? 'Cantrips' : `Rank ${rank}`}
            </span>
          </div>
          {spellsByRank[rank].map(spell => {
            const key = wandKey(spell);
            const state = wandStates[key] ?? 'available';
            return (
              <div className="wand-row" key={key}>
                <SpellNameChip spell={spell} character={character} />
                {state !== 'overcharged' ? (
                  <button
                    className={`slot-bubble ${state === 'available' ? 'slot-filled' : 'slot-empty'}`}
                    style={state === 'available'
                      ? { backgroundColor: themeColor, borderColor: themeColor }
                      : { borderColor: themeColor }}
                    onClick={() => handleSlotClick(key)}
                    aria-label={state === 'available' ? 'Available slot' : 'Spent slot'}
                  />
                ) : (
                  <button
                    className="slot-bubble wand-overcharged-slot"
                    onClick={() => handleReset(key)}
                    aria-label="Reset wand"
                  />
                )}
                {state === 'used' && (
                  <button
                    className="wand-overcharge-btn"
                    style={{ color: themeColor, borderColor: themeColor }}
                    onClick={() => handleOvercharge(key)}
                  >
                    Overcharge
                  </button>
                )}
                {state === 'overcharged' && (
                  <span
                    className="wand-overcharged-label"
                    role="button"
                    tabIndex={0}
                    onClick={() => handleReset(key)}
                    onKeyDown={e => e.key === 'Enter' && handleReset(key)}
                  >
                    Overcharged — click to reset
                  </span>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {ranksToShow.length === 0 && (
        <div className="empty-state">
          <p>
            {hasActiveFilter
              ? 'No wands matching your current filters.'
              : 'No wands in inventory.'}
          </p>
        </div>
      )}
    </div>
  );
};

export default WandSpells;
