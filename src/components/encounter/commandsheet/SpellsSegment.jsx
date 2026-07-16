// src/components/encounter/commandsheet/SpellsSegment.jsx
// The Segmented Deck's first-class Spells segment (encounter UI redesign).
// Replaces the bare "Cast a Spell" launcher with the caster's resources in
// view: a pinned arcane resource bar (Focus + remaining slots per rank), then
// the repertoire grouped Cantrips (at will) → Focus → Rank 1 → Rank 2 → …,
// each rank header showing its remaining slots.
//
// Rows are the existing SpellCard → SpellDetailModal → Cast flow, so the
// resolvers (CastSpellModal / UseAbilityModal recipe, slot/focus spends via
// useCastingResources) stay exactly as they were — this segment only replaces
// the launcher as the entry point. Staff / scrolls / wands / innate / eld /
// harrow keep living in the MagicModal, reachable from the Spellbook row at
// the bottom. A character with items-only magic (no repertoire, no focus)
// falls back to the full launcher card.
import React, { useMemo } from 'react';
import SpellCard from '../../spells/SpellCard';
import CastSpellModal from '../CastSpellModal';
import { useCharacter } from '../../../hooks/useCharacter';
import { useContent } from '../../../contexts/ContentContext';
import { useCastingResources } from '../../../hooks/useCastingResources';
import { useSpellCastFlow } from '../../../hooks/useSpellCastFlow';
import {
  organizeSpellsByRank,
  getFocusInfo,
  getFocusSpellEntries,
  getFocusSpellLabel,
} from '../../../utils/SpellUtils';
import { spellCatalogMap, resolveFocusSpells } from '../../../utils/contentUtils';

const ORDINAL = ['0th', '1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th', '9th', '10th'];

// ●●○ pips — filled = remaining.
const ResourcePips = ({ remaining, total, label }) => (
  <span className="deck-spell-pips" role="img" aria-label={`${label}: ${remaining} of ${total} remaining`}>
    {Array.from({ length: total }, (_, i) => (
      <span key={i} className={`deck-spell-pip${i < remaining ? ' deck-spell-pip--full' : ''}`} aria-hidden="true">
        {i < remaining ? '●' : '○'}
      </span>
    ))}
  </span>
);

// Same divider idiom as the deck's SecHead, with the resource on the right.
const GroupHead = ({ tone, label, right }) => (
  <div className={`deck-sec deck-sec--${tone}`}>
    <span className="deck-sec-label">{label}</span>
    <span className="deck-sec-rule" aria-hidden="true" />
    {right && <span className="deck-sec-right">{right}</span>}
  </div>
);

