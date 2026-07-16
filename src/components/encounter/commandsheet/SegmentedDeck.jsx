// src/components/encounter/commandsheet/SegmentedDeck.jsx
// The Segmented Deck — the encounter action UI redesign that replaces the one
// long cost-grouped ActionGrid scroll. Actions live in five short, self-
// contained segments (Strikes · Spells · Actions · React · Items) under the
// pinned "Right Now" shortlist; each segment groups class/signature material on
// top and basic actions at the bottom. Off-turn the deck auto-selects React.
//
// Tapping a tile opens the ConfirmSheet preview; confirming resolves through
// the existing path (onUse → ActionsList.handleUse → the right slide-up
// resolver) — this component only re-groups and re-presents the
// buildActionCatalog data. The fused sticky header (DeckHeader: turn budget +
// focus banner) pins above Right Now and the segmented control. The Spells
// segment hosts the spellbook launcher (MagicModal) — the first-class in-tab
// spell list is a follow-up slice, as is the capacity-weapon chamber track.
import React, { useEffect, useMemo, useState } from 'react';
import ActionTile from './ActionTile';
import ActionSymbol from '../../shared/ActionSymbol';
import ConfirmSheet from './ConfirmSheet';
import DeckHeader from './DeckHeader';
import SpellsSegment from './SpellsSegment';
import { useCharacter } from '../../../hooks/useCharacter';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useTurnState } from '../../../hooks/useTurnState';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useAdjacency } from '../../../hooks/useAdjacency';
import { useChambers } from '../../../hooks/useChambers';
import { useEncounter } from '../../../hooks/useEncounter';
import { isCharTurn } from '../../../utils/encounterUtils';
import { buildActionCatalog, segmentTiles, capacityWeaponCards } from './buildActionCatalog';
import { suggestNow } from './suggestNow';
import './SegmentedDeck.css';
import { RELAY, syncKey } from '../../../sync/keys';

const SEGMENTS = [
  { key: 'strikes', label: 'Strikes', accent: 'ember' },
  { key: 'spells', label: 'Spells', accent: 'arcane' },
  { key: 'actions', label: 'Actions', accent: 'ember' },
  { key: 'react', label: 'React', accent: 'gold' },
  { key: 'items', label: 'Items', accent: 'ember' },
];

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// Group divider: small uppercase label + hairline rule (+ optional right cue).
const SecHead = ({ tone = 'muted', label, right }) => (
  <div className={`deck-sec deck-sec--${tone}`}>
    <span className="deck-sec-label">{label}</span>
    <span className="deck-sec-rule" aria-hidden="true" />
    {right && <span className="deck-sec-right">{right}</span>}
  </div>
);

