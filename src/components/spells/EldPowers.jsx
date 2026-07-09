// src/components/spells/EldPowers.jsx
import React, { useState } from 'react';
import CollapsibleCard from '../shared/CollapsibleCard';
import TraitTag from '../shared/TraitTag';
import ActionSymbol from '../shared/ActionSymbol';
import UseAbilityModal from '../encounter/UseAbilityModal';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useFrequency } from '../../hooks/useFrequency';
import { useEncounter } from '../../hooks/useEncounter';
import { useGameDate } from '../../contexts/GameDateContext';
import { toGameSeconds, formatAvailableAt } from '../../utils/gameTime';
import { scaleEldPower, ELD_FREQUENCY_RULE } from '../../utils/eldScaling';
import { DEGREE_LABELS } from '../../utils/degreeDisplay';
import './EldPowers.css';
import { APP, syncKey } from '../../sync/keys';

// Degree label → shared degree-of-success palette class. The authored degree
// keys are display strings ("Critical Success"), not the engine's camelCase —
// keyed off the shared label vocabulary; the d-* classes are EldPowers.css-local.
const DEGREE_CLASS = {
  [DEGREE_LABELS.criticalSuccess]: 'd-crit',
  [DEGREE_LABELS.success]:         'd-succ',
  [DEGREE_LABELS.failure]:         'd-fail',
  [DEGREE_LABELS.criticalFailure]: 'd-cf',
};

/**
 * Component to display Eld Powers
 * @param {Object} props
 * @param {Array} props.eldPowers - Array of Eld Power sources
 * @param {string} props.themeColor - Theme color from character
 * @param {number} props.characterLevel - Character's level
 * @param {Object} [props.character] - The acting character; enables Use buttons
 */