const SpellsSegment = ({ character, themeColor, onMagicOpen }) => {
  const { spellcasting, spellSlotTotals, level, flags } = useCharacter(character);
  const { spells: catalogSpells } = useContent();
  const spellMap = useMemo(() => spellCatalogMap(catalogSpells), [catalogSpells]);

  const castResources = useCastingResources(character);
  const { makeOnCast, castRequest, clearCast } = useSpellCastFlow(character);

  const byRank = useMemo(() => organizeSpellsByRank(spellcasting?.spells || []), [spellcasting?.spells]);
  const cantrips = byRank.cantrips || [];
  const slotRanks = Object.keys(spellSlotTotals || {})
    .map(Number)
    .filter((r) => (spellSlotTotals[r] || 0) > 0)
    .sort((a, b) => a - b);
  const spellRanks = Array.from({ length: 10 }, (_, i) => i + 1)
    .filter((r) => (byRank[r] || []).length > 0);

  const focusSpells = useMemo(
    () => resolveFocusSpells(getFocusSpellEntries(character), spellMap) || [],
    [character, spellMap]
  );
  const focusMax = getFocusInfo(character)?.max ?? 0;
  const focusRemaining = castResources.focus.remaining;
  const focusLabel = getFocusSpellLabel(character);

  // The rest of the magic surfaces stay behind the spellbook (MagicModal).
  const hasMoreMagic = !!(flags.hasStaff || flags.hasScrolls || flags.hasWands
    || flags.hasInnateSpells || flags.hasEldPowers || flags.hasHarrowing);
  const hasInTabSpells = cantrips.length + spellRanks.length + focusSpells.length > 0;

  const cardProps = (source) => ({
    themeColor,
    characterLevel: level,
    character,
    encounterMode: !!makeOnCast(source),
    onCast: makeOnCast(source),
    castResources,
  });

  // Items-only magic (scroll/wand thaumaturge, …) — the launcher card as before.
  if (!hasInTabSpells) {
    return onMagicOpen ? (
      <button type="button" className="deck-magic-launcher" aria-label="Cast a Spell" onClick={onMagicOpen}>
        <span className="deck-magic-glyph" aria-hidden="true">✦</span>
        <span className="deck-magic-label">Cast a Spell</span>
        <span className="deck-magic-sub">Open spellbook</span>
      </button>
    ) : null;
  }

  return (
    <div className="deck-spells">
      {/* Resource bar — Focus + remaining slots per rank, always in view. */}
      {(focusMax > 0 || slotRanks.length > 0) && (
        <div className="deck-spell-bar" role="group" aria-label="Casting resources">
          {focusMax > 0 && (
            <div className="deck-spell-bar-col">
              <span className="deck-spell-bar-label">Focus</span>
              <ResourcePips remaining={focusRemaining} total={focusMax} label="Focus points" />
            </div>
          )}
          {slotRanks.map((r) => (
            <div key={r} className="deck-spell-bar-col">
              <span className="deck-spell-bar-label">{ORDINAL[r] || `${r}th`}</span>
              <ResourcePips
                remaining={castResources.slots.remainingFor(r)}
                total={spellSlotTotals[r] || 0}
                label={`Rank ${r} slots`}
              />
            </div>
          ))}
        </div>
      )}

      {cantrips.length > 0 && (
        <section aria-label="Cantrips">
          <GroupHead tone="arcane" label="Cantrips" right="at will" />
          <div className="deck-spell-rows">
            {cantrips.map((spell) => (
              <SpellCard key={spell.id || spell.name} spell={spell} {...cardProps('slot')} />
            ))}
          </div>
        </section>
      )}

      {focusSpells.length > 0 && (
        <section aria-label={focusLabel}>
          <GroupHead
            tone="gold"
            label={focusLabel}
            right={focusMax > 0 ? <ResourcePips remaining={focusRemaining} total={focusMax} label="Focus points" /> : null}
          />
          <div className="deck-spell-rows">
            {focusSpells.map((spell) => (
              <SpellCard key={spell.id || spell.name} spell={spell} {...cardProps('focus')} />
            ))}
          </div>
        </section>
      )}

      {spellRanks.map((r) => (
        <section key={r} aria-label={`Rank ${r}`}>
          <GroupHead
            tone="arcane"
            label={`Rank ${r}`}
            right={(spellSlotTotals?.[r] || 0) > 0 ? (
              <ResourcePips
                remaining={castResources.slots.remainingFor(r)}
                total={spellSlotTotals[r]}
                label={`Rank ${r} slots`}
              />
            ) : null}
          />
          <div className="deck-spell-rows">
            {(byRank[r] || []).map((spell) => (
              <SpellCard key={spell.id || spell.name} spell={spell} {...cardProps('slot')} />
            ))}
          </div>
        </section>
      ))}

      {/* The full spellbook (MagicModal) stays one tap away — it keeps staff /
          scrolls / wands / innate / eld / harrow, and the classic category
          flow. Accessible name stays "Cast a Spell" (the E2E entry point). */}
      {onMagicOpen && (
        <button type="button" className="deck-magic-launcher deck-magic-launcher--more" aria-label="Cast a Spell" onClick={onMagicOpen}>
          <span className="deck-magic-glyph" aria-hidden="true">✦</span>
          <span className="deck-magic-label">Spellbook</span>
          <span className="deck-magic-sub">{hasMoreMagic ? 'Staff, scrolls, wands & more' : 'The full spellbook'}</span>
        </button>
      )}

      {/* The cast resolver — same modal MagicModal hosts. */}
      {castRequest && (
        <CastSpellModal
          isOpen={!!castRequest}
          onClose={clearCast}
          spell={castRequest.spell}
          cost={castRequest.cost}
          castSource={castRequest.source}
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default SpellsSegment;
