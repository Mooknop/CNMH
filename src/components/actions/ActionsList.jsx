// src/components/actions/ActionsList.js
import React, { useCallback, useState } from 'react';
import SegmentedDeck from '../encounter/commandsheet/SegmentedDeck';
import MagicModal from '../spells/MagicModal';
import UseAbilityModal from '../encounter/UseAbilityModal';
import TreatWoundsModal from '../encounter/TreatWoundsModal';
import HuntPreyModal from '../encounter/HuntPreyModal';
import SkillActionModal from '../encounter/SkillActionModal';
import MoveActionSheet from '../encounter/MoveActionSheet';
import ExploitVulnerabilityModal from '../encounter/ExploitVulnerabilityModal';
import EncounterDoors from '../encounter/EncounterDoors';
import AnimalCompanionModal from '../character-sheet/AnimalCompanionModal';
import FamiliarModal from '../character-sheet/FamiliarModal';
import UseConsumableModal from '../inventory/UseConsumableModal';
import ConsumableSaveModal from '../inventory/ConsumableSaveModal';
import SpellgunAttackModal from '../encounter/SpellgunAttackModal';
import ReloadSheet from '../inventory/ReloadSheet';
import { skillActionsFor, augmentSkillAction } from '../../data/skillActions';
import { consumableMeta } from '../../utils/consumables';
import { isSpellgun } from '../../utils/spellgun';
import { useEffects } from '../../hooks/useEffects';
import { useContent } from '../../contexts/ContentContext';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { useCharacter } from '../../hooks/useCharacter';
import { useFocusTarget } from '../../hooks/useFocusTarget';
import { useGrantedActions } from '../../hooks/useGrantedActions';
import { useStance } from '../../hooks/useStance';
import { useBladeByrnie } from '../../hooks/useBladeByrnie';
import { minionTurnId, MINION_COMPANION, MINION_FAMILIAR } from '../../utils/minionUtils';
import './ActionsList.css';

