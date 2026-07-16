// src/components/encounter/commandsheet/SegmentedDeck.jsx
// The Segmented Deck — the encounter action UI redesign that replaces the one
// long cost-grouped ActionGrid scroll. Actions live in five short, self-
// contained segments (Strikes · Spells · Actions · React · Items) under the
// pinned "Right Now" shortlist; each segment groups class/signature material on
// top and basic actions at the bottom. Off-turn the deck auto-selects React.
//
// Tapping a tile still resolves through the existing path (onUse →
// ActionsList.handleUse → the right slide-up resolver); this component only
// re-groups and re-presents the buildActionCatalog data. The fused sticky
// header (DeckHeader: turn budget + focus banner) pins above Right Now and the
// segmented control. The Spells segment hosts the spellbook launcher
// (MagicModal) — the first-class in-tab spell list is a follow-up slice, as
// are the confirm sheet and the capacity-weapon chamber track.
import React, { useEffect, useMemo, useState } from 'react';
import ActionTile from './ActionTile';
import ActionSymbol from '../../shared/ActionSymbol';
import DeckHeader from './DeckHeader';
import ThaumaturgeExploitsDisplay from '../../actions/ThaumaturgeExploitsDisplay';
import { useCharacter } from '../../../hooks/useCharacter';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useTurnState } from '../../../hooks/useTurnState';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useAdjacency } from '../../../hooks/useAdjacency';
import { useChambers } from '../../../hooks/useChambers';
import { useEncounter } from '../../../hooks/useEncounter';
import { isCharTurn } from '../../../utils/encounterUtils';
import { buildActionCatalog, segmentTiles } from './buildActionCatalog';
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

const SegmentedDeck = ({ character, themeColor, encounterMode, onUse, onMagicOpen, skillActions = [], onSkillAction }) => {
  const { actions, strikes, reactions, freeActions, inventory, maxHp, flags, thaumaturge } = useCharacter(character);
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

  const handleTileSelect = (tile) =>
    onUse?.(tile.raw, tile.variableActionCount ? tile.variableActionCount.min : tile.cost);

  const tiles = useMemo(
    () => buildActionCatalog({ actions, strikes, reactions, freeActions, inventory, chambers }),
    [actions, strikes, reactions, freeActions, inventory, chambers]
  );
  const groups = useMemo(() => segmentTiles(tiles), [tiles]);

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

  const renderStrikes = () => (
    <>
      {groups.strikesHeld.length > 0 && (
        <section aria-label="In hand">
          <SecHead label="In hand" />
          <div className="deck-grid-2">{renderTiles(groups.strikesHeld, 'card')}</div>
        </section>
      )}
      {groups.strikesStowed.length > 0 && (
        <section aria-label="Not in hand">
          <SecHead tone="dim" label="Not in hand" />
          {groups.strikesStowed.map((tile) => (
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
      {groups.strikesHeld.length + groups.strikesStowed.length === 0 && (
        <p className="deck-empty">No strikes — equip a weapon.</p>
      )}
    </>
  );

  const renderSpells = () => (
    <button type="button" className="deck-magic-launcher" aria-label="Cast a Spell" onClick={onMagicOpen}>
      <span className="deck-magic-glyph" aria-hidden="true">✦</span>
      <span className="deck-magic-label">Cast a Spell</span>
      <span className="deck-magic-sub">Open spellbook</span>
    </button>
  );

  // A player skill action (#260) and a catalog basic can carry the same name
  // (Trip, Feint, Seek, …). The skill-action path is the richer resolver
  // (degrees, conditions, immunity), so it wins and the catalog twin is hidden.
  const saNames = new Set(skillActions.map((sa) => sa.name.toLowerCase()));
  const skillTiles = groups.skill.filter((t) => !saNames.has(t.name.toLowerCase()));
  const basicTiles = groups.basics.filter((t) => !saNames.has(t.name.toLowerCase()));

  const renderActions = () => (
    <>
      {groups.signature.length > 0 && (
        <section aria-label="Class & Signature">
          <SecHead tone="ember" label="Class & Signature" />
          <div className="deck-grid-2">{renderTiles(groups.signature, 'card')}</div>
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
                onClick={() => onSkillAction?.(sa)}
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
      {flags?.isThaumaturge && (
        <ThaumaturgeExploitsDisplay thaumaturge={thaumaturge} themeColor={themeColor} />
      )}

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
    </div>
  );
};

export default SegmentedDeck;
