import React from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import './MoonPhase.css';

/**
 * Component to display current moon phase information for Golarion
 * Based on Pathfinder 2E lore and the Blood of the Moon companion
 */
const MoonPhase = ({ date, compact = false, showDetails = true }) => {
  const { getMoonPhaseInfo } = useGameDate();
  
  // Get moon information for the specified date or current date
  const moonInfo = getMoonPhaseInfo(date);
  
  if (compact) {
    return (
      <div className="moon-phase-compact" title={`${moonInfo.name} - ${moonInfo.lunarMonth}`}>
        <span className="moon-symbol">{moonInfo.symbol}</span>
        <span className="moon-name-short">{moonInfo.name}</span>
      </div>
    );
  }

  return (
    <div className="moon-phase-display">
      <div className="moon-header">
        <span className="moon-symbol-large">{moonInfo.symbol}</span>
        <div className="moon-info">
          <h3 className="lunar-month-name">{moonInfo.name}</h3>
          <p className="moon-phase-name">{moonInfo.lunarMonth}</p>
        </div>
      </div>
      
      {showDetails && (
        <div className="moon-details">
          {!moonInfo.isFullMoon && moonInfo.daysUntilFull < moonInfo.daysUntilNew && (
            <div className="moon-countdown full-moon">
              <span className="countdown-label">Next Full Moon:</span>
              <span className="countdown-days">
                {moonInfo.daysUntilFull === 0 ? 'Tonight' : 
                 moonInfo.daysUntilFull === 1 ? 'Tomorrow' : 
                 `${moonInfo.daysUntilFull} days`}
              </span>
            </div>
          )}
          
          {!moonInfo.isNewMoon && moonInfo.daysUntilFull > moonInfo.daysUntilNew && (
            <div className="moon-countdown new-moon">
              <span className="countdown-label">Next New Moon:</span>
              <span className="countdown-days">
                {moonInfo.daysUntilNew === 0 ? 'Tonight' : 
                 moonInfo.daysUntilNew === 1 ? 'Tomorrow' : 
                 `${moonInfo.daysUntilNew} days`}
              </span>
            </div>
          )}
          
          {moonInfo.isFullMoon && (
            <div className="special-moon-notice full">
              🌕 The moon shines at its brightest tonight! Lycanthropes beware.
            </div>
          )}
          
          {moonInfo.isNewMoon && (
            <div className="special-moon-notice new">
              🌑 The moon is dark tonight - perfect for stealth and shadow magic.
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/**
 * Updated Moon Phase Indicator for calendar days
 * Only displays icons for New Moon, Full Moon, and Half Moon days
 */
export const MoonPhaseIndicator = ({ date }) => {
  const { getMoonPhaseInfo, MOON_PHASES } = useGameDate();
  const moonInfo = getMoonPhaseInfo(date);
  
  // Only show moon icons for New Moon, Full Moon, and Half Moons (First/Last Quarter)
  const shouldShowMoonIcon = () => {
    return moonInfo.phase === MOON_PHASES.NEW_MOON ||
           moonInfo.phase === MOON_PHASES.FULL_MOON
          //  moonInfo.phase === MOON_PHASES.FIRST_QUARTER ||
          //  moonInfo.phase === MOON_PHASES.LAST_QUARTER;
  };

  // Don't render anything if it's not one of the key moon phases
  if (!shouldShowMoonIcon()) {
    return null;
  }
  
  return (
    <div 
      className={`moon-indicator ${moonInfo.isFullMoon ? 'full-moon' : ''} ${moonInfo.isNewMoon ? 'new-moon' : ''}`}
      title={`${moonInfo.name} - ${moonInfo.lunarMonth}`}
    >
      {moonInfo.symbol}
    </div>
  );
};

export default MoonPhase;