const SegmentedDeck = ({ character, themeColor, encounterMode, onUse, onMagicOpen, skillActions = [], onSkillAction, extraActions = [] }) => {
  const { actions, strikes, reactions, freeActions, inventory, maxHp } = useCharacter(character);
  const { focusEnemy, focusAlly } = useFocusTarget(character.id);
  const { inReach } = useAdjacency(character.id);
  const { turnState } = useTurnState(character.id);
  const { encounter } = useEncounter();
  // Chamber overlay drives the Reload tile gating (#675) — read-only here, the
  // ReloadSheet (via useChambers) is the writer.
  const { chambers } = useChambers(character.id);
  const [hp] = useSyncedState(syncKey(RELAY.HP, character.id), null);
  const hasFocus = !!focusEnemy;
  const allyFocused = !!focusAlly;
  // A focused ally out of reach hard-disables ally-support tiles (#430). No relay
  // data ⇒ inReach is true, so the gate is dormant without a connected bridge.
  const allyInReach = !focusAlly || inReach(focusAlly.entryId);
  const allyOutOfReach = allyFocused && !allyInReach;
  // HP fraction drives the low-HP healing boost in suggestNow (#428); 1 (full) if unknown.
  const hpRatio = (typeof hp === 'number' && maxHp > 0) ? hp / maxHp : 1;

  // Off-turn the deck auto-selects React (reactions are all you can use); your
  // turn starting snaps it back to Strikes. Manual taps still switch freely.
  const myTurn = encounterMode && isCharTurn(encounter, character.id);
  const [seg, setSeg] = useState(encounterMode && !myTurn ? 'react' : 'strikes');
  useEffect(() => {
    if (encounterMode) setSeg(myTurn ? 'strikes' : 'react');
  }, [encounterMode, myTurn]);

  // Tap → confirm sheet → existing resolver. The sheet is a preview/intent
  // step: confirming routes through the exact call a direct tap used to make
  // (onUse → ActionsList.handleUse / onSkillAction / an extra action's own
  // handler), so the resolvers keep sole ownership of action spends, MAP
  // recording, and chamber writes.
  const [sheet, setSheet] = useState(null); // { tile, run } | null
  const handleTileSelect = (tile) =>
    setSheet({
      tile,
      run: tile.run || (() => onUse?.(tile.raw, tile.variableActionCount ? tile.variableActionCount.min : tile.cost)),
    });

  // Special actions with their own launch surfaces (Exploit Vulnerability,
  // Command an Animal, Command <familiar> — the pre-deck sections above the
  // grid) fold in as Class & Signature pseudo-tiles; confirming runs their
  // handler instead of onUse.
  const extraTiles = useMemo(
    () => extraActions.map((x) => ({
      id: `extra-${x.id}`,
      name: x.name,
      cost: x.cost ?? 1,
      costGroup: String(x.cost ?? 1),
      cat: 'other',
      origin: 'extra',
      traits: x.traits || [],
      needsTarget: !!x.needsTarget,
      supports: false,
      inactive: false,
      statLine: x.statLine || null,
      verb: x.verb,
      raw: { description: x.description, requiresTarget: x.needsTarget !== false },
      run: x.run,
    })),
    [extraActions]
  );

  // Player skill actions (#260) preview through the same sheet via a pseudo-
  // tile; confirming opens their own resolver (SkillActionModal).
  const openSkillAction = (sa) =>
    setSheet({
      tile: {
        name: sa.name,
        cost: sa.actionCost,
        traits: sa.traits || [],
        origin: 'skill-action',
        cat: 'skill',
        needsTarget: !!sa.defense && !sa.selfTarget,
        raw: { description: sa.description, highlightSkill: sa.skill, targetDefense: sa.defense },
      },
      run: () => onSkillAction?.(sa),
    });

  const confirmSheet = () => {
    const s = sheet;
    setSheet(null);
    s?.run();
  };

  const tiles = useMemo(
    () => buildActionCatalog({ actions, strikes, reactions, freeActions, inventory, chambers }),
    [actions, strikes, reactions, freeActions, inventory, chambers]
  );
  const groups = useMemo(() => segmentTiles(tiles), [tiles]);

  // Capacity-weapon cards (Crescent Cross, …): chamber track + the weapon's
  // strikes grouped as one full-width card; those tiles leave the plain
  // held/stowed groups so they don't render twice.
  const capCards = useMemo(
    () => capacityWeaponCards({ tiles, inventory, chambers }),
    [tiles, inventory, chambers]
  );
  const cardTileIds = useMemo(
    () => new Set(capCards.flatMap((c) => c.strikes.map((t) => t.id))),
    [capCards]
  );

  // "Right Now" shortlist (#413) — the most likely next actions, one tap away.
  // Ranked over the full catalog (not the active segment) against the live
  // budget + focus, so it stays useful no matter which segment is selected.
  // Only on your own turn — off-turn there is no action budget to spend, the
  // deck is showing React instead.
  const actionsLeft = Math.max(0, 3 - (turnState?.actionsSpent ?? 0));
  const suggestions = useMemo(
    () => (encounterMode && myTurn ? suggestNow(tiles, { actionsLeft, hasFocus, hpRatio, allyFocused, allyInReach }) : []),
    [encounterMode, myTurn, tiles, actionsLeft, hasFocus, hpRatio, allyFocused, allyInReach]
  );

  const segments = onMagicOpen ? SEGMENTS : SEGMENTS.filter((s) => s.key !== 'spells');
  const activeSeg = segments.some((s) => s.key === seg) ? seg : 'strikes';

  // Reaction availability for the React banner — mirrors the fused header's states.
  const { reactionAvailable, reactionSpent, hasStartedFirstTurn } = turnState || {};
  const reactionState = !hasStartedFirstTurn
    ? 'unavailable'
    : reactionSpent ? 'spent'
    : reactionAvailable ? 'available'
    : 'unavailable';
  const reactionBanner = {
    available: <>Reaction <b>available</b> — this tab opens automatically on others&rsquo; turns</>,
    spent: <>Reaction <b>spent</b> — it returns at the start of your next turn</>,
    unavailable: <>Reaction readies after your first turn</>,
  }[reactionState];

  const tileProps = { onSelect: handleTileSelect, encounterMode, hasFocus, allyOutOfReach };

  const renderTiles = (list, layout) =>
    list.map((tile) => <ActionTile key={tile.id} tile={tile} layout={layout} {...tileProps} />);

  // A carded strike renders as a row with its chamber-use note in place of
  // the plain stat line ("spends 1 chamber" / "melee · no chamber").
  const chamberNoted = (tile) => {
    const usesChamber = tile.raw.capacity != null;
    const note = usesChamber
      ? (tile.raw.chambersLoaded > 0 ? 'spends 1 chamber' : 'empty — reload to fire')
      : `${tile.raw.type === 'melee' ? 'melee · ' : ''}no chamber`;
    return { ...tile, statLine: [tile.statLine, note].filter(Boolean).join(' · ') };
  };

  const renderStrikes = () => {
    const held = groups.strikesHeld.filter((t) => !cardTileIds.has(t.id));
    const stowed = groups.strikesStowed.filter((t) => !cardTileIds.has(t.id));
    return (
    <>
      {held.length > 0 && (
        <section aria-label="In hand">
          <SecHead label="In hand" />
          <div className="deck-grid-2">{renderTiles(held, 'card')}</div>
        </section>
      )}
      {capCards.map((card) => (
        <section key={card.uid} className="deck-cap-card" aria-label={card.name}>
          <div className="deck-cap-head">
            <span className="deck-cap-name">{card.name}</span>
            <span className="deck-cap-pill">Capacity {card.capacity}</span>
          </div>
          <div className="deck-cap-track">
            <span className="deck-cap-label">Chambers</span>
            <span
              className="deck-cap-dots"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={card.capacity}
              aria-valuenow={card.loaded}
              aria-label={`${card.loaded} of ${card.capacity} chambers loaded`}
            >
              {Array.from({ length: card.capacity }, (_, i) => (
                <span
                  key={i}
                  className={`deck-cap-dot${i < card.loaded ? ' deck-cap-dot--loaded' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </span>
            <span className="deck-cap-count" aria-hidden="true">{card.loaded}/{card.capacity}</span>
            {card.reloadTile ? (
              <button
                type="button"
                className="deck-cap-reload"
                onClick={() => handleTileSelect(card.reloadTile)}
                aria-label={card.reloadTile.name}
              >
                Reload <ActionSymbol cost={card.reloadTile.cost} />
              </button>
            ) : (
              <span className="deck-cap-full">Loaded</span>
            )}
          </div>
          <div className="deck-cap-strikes">
            {card.strikes.map((tile) => (
              <ActionTile key={tile.id} tile={chamberNoted(tile)} layout="row" {...tileProps} />
            ))}
          </div>
        </section>
      ))}
      {stowed.length > 0 && (
        <section aria-label="Not in hand">
          <SecHead tone="dim" label="Not in hand" />
          {stowed.map((tile) => (
            <button
              key={tile.id}
              type="button"
              className="deck-stowed"
              onClick={() => handleTileSelect(tile)}
              aria-label={tile.name}
            >
              <span className="deck-stowed-lock" aria-hidden="true">🔒</span>
              <span className="deck-stowed-main">
                <span className="deck-stowed-name">{tile.name}</span>
                {tile.statLine && <span className="deck-stowed-sub">{tile.statLine}</span>}
              </span>
              <span className="deck-stowed-draw">Draw <ActionSymbol cost={1} /></span>
            </button>
          ))}
        </section>
      )}
      {held.length + stowed.length + capCards.length === 0 && (
        <p className="deck-empty">No strikes — equip a weapon.</p>
      )}
    </>
    );
  };

  const renderSpells = () => (
    <SpellsSegment character={character} themeColor={themeColor} onMagicOpen={onMagicOpen} />
  );

  // A player skill action (#260) and a catalog basic can carry the same name
  // (Trip, Feint, Seek, …). The skill-action path is the richer resolver
  // (degrees, conditions, immunity), so it wins and the catalog twin is hidden.
  const saNames = new Set(skillActions.map((sa) => sa.name.toLowerCase()));
  const skillTiles = groups.skill.filter((t) => !saNames.has(t.name.toLowerCase()));
  const basicTiles = groups.basics.filter((t) => !saNames.has(t.name.toLowerCase()));
  // Same for the extras: a character sheet often carries its own "Exploit
  // Vulnerability" action entry — the extra's dedicated resolver wins.
  const extraNames = new Set(extraTiles.map((t) => t.name.toLowerCase()));
  const signatureTiles = groups.signature.filter((t) => !extraNames.has(t.name.toLowerCase()));

  const renderActions = () => (
    <>
      {(extraTiles.length > 0 || signatureTiles.length > 0) && (
        <section aria-label="Class & Signature">
          <SecHead tone="ember" label="Class & Signature" />
          <div className="deck-grid-2">
            {renderTiles(extraTiles, 'card')}
            {renderTiles(signatureTiles, 'card')}
          </div>
        </section>
      )}
      {(skillTiles.length > 0 || skillActions.length > 0) && (
        <section aria-label="Skill">
          <SecHead tone="gold" label="Skill" />
          <div className="deck-grid-2">
            {skillActions.map((sa) => (
              <button
                key={`sa-${sa.id}`}
                type="button"
                className="cmd-tile"
                onClick={() => openSkillAction(sa)}
                aria-label={sa.name}
              >
                <span className="cmd-tile-top">
                  <span className="cmd-tile-cost"><ActionSymbol cost={sa.actionCost} /></span>
                </span>
                <span className="cmd-tile-name">{sa.name}</span>
                {sa.skill && <span className="cmd-tile-stat">{capitalize(sa.skill)}</span>}
              </button>
            ))}
            {renderTiles(skillTiles, 'card')}
          </div>
        </section>
      )}
      {basicTiles.length > 0 && (
        <section aria-label="Basic Actions">
          <SecHead tone="dim" label="Basic Actions" />
          <div className="deck-grid-3">{renderTiles(basicTiles, 'compact')}</div>
        </section>
      )}
    </>
  );

  const renderReact = () => (
    <>
      {encounterMode && (
        <div className={`deck-react-banner deck-react-banner--${reactionState}`}>
          <span className="deck-react-glyph" aria-hidden="true"><ActionSymbol cost="reaction" /></span>
          <span>{reactionBanner}</span>
        </div>
      )}
      {groups.reactions.length > 0 && (
        <section aria-label="Reactions">
          <SecHead tone="gold" label="Reactions" />
          <div className="deck-rows">{renderTiles(groups.reactions, 'row')}</div>
        </section>
      )}
      {groups.free.length > 0 && (
        <section aria-label="Free Actions">
          <SecHead tone="dim" label="Free Actions" />
          <div className="deck-grid-3">{renderTiles(groups.free, 'compact')}</div>
        </section>
      )}
    </>
  );

  const renderItems = () => (
    <>
      {groups.consumables.length > 0 && (
        <section aria-label="Consumables">
          <SecHead tone="verdant" label="Consumables" />
          <div className="deck-rows">{renderTiles(groups.consumables, 'row')}</div>
        </section>
      )}
      {groups.gear.length > 0 && (
        <section aria-label="Reload & Gear">
          <SecHead tone="dim" label="Reload & Gear" />
          <div className="deck-rows">{renderTiles(groups.gear, 'row')}</div>
        </section>
      )}
      {groups.consumables.length + groups.gear.length === 0 && (
        <p className="deck-empty">No usable items carried.</p>
      )}
    </>
  );

  const BODY = {
    strikes: renderStrikes,
    spells: renderSpells,
    actions: renderActions,
    react: renderReact,
    items: renderItems,
  };

  return (
    <div className="deck-root">
      {/* The fused header, Right Now, and the segmented control pin as one
          sticky block; the segment body scrolls under it. The header renders
          for any active encounter — in setup it shows the waiting line. */}
      <div className="deck-sticky">
        {!!encounter?.active && <DeckHeader charId={character.id} characterName={character.name} />}

        {suggestions.length > 0 && (
          <section className="deck-now" aria-label="Right now">
            <h3 className="deck-now-head">
              <span className="deck-now-dot" aria-hidden="true" />
              Right Now
            </h3>
            <div className="deck-now-grid">
              {suggestions.map((tile) => (
                <ActionTile key={`now-${tile.id}`} tile={tile} {...tileProps} />
              ))}
            </div>
          </section>
        )}

        <div className="deck-tabs" role="tablist" aria-label="Action segments">
          {segments.map((s) => (
            <button
              key={s.key}
              type="button"
              role="tab"
              aria-selected={activeSeg === s.key}
              className={`deck-tab deck-tab--${s.accent}${activeSeg === s.key ? ' deck-tab--active' : ''}`}
              onClick={() => setSeg(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="deck-body">{BODY[activeSeg]()}</div>

      {sheet && (
        <ConfirmSheet
          tile={sheet.tile}
          focusEnemy={focusEnemy}
          focusAlly={focusAlly}
          attacksMade={turnState?.attacksMade ?? 0}
          onConfirm={confirmSheet}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
};

export default SegmentedDeck;
