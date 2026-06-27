import React, { useMemo, useState } from 'react';
import { useGameDate } from '../../contexts/GameDateContext';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useShops } from '../../hooks/useShops';
import { DOWNTIME_ACTIVITIES } from '../../data/downtimeActivities';
import { getHoursForActivity, getRollsForActivity, periodState } from '../../utils/downtimeUtils';
import { getShopsForLocation } from '../../utils/shopUtils';
import CraftingModal from '../inventory/CraftingModal';
import ShopModal from '../shop/ShopModal';
import CraftingProjects from './CraftingProjects';
import RuneWorkPanel from './RuneWorkPanel';
import MoveRunePanel from './MoveRunePanel';
import DowntimePartyLedger from './DowntimePartyLedger';
import DowntimeAllocator from './DowntimeAllocator';
import EarnIncomeResolver from './EarnIncomeResolver';
import TellFortunePanel from './TellFortunePanel';
import RepairShieldPanel from './RepairShieldPanel';
import DowntimeCompletion from './DowntimeCompletion';
import './DowntimeTab.css';

// Player-facing Downtime view, shown in the mode-aware "play" slot when the GM
// has set the play mode to Downtime. Shows the GM-granted day budget, the
// activity picker, per-activity progress, the commit bar, and the Crafting
// recipe browser (moved here from Inventory).
const DowntimeTab = ({ character, characterColor }) => {
  const { formatGameDate, formatClockTime, getCurrentWeekday } = useGameDate();
  const { loreEntries, items, runes, spells } = useContent();
  const [block] = useSyncedState('cnmh_downtimeblock_global', null);
  const [downtime] = useSyncedState(`cnmh_downtime_${character?.id || 'unknown'}`, null);
  const [campaign] = useSyncedState('cnmh_campaign_global', { location: '', locationLoreId: '' });
  const { shops } = useShops();
  const charData = useCharacter(character);
  const [isCraftingOpen, setIsCraftingOpen] = useState(false);
  const [isShopOpen, setIsShopOpen] = useState(false);

  // Shops the party can visit right now: the shop-flagged (revealed) children of
  // the current location. Empty ⇒ no Shop button.
  const locationShops = useMemo(
    () => getShopsForLocation(campaign?.locationLoreId, loreEntries, shops),
    [campaign?.locationLoreId, loreEntries, shops]
  );

  const hasCrafting = (charData?.skillProficiencies?.crafting || 0) > 0;
  const hasTellFortune = (charData?.feats || []).some((f) => f.name === 'Tell Fortune');
  const hasShield = (charData?.inventory || []).some((e) => e?.shield);
  const days = block?.active ? block?.days : null;
  const { selected, ledger, status } = periodState(downtime, block?.startedAt);
  const planLocked = status === 'ready';

  // Per-activity progress derived from the committed ledger.
  const activityProgress = selected.map((name) => {
    const def = DOWNTIME_ACTIVITIES.find((a) => a.name === name);
    if (!def) return null;
    if (def.type === 'instant') {
      return { name, type: 'instant', rolls: getRollsForActivity(ledger, name) };
    }
    return {
      name,
      type: 'accumulate',
      hours: getHoursForActivity(ledger, name),
      benchmarkHours: def.benchmarkHours,
    };
  }).filter(Boolean);

  return (
    <div className="dt-wrap">
      <div className="dt-header">
        <div className="dt-header-top">
          <span className="dt-label">Downtime</span>
          {days != null ? (
            <span className="dt-budget">{days} day{days === 1 ? '' : 's'} available</span>
          ) : (
            <span className="dt-budget dt-budget--unset">Not started</span>
          )}
        </div>
        <p className="dt-date">{getCurrentWeekday()}, {formatGameDate()}</p>
        <p className="dt-time">{formatClockTime()}</p>
        {days == null && (
          <p className="dt-hint">The GM hasn&rsquo;t started a downtime period yet.</p>
        )}
      </div>

      {block?.active && (
        <DowntimePartyLedger character={character} block={block} />
      )}

      {block?.active && (
        <DowntimeAllocator character={character} block={block} characterColor={characterColor} />
      )}

      {block?.active && planLocked && (
        <EarnIncomeResolver character={character} />
      )}

      {block?.active && planLocked && activityProgress
        .filter((p) => p.type === 'accumulate' && (p.name === 'Retrain' || p.name === 'Research'))
        .map((p) => (
          <DowntimeCompletion
            key={p.name}
            character={character}
            activity={p.name}
            startedAt={block?.startedAt}
            hoursBanked={p.hours}
          />
        ))}

      {hasTellFortune && (
        <TellFortunePanel character={character} />
      )}

      {hasShield && hasCrafting && (
        <RepairShieldPanel character={character} />
      )}

      {locationShops.length > 0 && (
        <div className="dt-shop-row">
          <button
            className="dt-crafting-btn"
            onClick={() => setIsShopOpen(true)}
          >
            <span role="img" aria-label="Shop">🛒</span>
            Shop
            <span className="dt-shop-count">{locationShops.length}</span>
          </button>
        </div>
      )}

      <RuneWorkPanel character={character} />

      {hasCrafting && (
        <MoveRunePanel character={character} />
      )}

      {hasCrafting && (
        <CraftingProjects character={character} />
      )}

      {hasCrafting && (
        <div className="dt-crafting-row">
          <button
            className="dt-crafting-btn"
            onClick={() => setIsCraftingOpen(true)}
          >
            <span role="img" aria-label="Crafting">🔨</span>
            Crafting Recipes
          </button>
        </div>
      )}

      <CraftingModal
        isOpen={isCraftingOpen}
        onClose={() => setIsCraftingOpen(false)}
        character={character}
        characterColor={characterColor}
      />

      <ShopModal
        isOpen={isShopOpen}
        onClose={() => setIsShopOpen(false)}
        shops={locationShops}
        waresStore={shops}
        items={items}
        runes={runes}
        spells={spells}
        character={character}
        characterColor={characterColor}
      />
    </div>
  );
};

export default DowntimeTab;