const EldPowers = ({ eldPowers, themeColor, characterLevel, character }) => {
  // Attunement is the daily-prep choice — synced, GM-visible, and written by
  // DailyPrepModal / PartyDailyPrepButton / the GM override. Never from here:
  // the dropdown below only browses.
  const [attunedSource] = useSyncedState(
    syncKey(APP.ELDATTUNE, character?.id || 'unknown'),
    '',
  );

  // Local browse filter. Until the player touches the dropdown, the view
  // follows the attunement (which may hydrate after mount).
  const [browsed, setBrowsed] = useState(null);

  // Power pending confirmation in the use modal (frequency-gated).
  const [pendingPower, setPendingPower] = useState(null);

  // Per-power availability, derived the same way UseAbilityModal gates it —
  // the modal stays the enforcement point; the cards just surface it.
  const { gateFor } = useFrequency(character?.id || 'unknown');
  const { encounter } = useEncounter();
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const casterEntry = (encounter?.order || []).find(
    (e) => e.kind === 'pc' && e.charId === character?.id,
  );
  const freqCtx = { nowSecs, encounter, casterEntryId: casterEntry?.entryId || null };

  const viewSource = browsed ?? (attunedSource || eldPowers[0]?.source || '');
  const currentSourceData = eldPowers.find(ep => ep.source === viewSource) || eldPowers[0];
  const isAttunedView = !!attunedSource && currentSourceData?.source === attunedSource;

  if (!currentSourceData) {
    return (
      <div className="eld-powers-container">
        <h3>Eld Powers</h3>
        <div className="empty-state">
          <p>No Eld Powers available.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="eld-powers-container">
      <div className="eld-powers-header">
        <h3>Eld Powers</h3>
        <p className="eld-powers-description">
          The Ostilli bound to you has learned from absorbing the primal magic you naturally exude.
          When you make your daily preparations, you can attune your Ostilli to a single source of
          potent magic to which you have been exposed for at least half of the past 24 hours.
        </p>
      </div>

      {/* Source browser + attunement state */}
      <div className="eld-source-selector">
        <label htmlFor="eld-source">
          Source:
        </label>
        <select
          id="eld-source"
          value={viewSource}
          onChange={(e) => setBrowsed(e.target.value)}
        >
          {eldPowers.map(source => (
            <option key={source.source} value={source.source}>
              {source.source}{source.source === attunedSource ? ' (attuned)' : ''}
            </option>
          ))}
        </select>
        {isAttunedView ? (
          <span className="eld-attuned-chip">Attuned</span>
        ) : (
          <span className="eld-attuned-chip eld-attuned-chip--off">
            {attunedSource ? `Attuned: ${attunedSource}` : 'Not attuned'}
          </span>
        )}
      </div>

      {character && !isAttunedView && (
        <p className="eld-attune-hint">
          {attunedSource
            ? `Browsing — only ${attunedSource} powers can be used today.`
            : 'No source attuned. Choose one at daily preparations.'}
        </p>
      )}

      {/* Display special property if it exists */}
      {currentSourceData.special && (
        <div className="eld-special-info">
          <h4>{currentSourceData.special.name}</h4>
          <p>{currentSourceData.special.description}</p>
        </div>
      )}

      {/* Display the powers for the selected source */}
      <div className="eld-powers-list">
        <h4>Available Powers (Once per Hour)</h4>
        <div className="eld-powers-grid">
          {currentSourceData.powers.map((rawPower, index) => {
            // Level-scaled dice rendered concretely ("2d10 (+1d10 per level)"
            // → "6d10" at level 4) on the card and in the use modal.
            const power = scaleEldPower(rawPower, characterLevel);
            const gate = character
              ? gateFor({ ...power, frequencyRule: ELD_FREQUENCY_RULE }, freqCtx)
              : null;
            const locked = !!gate && !gate.available;

            // Create header content
            const header = (
              <>
                <h3>{power.name}</h3>
                {power.actions && (
                  <div className="power-actions-indicator">
                    <ActionSymbol actionText={power.actions} />
                  </div>
                )}
              </>
            );

            // Create content
            const content = (
              <>
                {/* Power Traits */}
                {power.traits && power.traits.length > 0 && (
                  <div className="power-traits">
                    {power.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}

                {/* Power Details */}
                <div className="power-details">
                  {power.actions && (
                    <div className="power-actions">
                      <span className="detail-label">Actions:</span>
                      <span className="detail-value">{power.actions}</span>
                    </div>
                  )}

                  {power.range && (
                    <div className="power-range">
                      <span className="detail-label">Range:</span>
                      <span className="detail-value">{power.range}</span>
                    </div>
                  )}

                  {power.area && (
                    <div className="power-area">
                      <span className="detail-label">Area:</span>
                      <span className="detail-value">{power.area}</span>
                    </div>
                  )}
                </div>

                {/* Power Description */}
                <div className="power-description">
                  {power.description}
                </div>

                {/* Degrees of Success if present */}
                {power.degrees && (
                  <div className="power-degrees">
                    <span className="degrees-label">
                      Degrees of Success:
                    </span>
                    {Object.entries(power.degrees).map(([degree, effect], i) => (
                      <div key={i} className={`degree-entry ${DEGREE_CLASS[degree] || ''}`}>
                        <span className="degree-level">{degree}:</span>
                        <span className="degree-effect">{effect}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Cooldown state (display only — the modal enforces) */}
                {locked && (
                  <p className="eld-power-cooldown">
                    On cooldown
                    {gate.availableAtSecs != null
                      ? ` — ready at ${formatAvailableAt(gate.availableAtSecs, nowSecs)}`
                      : ''}
                  </p>
                )}

                {/* Use button — opens the frequency-gated use modal */}
                {character && (
                  <button
                    type="button"
                    className={`eld-power-use-btn${locked ? ' is-locked' : ''}`}
                    disabled={!isAttunedView}
                    title={!isAttunedView ? 'Attune at daily preparations to use' : undefined}
                    onClick={() => setPendingPower(power)}
                  >
                    Use
                  </button>
                )}
              </>
            );

            return (
              <CollapsibleCard
                key={`eld-power-${index}`}
                className={`eld-power-card${locked ? ' is-locked' : ''}`}
                header={header}
                themeColor={themeColor}
                initialExpanded={false}
              >
                {content}
              </CollapsibleCard>
            );
          })}
        </div>
      </div>

      {character && pendingPower && (
        <UseAbilityModal
          isOpen={!!pendingPower}
          onClose={() => setPendingPower(null)}
          ability={{ ...pendingPower, frequencyRule: ELD_FREQUENCY_RULE }}
          verb="Use"
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default EldPowers;