const ActionsList = ({ character, characterColor }) => {
  const [isMagicOpen, setIsMagicOpen] = useState(false);
  const [usingAbility, setUsingAbility] = useState(null); // { ability, cost } | null
  const [treatWoundsMode, setTreatWoundsMode] = useState(null); // 'battle-medicine' | 'staunch-bleeding' | null
  const [huntPreyCost, setHuntPreyCost] = useState(null); // action cost when the Hunt Prey modal is open, else null
  const [skillAction, setSkillAction] = useState(null); // a skillActions.js entry while its modal is open, else null
  const [companionOpen, setCompanionOpen] = useState(false); // Command an Animal → companion command surface
  const [familiarOpen, setFamiliarOpen] = useState(false); // Command → familiar command surface (#391)
  const [moveAction, setMoveAction] = useState(null); // { moveType } while the movement sheet is open (#415), else null
  const [consumable, setConsumable] = useState(null); // { item, actionCost } while the consumable sheet is open (#428), else null
  const [saveConsumable, setSaveConsumable] = useState(null); // { item, actionCost } while a save-forcing consumable modal is open (#1085), else null
  const [reload, setReload] = useState(null); // { reload, actionCost } while the Reload ammo sheet is open (#675), else null
  const [exploitOpen, setExploitOpen] = useState(false); // Exploit Vulnerability slide-up (#454)
  const [spellgunFire, setSpellgunFire] = useState(null); // resolved spellgun while its attack modal is open (#1207 M1b), else null

  const { encounter, appendLog } = useEncounter();
  const { spendActions, spendReaction } = useTurnState(character.id);
  // Minion pools (#391) — Command spends 1 owner action and grants the minion 2.
  const { grantActions: grantCompanion } = useTurnState(minionTurnId(character.id, MINION_COMPANION));
  const { grantActions: grantFamiliar } = useTurnState(minionTurnId(character.id, MINION_FAMILIAR));
  const { flags, inventory: resolvedInventory } = useCharacter(character);
  const hasMagic = flags.hasSpellcasting || flags.hasFocusSpells || flags.hasInnateSpells
    || flags.hasScrolls || flags.hasWands || flags.hasStaff || flags.hasEldPowers || flags.hasHarrowing;
  const { grantedActions, removeGrantedAction } = useGrantedActions(character.id);
  const { enter: enterStance } = useStance(character.id);
  const { active: bladeActive, activate: activateBlade, returnToArmor: returnBlade } = useBladeByrnie(character.id);
  // Active effects + catalog feed conditional ('vs X') effect-modifier toggles
  // onto skill actions (#338) — surfaced as opt-in checkboxes in SkillActionModal.
  const { effects: activeEffects } = useEffects(character.id);
  const { effects: effectCatalog } = useContent();
  // A focused ally (#429) pre-targets the support resolvers (Battle Medicine / Treat Wounds).
  const { focusAlly } = useFocusTarget(character.id);

  const encounterMode = !!(encounter && encounter.active && encounter.phase === 'in-progress');

  const themeColor = characterColor || 'var(--color-primary)';

  // Player-initiated skill actions (#260) — Demoralize today. Only in encounter.
  const skillActions = skillActionsFor(character, { encounterMode });

  // Command an Animal (#223, #391) — present only for a PC with an animal companion.
  // Spends 1 of the owner's actions and grants the companion 2 actions (its pool),
  // then opens the companion command surface (strike/move/Support). The companion
  // spends from that pool and its MAP resets with the owner's turn.
  const hasCompanion = !!character.animalCompanion;
  const hasFamiliar = !!character.familiar;

  const handleCommandAnimal = useCallback(() => {
    if (encounterMode) {
      spendActions(1, 'Command an Animal');
      grantCompanion(2, 'Command an Animal');
      appendLog({
        type: 'action',
        charId: character.id,
        text: `${character.name} commanded ${character.animalCompanion?.name || 'their companion'} (Command an Animal, 1 act → 2 actions)`,
      });
    }
    setCompanionOpen(true);
  }, [encounterMode, spendActions, grantCompanion, appendLog, character.id, character.name, character.animalCompanion]);

  // Command a familiar (#391) — familiars don't use Command an Animal, but per the
  // table's ruling directing one grants the same 2-action pool for 1 owner action.
  const handleCommandFamiliar = useCallback(() => {
    if (encounterMode) {
      spendActions(1, 'Command');
      grantFamiliar(2, 'Command');
      appendLog({
        type: 'action',
        charId: character.id,
        text: `${character.name} commanded ${character.familiar?.name || 'their familiar'} (1 act → 2 actions)`,
      });
    }
    setFamiliarOpen(true);
  }, [encounterMode, spendActions, grantFamiliar, appendLog, character.id, character.name, character.familiar]);

  const handleUse = useCallback(
    (item, cost) => {
      // Spellguns (#1207 M1b) — the item's "Activate a Spellgun" tile is sourced
      // by the spellgun's name; route it to the attack flow with the resolved
      // (grade-merged) inventory item rather than the bare action.
      if (item.source) {
        const gun = (resolvedInventory || []).find((i) => isSpellgun(i) && i.name === item.source);
        if (gun) { setSpellgunFire(gun); return; }
      }

      // Battle Medicine has its own resolution flow.
      if (item.name === 'Battle Medicine') {
        setTreatWoundsMode('battle-medicine');
        return;
      }

      // Staunch Bleeding (#224) — a Treat Wounds variant that stops bleeding;
      // routes to the same modal in its own mode (handles its 1–2 action cost).
      if (item.name === 'Staunch Bleeding') {
        setTreatWoundsMode('staunch-bleeding');
        return;
      }

      // Hunt Prey (#223) — designating prey picks an enemy and sets synced
      // state; the modal handles the pick + the 1-action spend in encounter.
      if (item.name === 'Hunt Prey') {
        setHuntPreyCost(encounterMode ? 1 : 0);
        return;
      }

      // Stances (#224) — entering toggles synced state and spends the action;
      // there's no target or roll, so skip the modal. Entering a new stance
      // overwrites any current one (you can only be in one stance).
      if (item.traits?.includes('Stance')) {
        enterStance(item.name);
        if (encounterMode) {
          spendActions(cost, item.name);
          appendLog({
            type: 'action',
            charId: character.id,
            text: `${character.name} entered ${item.name} (${cost} act)`,
          });
        } else {
          appendLog({
            type: 'action',
            charId: character.id,
            text: `${character.name} entered ${item.name}`,
          });
        }
        return;
      }

      // Blade Byrnie (#738) — "Draw a Blade" spawns the transient +1 striking
      // dagger (no roll, no target); the dagger Strike then appears in the list.
      // Toggling while already drawn returns it to the armor.
      if (item.controller === 'blade-byrnie') {
        if (bladeActive) returnBlade();
        else activateBlade();
        const verb = bladeActive ? 'returned the Blade Byrnie dagger' : 'drew a Blade Byrnie dagger';
        if (encounterMode) spendActions(cost, item.name);
        appendLog({ type: 'action', charId: character.id, text: `${character.name} ${verb}${encounterMode ? ` (${cost} act)` : ''}` });
        return;
      }

      // Movement actions (Stride/Step) drive the Foundry token, not a roll (#415).
      // Open the movement sheet, which mounts useTokenMovement + MoveGridPicker and
      // charges actions per the Stride/Step accounting.
      if (encounterMode && item.controller === 'move') {
        setMoveAction({ moveType: item.moveType || 'stride' });
        return;
      }

      // Reload (#675) — a chambered weapon's Reload tile opens the ammo sheet
      // (plain bolt vs. carried special ammo). The sheet performs the chamber
      // write + action spend; `cost` is the weapon's Reload action cost.
      if (item.kind === 'reload') {
        setReload({ reload: item, actionCost: encounterMode ? cost : 0 });
        return;
      }

      // Consumables (#428) — potions/elixirs route to their own resolve flow.
      // `cost` is the tile's effective cost (drink + draw/retrieve); pass it as the
      // action cost so a stowed Elixir spends 3, a held one 1. Self-use this slice.
      // A save-forcing consumable (#1085 — Devil's Breath Incense) routes to the
      // save modal instead: it targets nearby creatures via the save-request rail.
      const cmeta = consumableMeta(item);
      if (cmeta) {
        if (cmeta.kind === 'save') setSaveConsumable({ item, actionCost: encounterMode ? cost : 0 });
        else setConsumable({ item, actionCost: encounterMode ? cost : 0 });
        return;
      }

      // Open the targeting modal in encounter mode unless the action explicitly
      // opts out (requiresTarget: false — pure movement like Stride, Stand, etc.).
      if (encounterMode && item.requiresTarget !== false) {
        setUsingAbility({ ability: item, cost });
        return;
      }

      if (cost === 'reaction') {
        spendReaction(item.name);
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (reaction)`,
        });
      } else if (cost === 'free' || cost === 0) {
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (free action)`,
        });
      } else {
        spendActions(cost, item.name);
        appendLog({
          type: 'action',
          charId: character.id,
          text: `${character.name} used ${item.name} (${cost} act)`,
        });
      }
    },
    [character.id, character.name, spendActions, spendReaction, appendLog, encounterMode, enterStance, bladeActive, activateBlade, returnBlade, resolvedInventory]
  );

  const handleUseGranted = useCallback(
    (grant) => {
      const cost = grant.action?.cost ?? 1;
      spendActions(cost, grant.action?.name || grant.source);
      appendLog({
        type: 'action',
        charId: character.id,
        text: `${character.name} used ${grant.action?.name || grant.source} (granted, ${cost} act)`,
      });
      removeGrantedAction(grant.id);
    },
    [character.id, character.name, spendActions, appendLog, removeGrantedAction]
  );

  return (
    <div className="actions-list">
      <h2 style={{ '--color-theme': themeColor }}>Encounter</h2>

      {encounterMode && grantedActions.length > 0 && (
        <div className="granted-actions-section" aria-label="Granted actions">
          <h3 className="granted-actions-title">Granted Actions</h3>
          {grantedActions.map((grant) => (
            <div key={grant.id} className="granted-action-row">
              <span className="granted-action-name">{grant.action?.name || grant.source}</span>
              {grant.action?.description && (
                <span className="granted-action-desc">{grant.action.description}</span>
              )}
              <button
                className="btn-encounter-use"
                aria-label={`Use granted ${grant.action?.name || grant.source}`}
                onClick={() => handleUseGranted(grant)}
              >
                Use ({grant.action?.cost ?? 1} act)
              </button>
            </div>
          ))}
        </div>
      )}

      {encounterMode && hasCompanion && (
        <div className="granted-actions-section" aria-label="Companion">
          <h3 className="granted-actions-title">Companion</h3>
          <div className="granted-action-row">
            <span className="granted-action-name">Command an Animal</span>
            <button
              className="btn-encounter-use"
              aria-label="Command an Animal"
              onClick={handleCommandAnimal}
            >
              Use (1 act)
            </button>
          </div>
        </div>
      )}

      {encounterMode && hasFamiliar && (
        <div className="granted-actions-section" aria-label="Familiar">
          <h3 className="granted-actions-title">Familiar</h3>
          <div className="granted-action-row">
            <span className="granted-action-name">Command {character.familiar?.name || 'familiar'}</span>
            <button
              className="btn-encounter-use"
              aria-label={`Command ${character.familiar?.name || 'familiar'}`}
              onClick={handleCommandFamiliar}
            >
              Use (1 act)
            </button>
          </div>
        </div>
      )}

      {/* Exploit Vulnerability (#454) — Thaumaturge-only. Tap a foe in the
          initiative strip to pre-target, then open the slide-up roll panel. */}
      {encounterMode && flags.isThaumaturge && (
        <div className="granted-actions-section" aria-label="Exploit Vulnerability">
          <h3 className="granted-actions-title">Thaumaturge</h3>
          <div className="granted-action-row">
            <span className="granted-action-name">Exploit Vulnerability</span>
            <button
              className="btn-encounter-use"
              aria-label="Exploit Vulnerability"
              onClick={() => setExploitOpen(true)}
            >
              Use (1 act)
            </button>
          </div>
        </div>
      )}

      {/* Interact: open/close a door in reach (#435) — self-hides when none nearby. */}
      {encounterMode && (
        <EncounterDoors charId={character.id} characterName={character.name} />
      )}

      {/* All action types live in the Segmented Deck (Strikes · Spells · Actions ·
          React · Items) — the encounter UI redesign that replaced the one long
          cost-grouped grid. Player skill actions (#260) are the deck's Actions-tab
          Skill group; taps still resolve through handleUse / the skill modal. */}
      <SegmentedDeck
        character={character}
        themeColor={themeColor}
        encounterMode={encounterMode}
        onUse={handleUse}
        onMagicOpen={hasMagic ? () => setIsMagicOpen(true) : undefined}
        skillActions={encounterMode ? skillActions : []}
        onSkillAction={(sa) => setSkillAction(augmentSkillAction(character, sa, { effects: activeEffects, effectCatalog }))}
      />

      {hasMagic && (
        <MagicModal
          isOpen={isMagicOpen}
          onClose={() => setIsMagicOpen(false)}
          character={character}
          themeColor={themeColor}
        />
      )}

      {usingAbility && (
        <UseAbilityModal
          isOpen
          onClose={() => setUsingAbility(null)}
          ability={usingAbility.ability}
          cost={usingAbility.cost}
          verb="Use"
          character={character}
          themeColor={themeColor}
        />
      )}

      {treatWoundsMode && (
        <TreatWoundsModal
          isOpen
          onClose={() => setTreatWoundsMode(null)}
          mode={treatWoundsMode}
          healer={character}
          themeColor={themeColor}
          actionCost={treatWoundsMode === 'battle-medicine' && encounterMode ? 1 : 0}
          defaultTargetId={focusAlly?.charId}
        />
      )}

      {huntPreyCost !== null && (
        <HuntPreyModal
          isOpen
          onClose={() => setHuntPreyCost(null)}
          character={character}
          themeColor={themeColor}
          actionCost={huntPreyCost}
        />
      )}

      {skillAction && (
        <SkillActionModal
          isOpen
          onClose={() => setSkillAction(null)}
          action={skillAction}
          character={character}
          themeColor={themeColor}
        />
      )}

      {hasCompanion && (
        <AnimalCompanionModal
          isOpen={companionOpen}
          onClose={() => setCompanionOpen(false)}
          animalCompanion={character.animalCompanion}
          character={character}
          characterColor={themeColor}
        />
      )}

      {hasFamiliar && (
        <FamiliarModal
          isOpen={familiarOpen}
          onClose={() => setFamiliarOpen(false)}
          familiar={character.familiar}
          character={character}
          characterColor={themeColor}
        />
      )}

      {moveAction && (
        <MoveActionSheet
          character={character}
          moveType={moveAction.moveType}
          themeColor={themeColor}
          onClose={() => setMoveAction(null)}
        />
      )}

      {exploitOpen && (
        <ExploitVulnerabilityModal
          isOpen
          onClose={() => setExploitOpen(false)}
          character={character}
          themeColor={themeColor}
        />
      )}

      {consumable && (
        <UseConsumableModal
          isOpen
          onClose={() => setConsumable(null)}
          item={consumable.item}
          character={character}
          themeColor={themeColor}
          actionCost={consumable.actionCost}
          defaultTargetId={focusAlly?.charId}
        />
      )}

      {saveConsumable && (
        <ConsumableSaveModal
          isOpen
          onClose={() => setSaveConsumable(null)}
          item={saveConsumable.item}
          character={character}
          themeColor={themeColor}
          actionCost={saveConsumable.actionCost}
        />
      )}

      {reload && (
        <ReloadSheet
          isOpen
          onClose={() => setReload(null)}
          reload={reload.reload}
          character={character}
          themeColor={themeColor}
          actionCost={reload.actionCost}
        />
      )}

      {spellgunFire && (
        <SpellgunAttackModal
          isOpen
          onClose={() => setSpellgunFire(null)}
          item={spellgunFire}
          character={character}
          themeColor={themeColor}
        />
      )}
    </div>
  );
};

export default ActionsList;
