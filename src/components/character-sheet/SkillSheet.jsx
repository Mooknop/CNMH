import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import './SkillSheet.css';
import PenaltyDisplay from '../shared/PenaltyDisplay';
import ActionSymbol from '../shared/ActionSymbol';
import SkillActionModal from '../encounter/SkillActionModal';
import SkillCheckModal from '../actions/SkillCheckModal';
import { useEncounter } from '../../hooks/useEncounter';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { SKILL_ACTIONS, augmentSkillAction } from '../../data/skillActions';
import { ABILITIES } from '../../data/skills';
import { formatModifier } from '../../utils/CharacterUtils';

const RANK_LABELS = ['Untrained', 'Trained', 'Expert', 'Master', 'Legendary'];

/**
 * Skill pull-up sheet (Ability Dial S3) — the single skill-detail surface,
 * raised when a rank-ring snode is pressed. A body-anchored bottom sheet
 * (scrim dims the dial behind), NOT the centered Modal shell.
 *
 * Body: hero modifier + `DEX · Legendary` meta, breakdown chips (the same
 * math PenaltyDisplay tooltips carry), the skill's actions with PF2e cost
 * glyphs, and a primary Roll button. Rolling fans out to the EXISTING
 * resolvers rather than forking the rules: automated skill actions open
 * SkillActionModal in an encounter (action spend + MAP live there) or
 * SkillCheckModal outside one; Roll opens SkillCheckModal with a plain
 * check for this skill.
 *
 * `skill` is a src/data/skills.js catalog entry; `lore` (mutually
 * exclusive) is a { name, proficiency } lore skill — meta-only, no actions.
 * `stats` carries the numbers the cluster already computed: { modifier,
 * rank, abilityMod, itemBonus, itemSources, skillMods }.
 */
const SkillSheet = ({ character, themeColor, skill, lore, stats, onClose }) => {
  const [launched, setLaunched] = useState(null); // { action, encounter: bool }

  const { encounter } = useEncounter();
  const { effects: activeEffects } = useEffects(character?.id || '');
  const { effects: effectCatalog } = useContent();

  const encounterMode = !!(encounter && encounter.active && encounter.phase === 'in-progress');

  // Escape closes the sheet (scrim tap and the ✕ button are the other paths).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!skill && !lore) return null;

  const name = lore ? `${lore.name} Lore` : skill.name;
  const abilityKey = lore ? 'intelligence' : skill.ability;
  const abilityAbbr = ABILITIES.find((a) => a.key === abilityKey)?.abbr || '';
  const rank = lore ? (lore.proficiency || 0) : (stats?.rank || 0);

  // Breakdown chips — recompose the always-on total from parts the model
  // already exposes: ability mod + (total − ability − item) proficiency +
  // item bonus, then one chip per netted condition/effect source.
  const modifier = stats?.modifier ?? 0;
  const abilityMod = stats?.abilityMod ?? 0;
  const itemBonus = stats?.itemBonus ?? 0;
  const profBonus = modifier - abilityMod - itemBonus;
  const modSources = stats?.skillMods?.sources || [];

  // The skill's automated actions in the current context (encounter-only
  // entries stay informational outside one). Matched to the catalog rows by
  // name; unmatched automated entries (Escape under Athletics) append.
  const ctx = encounterMode ? 'encounter' : 'exploration';
  const automated = lore ? [] : SKILL_ACTIONS.filter(
    (a) =>
      (a.skill === skill.id || (a.skillOptions || []).includes(skill.id)) &&
      a.availableTo === 'all' &&
      (a.surfaces || ['encounter']).includes(ctx)
  );
  const catalogActions = lore ? [] : skill.actions || [];
  const matchedIds = new Set();
  const rows = catalogActions.map((action) => {
    const auto = automated.find(
      (a) => a.name.toLowerCase() === action.name.toLowerCase()
    );
    if (auto) matchedIds.add(auto.id);
    return { name: action.name, description: action.description, auto };
  });
  automated
    .filter((a) => !matchedIds.has(a.id))
    .forEach((auto) => rows.push({ name: auto.name, description: null, auto }));

  const launch = (action) => {
    setLaunched({
      action: augmentSkillAction(character, action, {
        effects: activeEffects,
        effectCatalog,
      }),
      encounter: encounterMode,
    });
  };

  // Plain skill check — no target, no cost; SkillCheckModal resolves the
  // net modifier (conditions + effects) and the degree vs a GM-entered DC.
  const rollPlainCheck = () => {
    launch({
      id: `check-${skill.id}`,
      name: `${skill.name} Check`,
      skill: skill.id,
      actionCost: null,
      traits: [],
      defense: null,
      selfTarget: true,
      outcomes: {},
    });
  };

  const closeLaunched = () => setLaunched(null);

  const sheet = (
    <div className="sksheet-scrim" onClick={onClose}>
      <div
        className="sksheet"
        role="dialog"
        aria-modal="true"
        aria-label={`${name} details`}
        style={{ '--color-theme': themeColor }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sksheet-grip" aria-hidden="true" />
        <button
          type="button"
          className="sksheet-close"
          aria-label="Close skill sheet"
          onClick={onClose}
        >
          ✕
        </button>

        <div className="sksheet-hd">
          <span className="sksheet-big">
            <PenaltyDisplay base={modifier} penalty={stats?.skillMods} format="modifier" />
          </span>
          <div className="sksheet-title">
            <h3>{name}</h3>
            <span className="sksheet-meta">
              {abilityAbbr} · {RANK_LABELS[rank]}
              {itemBonus > 0 && ` · +${itemBonus} item`}
            </span>
          </div>
        </div>

        <div className="sksheet-brks">
          <span className="brk">{abilityAbbr} {formatModifier(abilityMod)}</span>
          <span className="brk">{RANK_LABELS[rank]} {formatModifier(profBonus)}</span>
          {itemBonus > 0 && (
            <span className="brk" title={stats?.itemSources || undefined}>
              Item +{itemBonus}
            </span>
          )}
          {modSources.map((s, i) => {
            const amount = s.bonus != null ? s.bonus : s.penalty;
            return (
              <span key={i} className={`brk ${amount > 0 ? 'brk--bonus' : 'brk--penalty'}`}>
                {s.label} {formatModifier(amount || 0)}
              </span>
            );
          })}
        </div>

        {rows.length > 0 && (
          <ul className="sksheet-acts" aria-label={`${name} actions`}>
            {rows.map((row) => (
              <li key={row.name} className="act">
                <span className="acost">
                  {row.auto ? <ActionSymbol cost={row.auto.actionCost} /> : null}
                </span>
                <span className="act-body">
                  <span className="act-name">{row.name}</span>
                  {row.description && (
                    <span className="act-desc">{row.description}</span>
                  )}
                </span>
                {row.auto && (
                  <button
                    type="button"
                    className="act-use"
                    aria-label={`Use ${row.name}`}
                    onClick={() => launch(row.auto)}
                  >
                    Use
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        {!lore && (
          <div className="sksheet-foot">
            <button type="button" className="pbtn" onClick={rollPlainCheck}>
              Roll {skill.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <>
      {ReactDOM.createPortal(sheet, document.body)}
      {launched && launched.encounter && (
        <SkillActionModal
          isOpen
          onClose={closeLaunched}
          action={launched.action}
          character={character}
          themeColor={themeColor}
        />
      )}
      {launched && !launched.encounter && (
        <SkillCheckModal
          isOpen
          onClose={closeLaunched}
          action={launched.action}
          character={character}
          themeColor={themeColor}
        />
      )}
    </>
  );
};

export default SkillSheet;
