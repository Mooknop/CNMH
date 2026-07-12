// src/components/inventory/ItemModal.js
import React, { useState } from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import ActionSymbol from '../shared/ActionSymbol';
import ThassilonianRune from '../shared/ThassilonianRune';
import RuneIcon from '../shared/RuneIcon';
import GameGlyph from '../shared/GameGlyph';
import ItemActivations from '../shared/ItemActivations';
import RuneMechanics from '../shared/RuneMechanics';
import CastSpellModal from '../encounter/CastSpellModal';
import ShieldRuneActivations from './ShieldRuneActivations';
import AugmentationActivations from './AugmentationActivations';
import { formatBulk, normalizeShield, normalizeArmor, isContainer, flattenInventory, isArmor } from '../../utils/InventoryUtils';
import { armorDisplayName } from '../../utils/armorRunes';
import { ITEM_STATE_LABEL, isHeldState, isBodyBound, STOWED } from '../../utils/itemState';
import { consumableMeta, consumableVerb } from '../../utils/consumables';
import { isSpellgun } from '../../utils/spellgun';
import { isDragonbreath } from '../../utils/dragonbreath';
import {
  absorbedKey, isSpellgunHost, spellgunHostCapacity, absorbedHostUid,
  absorb, retrieve as retrieveAbsorbed, absorbedSpellgunsByHost, validSpellgunHosts,
} from '../../utils/spellgunHost';
import { itemEffectsFor, removeItemEffect, itemEffectsKey } from '../../utils/itemEffects';
import {
  isTalisman, affixTargetType, validAffixHosts, affixedHostUid,
  affix, unaffix, affixedKey, itemUidOf, deactivateTalisman, affixedTalismansByHost,
} from '../../utils/affix';
import { activationOf, activationSummary } from '../../utils/talismanActivation';
import {
  isWhetstone, whetstoneMeta, whetstoneChoice, whetstoneDuration, whetstoneDurationLabel,
  eligibleWhetstoneWeapons, needsRegripNote, activeWhetstoneOn, buildWhetstoneEffectEntry,
  withWhetstoneApplied,
} from '../../utils/whetstone';
import { expiryLabel, expiryLabelSecs } from '../../utils/expiry';
import { itemModesOf, activeItemMode } from '../../utils/itemModes';
import { weaponDisplayName, runeTierSummary, weaponPropertyRunes } from '../../utils/weaponRunes';
import { shieldDisplayName, resolveShieldBlock, shieldRuneTierSummary, hasReinforcing, shieldEffectiveTraits, shieldPropertyRunes } from '../../utils/shieldRunes';
import {
  attachedKey, isShieldAttachment, validAttachHosts, attachedHostUid,
  attach, unattach, attachmentsByHost,
} from '../../utils/shieldAttach';
import { hasAccessoryRune, resolveAccessoryItem, accessoryDisplayName, withAccessoryActivations, accessoryRuneOf } from '../../utils/accessoryRunes';
import { actuatedCastsSpell, buildRuneCastSpell } from '../../utils/runeSpellCast';
import { spellItemDisplayName, castRank } from '../../utils/spellItems';
import { resolveItemStrikes } from '../../utils/strikeUtils';
import { itemTint, itemCharges, itemCode, isGlowy, itemRarity } from '../../utils/inventoryTile';
import { runeForName } from '../../utils/thassilonianRunes';
import { runeIconsOf, resolveRuneIcon, fundamentalRuneId } from '../../utils/runeIcons';
import { formatModifier } from '../../utils/CharacterUtils';
import { hasRustBlessing, brokenArmorAcPenalty } from '../../utils/rustBlessing';
import { isBrokenHp } from '../../utils/itemDurability';
import { useCharacter } from '../../hooks/useCharacter';
import { useItemHp } from '../../hooks/useItemHp';
import { useLoadout } from '../../hooks/useLoadout';
import { useInvested } from '../../hooks/useInvested';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useGiveItem } from '../../hooks/useGiveItem';
import { usePlayMode } from '../../hooks/usePlayMode';
import { useItemActivation } from '../../hooks/useItemActivation';
import { useContent } from '../../contexts/ContentContext';
import { useGameDate } from '../../contexts/GameDateContext';
import { toGameSeconds } from '../../utils/gameTime';
import { buildEffectEntry } from '../../utils/applyAbility';
import './ItemModal.css';
import { RELAY, APP, syncKey, globalKey } from '../../sync/keys';

const ItemModal = ({ isOpen, onClose, item, character, characterColor, onUse }) => {
  // Hooks must run unconditionally (before the early return).
  const charData = useCharacter(character);
  const { drop, pickUp, stow, unhand, retrieve, moveToContainer } = useLoadout(character?.id);
  // Attunement overlay (#invest) — read-only here: attuning is done by dragging
  // an item into one of the 10 Attuned slots (in a slot = invested). The modal
  // just reflects the status as a chip.
  const { isInvested } = useInvested(character?.id);
  // Item-target effects (oils, #339) — read live so removal stays in sync.
  const [itemEffects, setItemEffects] = useSyncedState(itemEffectsKey(character?.id), []);
  // Affixed-talisman overlay (#254/#339) + consumed overlay for activation.
  const [affixed, setAffixed] = useSyncedState(affixedKey(character?.id), {});
  // Shield-attachment overlay (#1165 Track 2) — attachmentUid → hostShieldUid.
  const [attached, setAttached] = useSyncedState(attachedKey(character?.id), {});
  // Spellgun-absorption overlay (#1208) — spellgunUid → host glove uid.
  const [absorbed, setAbsorbed] = useSyncedState(absorbedKey(character?.id), {});
  const [, setConsumed] = useSyncedState(syncKey(APP.CONSUMED, character?.id), {});
  // Etch-time accessory-rune config (#1055 S4) — the depicted dragon type for a
  // Dragon's Breath rune, chosen on the inscribed item and read by useCharacter
  // when it derives the rune's Widen Spellshape free action.
  const [runeConfig, setRuneConfig] = useSyncedState(syncKey(APP.RUNECONFIG, character?.id), {});
  // Item-mode toggle (#1093) — the player-facing switch between an item's
  // authored states (Gloom Blade's light, a hood up/down). This modal is the
  // sole writer; useCharacter applies the choice to the effective inventory.
  const [itemModeState, setItemModeState] = useSyncedState(syncKey(APP.ITEMMODE, character?.id), {});
  // Active-effects store (#1055 S5) — an actuated block may apply a lasting
  // self-effect on activation (Trackless (Greater)'s 8-hour emanation). Written
  // here on activate; EffectsPanel renders it with a Dismiss ×. Also read for
  // the whetstone-on-weapon child line (#1213).
  const [effects, setEffects] = useSyncedState(syncKey(APP.EFFECTS, character?.id), []);
  // Whetstone application (#1213) needs the encounter for round-ticked expiry
  // and an apply-time choice pick (Morph Jewel's damage type). Raw key read —
  // the modal only checks active/round/order, no need for the full hook.
  const [encounter] = useSyncedState(globalKey(RELAY.ENCOUNTER), null);
  const [whetstonePick, setWhetstonePick] = useState(null);
  const { appendEvent } = useSessionLog();
  // Player-to-player item transfer (#656/#657) — out of combat only.
  const { give, giveConsumable } = useGiveItem(character?.id);
  const { mode } = usePlayMode();
  const { characters, spells } = useContent();
  // Rune-granted spell cast (#1055 S3) — Menacing (Greater) fear / Presentable
  // (Greater) suggestion. Open state for the hosted cast modal.
  const [castingRune, setCastingRune] = useState(false);
  // A shield property rune's spell cast (#1196 G3 wiring) — the built cast to hand
  // to CastSpellModal, or null. Set when a spell-casting rune activation fires.
  const [shieldRuneCast, setShieldRuneCast] = useState(null);
  // Actuated-item activation state machine (#957 S4) — once/day + Overload +
  // broken/repair, driven by an item's optional `actuated` block.
  const { gameDate, time } = useGameDate();
  const nowSecs = toGameSeconds({ ...gameDate, ...time });
  const itemAct = useItemActivation(character, item, { nowSecs });
  // Stack-split amount for giving a consumable (#657). Clamped to the remaining
  // quantity at render so it can't exceed what's on hand.
  const [giveCount, setGiveCount] = useState(1);
  // Live item durability (#539/#542) — HP overlay reads/writes + the two
  // manual-bookkeeping inputs (apply damage / repair HP) on the panel below.
  const itemHp = useItemHp(character?.id);
  const [damageInput, setDamageInput] = useState('');
  const [repairInput, setRepairInput] = useState('');

  if (!isOpen || !item) return null;

  const activeItemEffects = itemEffectsFor(itemEffects, item);

  // Strike resolution (#691): the catalog strike has no stored attack bonus —
  // it's derived from the wielder's stats (ability/proficiency, runes/potency,
  // and special rules like the Flawless Hammer's spell-attack). Resolve per-item
  // so the modal can show the real bonus/damage; fall back to any explicitly
  // authored values (used by tests/synthetic items) or "-". An active whetstone
  // effect bound to this weapon alters the displayed strikes too (#1214).
  const weaponWhetstone = item.strikes ? activeWhetstoneOn(effects, itemUidOf(item)) : null;
  const resolvedStrikes = resolveItemStrikes(item, charData, null, weaponWhetstone);
  const strikeBonus = (raw, i) => {
    const mod = resolvedStrikes[i]?.attackMod;
    if (typeof mod === 'number') return formatModifier(mod);
    return raw?.bonus ?? '-';
  };
  const strikeDamage = (raw, i) => resolvedStrikes[i]?.damage || raw?.damage || '-';

  // Talisman affixing (#254/#339). A talisman picks a valid host (by its affixTo
  // type) via a 10-minute activity; affixing/unaffixing logs to the session log.
  const talisman = isTalisman(item);
  const flatInventory = flattenInventory(charData?.inventory);
  const affixHosts = talisman ? validAffixHosts(flatInventory, item) : [];
  const affixedTo = talisman
    ? flatInventory.find((it) => itemUidOf(it) === affixedHostUid(affixed, itemUidOf(item)))
    : null;

  const doAffix = (host) => {
    setAffixed((cur) => affix(cur, itemUidOf(item), itemUidOf(host)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} affixed ${item.name} to ${host.name} (10-minute activity)` });
    onClose();
  };
  // Whetstone application (#1213). A whetstone picks a weapon (1 Interact), is
  // consumed on application, and leaves a timed effect entry bound to that
  // weapon in cnmh_effects_ — one whetstone per weapon, a new apply replaces
  // the old in the same write. Two-handed weapons get a regrip reminder only.
  const whetstone = isWhetstone(item);
  const whetstoneWeapons = whetstone ? eligibleWhetstoneWeapons(flatInventory, item) : [];
  const whetstoneChoiceBlock = whetstone ? whetstoneChoice(item) : null;
  const selfEntryId = (encounter?.order || []).find(
    (e) => e.kind === 'pc' && e.charId === character?.id
  )?.entryId || null;

  const doApplyWhetstone = (weapon) => {
    const entry = buildWhetstoneEffectEntry({
      item,
      weapon,
      charId: character?.id,
      choice: whetstoneChoiceBlock ? whetstonePick : undefined,
      encounter,
      casterEntryId: selfEntryId,
      nowSecs,
    });
    setEffects((cur) => withWhetstoneApplied(cur, entry));
    setConsumed((cur) => ({ ...(cur || {}), [item.name]: ((cur || {})[item.name] || 0) + 1 }));
    const regrip = needsRegripNote(weapon)
      ? ' — regrip to keep wielding it in two hands'
      : '';
    appendEvent({
      type: 'action',
      text: `${character?.name || 'Someone'} applied ${item.name} to ${weapon.name} (Interact, ${whetstoneDurationLabel(whetstoneDuration(item))})${regrip}`,
    });
    onClose();
  };

  // When THIS item is a weapon: remove the whetstone effect bound to it.
  const doRemoveWhetstone = () => {
    setEffects((cur) => (cur || []).filter((e) => e.id !== weaponWhetstone.id));
    appendEvent({
      type: 'action',
      text: `${character?.name || 'Someone'} removed ${weaponWhetstone.whetstone.itemName} from ${item.name}`,
    });
    onClose();
  };

  // Shield attachments (#1165 Track 2). An attachment (Shield Spikes/Boss) is its
  // own weapon that binds to a shield via a 10-minute activity — reusable, never
  // consumed. While the host shield is held its Strike is injected (useCharacter);
  // it keeps its own weapon runes.
  const attachment = isShieldAttachment(item);
  const attachHosts = attachment ? validAttachHosts(flatInventory, item) : [];
  const attachedToShield = attachment
    ? flatInventory.find((it) => itemUidOf(it) === attachedHostUid(attached, itemUidOf(item)))
    : null;
  // When THIS item is a shield: the attachment(s) currently bound to it.
  const shieldAttachments = item.shield
    ? (attachmentsByHost(attached, flatInventory)[itemUidOf(item)] || [])
    : [];
  // Affixed talismans bound to THIS item as their host (#254/#339). Like shield
  // attachments and runes, an affixed talisman has no tile of its own — it lives
  // on its host's card, the sole place to activate or remove it.
  const hostedTalismans = affixedTalismansByHost(affixed, flatInventory)[itemUidOf(item)] || [];

  // Spellgun hosts (#1208) — the Arcane Duelist's Gloves absorb spellguns. The
  // binding mirrors talisman affix / shield attach but is capacity-limited: a
  // spellgun is absorbed into a glove (10-min activity), fired from the glove
  // card, or retrieved intact (never consumed on retrieval — only on firing).
  const spellgunItem = isSpellgun(item);
  const absorbHosts = spellgunItem ? validSpellgunHosts(flatInventory, item, absorbed) : [];
  const absorbedInto = spellgunItem
    ? flatInventory.find((it) => itemUidOf(it) === absorbedHostUid(absorbed, itemUidOf(item)))
    : null;
  // When THIS item is a host glove: the spellgun(s) currently absorbed into it.
  const gloveHost = isSpellgunHost(item);
  const gloveCapacity = spellgunHostCapacity(item);
  const absorbedGuns = gloveHost
    ? (absorbedSpellgunsByHost(absorbed, flatInventory)[itemUidOf(item)] || [])
    : [];

  const doAbsorb = (host) => {
    setAbsorbed((cur) => absorb(cur, itemUidOf(item), host));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} absorbed ${item.name} into ${host.name} (10-minute activity)` });
    onClose();
  };
  const doRetrieveAbsorbed = () => {
    setAbsorbed((cur) => retrieveAbsorbed(cur, itemUidOf(item)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} retrieved ${item.name} from ${absorbedInto?.name || 'the gloves'} (10-minute activity)` });
    onClose();
  };
  const doRetrieveHosted = (g) => {
    setAbsorbed((cur) => retrieveAbsorbed(cur, itemUidOf(g)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} retrieved ${g.name} from ${item.name} (10-minute activity)` });
    onClose();
  };

  const doAttach = (host) => {
    setAttached((cur) => attach(cur, itemUidOf(item), itemUidOf(host)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} attached ${item.name} to ${host.name} (10-minute activity)` });
    onClose();
  };
  const doDetach = (attachmentItem) => {
    const a = attachmentItem || item;
    setAttached((cur) => unattach(cur, itemUidOf(a)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} removed ${a.name} from its shield (10-minute activity)` });
    onClose();
  };

  const doUnaffix = () => {
    setAffixed((cur) => unaffix(cur, itemUidOf(item)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} removed ${item.name} from ${affixedTo?.name || 'its item'}` });
    onClose();
  };

  // Host-card counterparts (#gm-gear follow-up): remove or activate a talisman
  // affixed to THIS item, addressed by the talisman rather than the open item.
  const doUnaffixHosted = (t) => {
    setAffixed((cur) => unaffix(cur, itemUidOf(t)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} removed ${t.name} from ${item.name}` });
    onClose();
  };
  const doActivateHosted = (t) => {
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} activated ${t.name}: ${activationSummary(t, charData)}` });
    deactivateTalisman({ talisman: t, setConsumed, setAffixed });
    onClose();
  };

  // Activation — only for an affixed talisman that declares an activation. The
  // generic surface: consume the talisman and log its (computed) effect (#254).
  const activation = talisman && affixedTo ? activationOf(item) : null;
  const doActivate = () => {
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} activated ${item.name}: ${activationSummary(item, charData)}` });
    deactivateTalisman({ talisman: item, setConsumed, setAffixed });
    onClose();
  };

  // Actuated activation (#957 S4) — scepter-style once/day effect paid with a
  // spell-slot sacrifice, with Overload + broken/repair. Items carrying an
  // `actuated` block render this surface, as do accessory-runed hosts whose
  // rune declares one (#1033 S2, cost:'none' — frequency-gated, no slot).
  const actuated = itemAct.actuated || item.actuated || null;
  const freeActuated = itemAct.cost === 'none';
  const who = character?.name || 'Someone';
  // A spellRef actuation (#1055 S3) casts a catalog spell instead of just
  // logging. It routes through the shared cast flow, which records the
  // once/day use itself (same `${uid}:actuated` frequency key), so the card's
  // Activate button just opens the modal — no direct itemAct spend.
  const runeSpellDoc = actuatedCastsSpell(actuated)
    ? (spells || []).find((s) => s.id === actuated.spellRef) || null
    : null;
  // When the actuated block belongs to the inscribed accessory rune (the host
  // has none of its own — mirrors useItemActivation's fallback), tag the cast
  // with the rune's id so committing it stamps the rune's glyph (#1377).
  const actuatedRuneId = !item.actuated && actuated ? (accessoryRuneOf(item)?.id ?? null) : null;
  const runeCastSpell = runeSpellDoc
    ? buildRuneCastSpell(actuated, runeSpellDoc, itemUidOf(item), actuatedRuneId)
    : null;
  const doActuate = (rank) => {
    if (runeCastSpell) { setCastingRune(true); return; }
    const r = itemAct.activation.activate(rank);
    if (r.ok) {
      const spent = r.label ? ` (spent ${r.label})` : '';
      // Actuated self-effect (#1055 S5): Trackless (Greater) applies an 8-hour
      // emanation on activation. Built at the current clock so its expiry sweeps
      // out; a self-scoped write means no encounter/order is needed.
      if (actuated.effect && character?.id) {
        const entry = buildEffectEntry({
          eff: actuated.effect,
          caster: { id: character.id, name: who },
          abilityName: actuated.name,
          encounter: null,
          casterEntryId: null,
          targetEntryId: null,
          nowSecs,
        });
        setEffects((cur) => [...(Array.isArray(cur) ? cur : []), entry]);
      }
      appendEvent({ type: 'action', text: `${who} activated ${item.name} — ${actuated.name}${spent}` });
      onClose();
    }
  };
  // A shield property rune's activation fired (#1196 G3/G4): log it, and for a
  // spell-casting rune (Gusting → Gust of Wind) open the cast modal with the
  // rune's fixed-rank cast. The frequency was already spent by the card.
  // A bound augmentation's activation fired (#1411 Bucket B): the card already
  // spent the frequency gate — log it. Enemy-side effects (Thorns, Sunshine!)
  // resolve on the GM's side; the log is the shared record either way.
  const onAugmentationActivate = (aug) => {
    appendEvent({ type: 'action', text: `${who} activated ${item.name} — ${aug.actuated.name}` });
  };
  const onShieldRuneActivate = (rune, spellDoc) => {
    const cast = spellDoc
      ? buildRuneCastSpell(rune.actuated, spellDoc, `${itemUidOf(item)}:${rune.id}`, rune.id)
      : null;
    const detail = spellDoc ? ` — casts ${spellDoc.name}` : '';
    appendEvent({ type: 'action', text: `${who} activated ${shieldDisplayName(item)} — ${rune.actuated.name}${detail}` });
    if (cast) setShieldRuneCast(cast);
  };
  const doOverload = (rank) => {
    const r = itemAct.overload.overload(rank);
    if (!r.ok) return;
    const outcome = r.success
      ? `${actuated.name} resolves, but ${item.name} is now broken`
      : `the effect fizzles and the actions are lost; ${item.name} is now broken`;
    appendEvent({
      type: 'action',
      text: `${who} overloaded ${item.name} (spent ${r.label}) — DC ${r.dc} flat check rolled ${r.roll}: ${outcome}`,
    });
    onClose();
  };
  const doRepairAction = () => {
    if (itemAct.repair.withAction().ok) {
      appendEvent({ type: 'action', text: `${who} repaired ${item.name} with the Repair action` });
      onClose();
    }
  };
  const doRepairSlot = () => {
    const r = itemAct.repair.withSlot();
    if (r.ok) {
      appendEvent({ type: 'action', text: `${who} repaired ${item.name} (spent ${r.label})` });
      onClose();
    }
  };

  const themeColor = characterColor || 'var(--color-primary)';
  // Normalize so legacy { health, breakThreshold } and canonical
  // { hp, brokenThreshold } shields both display correctly. resolveShieldBlock
  // folds any reinforcing rune in first, so the displayed Hardness/HP/BT are the
  // resolved values (#1165 S4); a non-reinforced shield passes through unchanged.
  const shield = normalizeShield(resolveShieldBlock(item));

  // ── Loadout actions, scoped to the item's current ownership state ──
  const uid = item.uid;
  const containers = (charData?.inventory || []).filter(isContainer);
  const parent = containers.find((c) =>
    (c.container?.contents || []).some((ci) => ci.uid === uid)
  );
  const isContainerItem = isContainer(item);
  const stowTargets = containers.filter((c) => c.uid !== uid);
  const moveTargets = containers.filter((c) => c.uid !== uid && c.uid !== parent?.uid);

  // ── Loot-card presentation (#item-modal-loot-card) ──
  // Rarity drives the foil/gem; material tint + charge state drive the hero
  // art; the category eyebrow is derived from field presence (no stored type).
  const rarity = itemRarity(item);                       // common|uncommon|rare|unique
  const tint = itemTint(item);                           // ember|iron|verdant|arcane|gold|neutral
  const charges = itemCharges(item);                     // { current, max } | null
  const code = itemCode(item.name);
  const thassRune = runeForName(item.thassilonianRune);  // rune-marked gear | null
  // Catalog runes (#1369): a runestone's held rune is the hero art when the
  // item has neither image nor sin rune; everything else rides as medallions
  // (bottom-left — the sin badge owns bottom-right, the gem top-left).
  const catalogRunes = runeIconsOf(item);
  const heldRune = item.runestone?.rune;
  const runeArt = !item.image && !thassRune && heldRune ? heldRune : null;
  const runeCoins = catalogRunes.filter((doc) => doc !== runeArt);
  const category =
    isContainerItem ? 'Container'
    : item.strikes ? 'Weapon'
    : item.shield ? 'Shield'
    : item.staff ? 'Staff'
    : item.wand ? 'Wand'
    : item.scroll ? 'Scroll'
    : item.runestone ? 'Runestone'
    : whetstone ? 'Whetstone'
    : consumableMeta(item) ? 'Consumable'
    : 'Gear';
  const rarityLabel = rarity.charAt(0).toUpperCase() + rarity.slice(1);
  // Runed display name: armor folds potency/resilient/property into its name
  // (#727); weapons use their own rune resolver. Un-runed items pass through.
  // An inscribed accessory rune (#1033) prefixes its name onto whatever the
  // target-specific resolver derived (dual-host: "Menacing +1 Explorer's
  // Clothing"); resolveAccessoryItem also grants the Magical/Invested trait
  // chips and the rune's rider lines for display.
  const accessory = hasAccessoryRune(item) ? resolveAccessoryItem(item) : null;
  const displayName = accessoryDisplayName(
    item,
    item.shield ? shieldDisplayName(item)
    : isArmor(item) ? armorDisplayName(item)
    : (item.scroll || item.wand) ? spellItemDisplayName(item)
    : weaponDisplayName(item)
  );

  // Run a loadout mutation then close so the refreshed list is visible.
  const act = (fn) => { fn(); onClose(); };

  // ── Durability panel (#539/#542) ──
  // Live HP / Hardness / Broken Threshold for tracked gear, with manual
  // apply-damage + repair bookkeeping. Only for a real inventory entry of an
  // owning character (the uid keys the cnmh_itemhp_ overlay); untracked items
  // (consumables, artifacts, plain gear) get no panel. The Broken penalties
  // themselves are auto-applied elsewhere (strike gating, armor AC synth) —
  // the hint line here just says what's happening and why.
  const durability = character && uid != null ? itemHp.statusFor(item) : null;
  const blessed = hasRustBlessing(charData);
  const durabilityHint = !durability ? null
    : durability.destroyed
      ? 'Destroyed — it can’t be used or Repaired.'
    : !durability.broken ? null
    : item.shield
      ? (blessed
        ? 'Broken — Rust Blessing: it can still be Raised at its full bonus.'
        : 'Broken — it can’t be Raised or used to Shield Block.')
    : isArmor(item)
      ? (() => {
        const penalty = brokenArmorAcPenalty(
          normalizeArmor(item.armor)?.category || 'unarmored', blessed);
        return penalty
          ? `Broken — ${penalty} status penalty to AC while worn (applied automatically${blessed ? '; softened by Rust Blessing' : ''}).`
          : 'Broken — Rust Blessing: no AC penalty for armor this light.';
      })()
    : item.strikes
      ? (blessed
        ? 'Broken — Rust Blessing: its Strikes stay usable at −2 to attack.'
        : 'Broken — its Strikes are unavailable until it’s repaired.')
    : 'Broken — it can’t be used for its normal function.';

  const doApplyItemDamage = () => {
    const dealt = Math.floor(Number(damageInput));
    if (!(dealt > 0)) return;
    const r = itemHp.applyDamage(item, dealt);
    if (!r) return;
    setDamageInput('');
    const state = r.destroyed ? ' — destroyed' : r.broken ? ' — broken' : '';
    appendEvent({
      type: 'action',
      text: `${character?.name || 'Someone'}'s ${item.name} took ${r.taken} damage (${r.prevented} prevented by Hardness) — ${r.hpAfter}/${durability.maxHp} HP${state}`,
    });
  };
  const doRepairItem = () => {
    const amount = Math.floor(Number(repairInput));
    if (!(amount > 0)) return;
    const next = itemHp.repairItem(item, amount);
    if (next == null) return;
    setRepairInput('');
    const still = isBrokenHp(next, durability.brokenThreshold) ? ' — still broken' : '';
    appendEvent({
      type: 'action',
      text: `${character?.name || 'Someone'} repaired ${item.name} — ${next}/${durability.maxHp} HP${still}`,
    });
  };

  // Attunement is slot-driven (drag into the Attuned area); the modal only
  // reflects the status as a chip. Body-bound gear (tattoos) is permanently
  // invested — the chip shows regardless of the attunement overlay.
  const bodyBound = isBodyBound(item);
  const invested = isInvested(uid) || bodyBound;

  // ── Item modes (#1093) ──
  // The grid hands us the effective entry (mode already applied), so
  // activeModeId is normally stamped; the util fallback covers an item
  // arriving un-moded (PartyWealth, tests).
  const modes = itemModesOf(item);
  const activeModeId = item.activeModeId ?? activeItemMode(item, itemModeState)?.id ?? null;
  const setItemMode = (optionId) => {
    if (optionId === activeModeId) return;
    setItemModeState((cur) => ({ ...(cur || {}), [itemUidOf(item)]: optionId }));
    const opt = modes.options.find((o) => o.id === optionId);
    appendEvent({
      type: 'action',
      text: `${character?.name || 'Someone'} switched ${item.name}${modes.label ? ` (${modes.label})` : ''} to ${opt?.label || optionId}`,
    });
  };

  // ── Give to another PC (#656/#657) — exploration/downtime only ──
  // Worn/stowed gear, containers (with their contents), and consumables (with
  // stack-splitting) are all givable. Held/dropped items, talismans, and any
  // item hosting an affixed talisman are excluded to keep the transfer clean.
  const canGive = mode === 'exploration' || mode === 'downtime';
  const hostsAffixedTalisman = Object.values(affixed || {}).includes(uid);
  const givable =
    canGive &&
    uid != null &&
    (item.state === 'worn' || item.state === STOWED) &&
    !talisman &&
    !hostsAffixedTalisman &&
    !bodyBound; // a tattoo is inked on — it can't change owners
  const recipients = (characters || []).filter((c) => c.id !== character?.id);

  // Consumable stack-splitting (#657): offer a quantity picker when there's
  // more than one to give. The split count is clamped to what remains.
  const isGivableConsumable = !!consumableMeta(item);
  const remainingQty = item.quantity ?? 1;
  const giveQty = Math.min(Math.max(1, giveCount), remainingQty);

  const doGive = (recipient) => {
    const ok = isGivableConsumable
      ? giveConsumable(recipient.id, item, giveQty)
      : give(recipient.id, item);
    if (ok) {
      const label = isGivableConsumable && giveQty > 1 ? `${giveQty} ${item.name}` : item.name;
      appendEvent({
        type: 'action',
        text: `${character?.name || 'Someone'} gave ${label} to ${recipient.name}`,
      });
    }
    onClose();
  };

  const renderActions = () => {
    if (!uid) return null;
    // Body-bound (tattoo): no placement actions at all — it can't be dropped,
    // stowed, handed, or removed. A quiet note says why.
    if (bodyBound) {
      return (
        <span className="item-bound-note" data-testid="item-bound-note">
          Tattooed on the body — cannot be removed or stowed
        </span>
      );
    }
    const st = item.state;
    if (st === 'dropped') {
      return (
        <button className="btn-small btn-secondary" data-testid="item-action-pickup" onClick={() => act(() => pickUp(uid))}>
          Pick up
        </button>
      );
    }
    if (isHeldState(st)) {
      return (
        <>
          <button className="btn-small btn-secondary" data-testid="item-action-unhand" onClick={() => act(() => unhand(uid))}>
            Unhand
          </button>
          <button className="btn-small btn-danger" data-testid="item-action-release" onClick={() => act(() => drop(uid))}>
            Release
          </button>
        </>
      );
    }
    if (st === 'stowed') {
      return (
        <>
          <button className="btn-small btn-secondary" data-testid="item-action-retrieve" onClick={() => act(() => retrieve(uid))}>
            Retrieve
          </button>
          {moveTargets.map((c) => (
            <button
              key={c.uid}
              className="btn-small btn-secondary"
              onClick={() => act(() => moveToContainer(uid, c.uid))}
            >
              Move to {c.name}
            </button>
          ))}
        </>
      );
    }
    // Worn (default).
    return (
      <>
        <button className="btn-small btn-danger" data-testid="item-action-drop" onClick={() => act(() => drop(uid))}>
          Drop
        </button>
        {!isContainerItem && stowTargets.map((c) => (
          <button
            key={c.uid}
            className="btn-small btn-secondary"
            onClick={() => act(() => stow(uid, c.uid))}
          >
            Stow in {c.name}
          </button>
        ))}
      </>
    );
  };

  const actions = renderActions();

  // Use / Drink / Apply for consumables (#217) — only where the host page
  // provides a use flow (the character sheet; PartyWealth passes no onUse).
  // Spellguns (#1207 M1b) are attack-consumables — not the healing/effect kind
  // consumableMeta recognises — so they get their own Fire button that routes to
  // the spellgun attack flow (the host page's onUse branches on isSpellgun).
  const isGun = isSpellgun(item);
  // Dragonbreath weapons (#1210 M4e) get a Breathe button that routes to the
  // breath AoE flow (the host page's onUse branches on isDragonbreath). A weapon,
  // not a consumable — never gated on quantity.
  const isBreather = isDragonbreath(item);
  const useButton = onUse && (consumableMeta(item) || isGun || isBreather) && (item.quantity ?? 1) > 0 ? (
    <button className="btn-small btn-primary" data-testid="item-action-use" onClick={() => act(() => onUse(item))}>
      {isBreather ? 'Breathe' : isGun ? 'Fire' : consumableVerb(item)}
    </button>
  ) : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={displayName}
      themeColor={themeColor}
      highZ
      hideHeader
      className={`modal--loot rar-${rarity}`}
    >
      <button className="loot-close" onClick={onClose} aria-label="Close">&times;</button>

      {/* ── hero art: full-panel tile (real art, the item's Thassilonian rune,
             or the itemCode placeholder) ── */}
      <div className="loot-art">
        <span className={`loot-tile tint-${tint}${isGlowy(item) ? ' is-glow' : ''}`}>
          {item.image
            ? <img src={`/api/images/${item.image}`} alt="" style={item.imagePosition ? { objectPosition: `${item.imagePosition.x}% ${item.imagePosition.y}%` } : undefined} />
            : thassRune
              ? <span className="loot-rune-art"><ThassilonianRune name={item.thassilonianRune} tint title={`Rune of ${thassRune.label}`} /></span>
              : runeArt
                ? <span className="loot-rune-art"><RuneIcon runeId={runeArt.id} tint title={runeArt.name} /></span>
                : <span className="loot-code">{code}</span>}
        </span>
        {item.image && thassRune && (
          <span
            className="loot-rune-badge rune-tint"
            data-rune={String(item.thassilonianRune).toLowerCase()}
          >
            <ThassilonianRune name={item.thassilonianRune} title={`Rune of ${thassRune.label}`} />
          </span>
        )}
        {runeCoins.length > 0 && (
          <span className="loot-runeicon-row">
            {runeCoins.slice(0, 2).map((doc) => {
              const icon = resolveRuneIcon(doc.id);
              return (
                <span
                  key={doc.id}
                  className="loot-runeicon runeicon-tint"
                  data-runeicon={icon.generic ? 'generic' : icon.family}
                >
                  <RuneIcon runeId={doc.id} title={doc.name} />
                </span>
              );
            })}
            {runeCoins.length > 2 && (
              <span
                className="loot-runeicon loot-runeicon-more"
                title={runeCoins.slice(2).map((d) => d.name).join(', ')}
              >
                +{runeCoins.length - 2}
              </span>
            )}
          </span>
        )}
        <span className="loot-gem" title={rarityLabel} />
        {charges && (
          <span className="loot-charges" title={`${charges.current} / ${charges.max} charges`}>
            {Array.from({ length: Math.min(charges.max, 8) }).map((_, i) => (
              <i key={i} className={i < charges.current ? 'on' : ''} />
            ))}
          </span>
        )}
      </div>

      {/* ── name plate: rarity · category eyebrow + item name ── */}
      <div className="loot-plate">
        <div className="loot-rarity">{rarityLabel} · {category}</div>
        <h2 className="loot-name">{displayName}</h2>
      </div>

      {/* ── scrollable body: every existing detail section ── */}
      <div className="loot-scroll">
      {/* Display traits if they exist — an inscribed accessory rune grants
          derived Magical + Invested chips on top of the authored traits; a
          shield shows its effective traits (base + rune-granted, e.g. Feather →
          Finesse, #1196 G3). */}
      {(() => {
        const traits = accessory
          ? accessory.traits
          : item.shield ? shieldEffectiveTraits(item) : item.traits;
        return (traits || []).length > 0 ? (
          <div className="item-traits">
            {traits.map((trait, i) => (
              <TraitTag key={i} trait={trait} />
            ))}
          </div>
        ) : null;
      })()}

      {/* Attunement status chip (#invest) */}
      {invested && (
        <div className="item-invested" data-testid="item-invested-chip">
          <span className="item-invested-chip">✶ Invested</span>
        </div>
      )}

      {/* Item-mode toggle (#1093) — player-switchable authored states */}
      {modes && (
        <div className="item-modes" data-testid="item-modes">
          <span className="item-modes-label">{modes.label || 'Mode'}</span>
          <div className="item-modes-toggle" role="group" aria-label={modes.label || 'Item mode'}>
            {modes.options.map((o) => (
              <button
                key={o.id}
                type="button"
                className={`item-mode-btn${o.id === activeModeId ? ' is-active' : ''}`}
                data-testid={`item-mode-${o.id}`}
                aria-pressed={o.id === activeModeId}
                onClick={() => setItemMode(o.id)}
              >
                {o.label || o.id}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="item-detail-grid">
        <div className="item-detail">
          <span className="item-detail-label">Quantity</span>
          <span className="item-detail-value">{item.quantity || 1}</span>
        </div>

        <div className="item-detail">
          <span className="item-detail-label">Bulk</span>
          <span className="item-detail-value">
            {formatBulk(item.weight || 0)}
          </span>
        </div>

        {charges && (
          <div className="item-detail item-detail--charges">
            <span className="item-detail-label">Charges</span>
            <span className="item-detail-value">{charges.current}/{charges.max}</span>
            <span className="charge-pips" aria-hidden="true">
              {Array.from({ length: Math.min(charges.max, 6) }).map((_, i) => (
                <i key={i} className={i < charges.current ? 'on' : ''} />
              ))}
            </span>
          </div>
        )}

        {item.state && (
          <div className="item-detail">
            <span className="item-detail-label">State</span>
            <span className="item-detail-value">
              {ITEM_STATE_LABEL[item.state] || ITEM_STATE_LABEL.worn}
            </span>
          </div>
        )}

        {item.level != null && (
          <div className="item-detail">
            <span className="item-detail-label">Level</span>
            <span className="item-detail-value">{item.level}</span>
          </div>
        )}

        {(accessory ? accessory.price : item.price) ? (
          <div className="item-detail">
            <span className="item-detail-label">Price</span>
            <span className="item-detail-value">{accessory ? accessory.price : item.price} gp</span>
          </div>
        ) : null}
      </div>

      {/* Durability (#539/#542) — live HP / Hardness / Broken Threshold with
          apply-damage + repair bookkeeping. Damage is reduced by Hardness on
          apply; repair is manual HP for now (the Repair action and Rust Scrub
          land in #543). Destroyed (0 HP) is final — no repair offered. */}
      {durability && (
        <div className="item-durability" data-testid="item-durability">
          <h3>
            Durability
            {(durability.broken || durability.destroyed) && (
              <span
                className={`durability-tag${durability.destroyed ? ' is-destroyed' : ''}`}
                data-testid="durability-state"
              >
                {durability.destroyed ? 'Destroyed' : 'Broken'}
              </span>
            )}
          </h3>
          <div className="item-detail-grid is-block">
            <div className="item-detail">
              <span className="item-detail-label">Hit Points</span>
              <span className="item-detail-value" data-testid="durability-hp">
                {durability.hp}/{durability.maxHp}
              </span>
            </div>
            <div className="item-detail">
              <span className="item-detail-label">Hardness</span>
              <span className="item-detail-value">{durability.hardness}</span>
            </div>
            <div className="item-detail">
              <span className="item-detail-label">Broken Threshold</span>
              <span className="item-detail-value">{durability.brokenThreshold}</span>
            </div>
          </div>
          {durabilityHint && (
            <p className="item-durability-hint" data-testid="durability-hint">{durabilityHint}</p>
          )}
          {durability.destroyed ? (
            <p className="item-durability-hint">A destroyed item can’t be Repaired.</p>
          ) : (
            <div className="item-durability-controls">
              <div className="item-durability-row">
                <input
                  type="number"
                  min="1"
                  inputMode="numeric"
                  aria-label="Damage to apply"
                  placeholder="Damage"
                  value={damageInput}
                  onChange={(e) => setDamageInput(e.target.value)}
                />
                <button
                  type="button"
                  className="btn-small btn-danger"
                  data-testid="durability-apply-damage"
                  disabled={!(Number(damageInput) > 0)}
                  onClick={doApplyItemDamage}
                >
                  Apply damage
                </button>
              </div>
              {durability.hp < durability.maxHp && (
                <div className="item-durability-row">
                  <input
                    type="number"
                    min="1"
                    inputMode="numeric"
                    aria-label="Hit Points to repair"
                    placeholder="HP"
                    value={repairInput}
                    onChange={(e) => setRepairInput(e.target.value)}
                  />
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    data-testid="durability-repair"
                    disabled={!(Number(repairInput) > 0)}
                    onClick={doRepairItem}
                  >
                    Repair
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Shield properties */}
      {shield && (
        <div className="shield-properties">
          <h3>Shield Properties</h3>
          {hasReinforcing(item) && (
            <p className="shield-rune-tier" data-testid="shield-rune-tier">
              <RuneIcon runeId={`${item.runes.reinforcing}-reinforcing`} tint className="item-rune-glyph" />
              {shieldRuneTierSummary(item.runes)} rune — Hardness/HP/BT reinforced
            </p>
          )}
          {/* Property runes (#1196 G3): each etched shield property rune's name
              (with its chosen type, if any) and flavor — so a wired effect like
              Darkness's +1 Stealth or Energy-Resistant's resistance is visible on
              the shield sheet, mirroring the weapon property-rune list below. */}
          {shieldPropertyRunes(item).length > 0 && (
            <div className="shield-property-runes" data-testid="shield-property-runes">
              {shieldPropertyRunes(item).map((rune, i) => (
                <div key={`${rune.id}-${rune.choice ?? i}`} className="item-rune">
                  <span className="item-rune-name">
                    <RuneIcon runeId={rune.id} tint className="item-rune-glyph" />
                    {rune.name}{rune.choice ? ` (${rune.choice})` : ''}
                  </span>
                  {rune.description && <p className="item-rune-desc">{rune.description}</p>}
                </div>
              ))}
            </div>
          )}
          <div className="item-detail-grid is-block">
            {shield.bonus !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">AC Bonus</span>
                <span className="item-detail-value">+{shield.bonus}</span>
              </div>
            )}
            {shield.hardness !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">Hardness</span>
                <span className="item-detail-value">{shield.hardness}</span>
              </div>
            )}
            {shield.hp !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">Hit Points</span>
                <span className="item-detail-value">{shield.hp}</span>
              </div>
            )}
            {shield.brokenThreshold !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">Broken Threshold</span>
                <span className="item-detail-value">{shield.brokenThreshold}</span>
              </div>
            )}
          </div>
          <div className="shield-info">
            <strong>Shield Rules:</strong> Raise this shield for +{shield.bonus || 0} AC.
            It has {shield.hardness || 0} Hardness and {shield.hp || 0} HP.
          </div>
          {shield.takeCoverBonus !== undefined && (
            <div className="shield-info" data-testid="shield-take-cover">
              <strong>Take Cover:</strong> while raised, Take Cover to raise the AC
              bonus to +{shield.takeCoverBonus}.
            </div>
          )}
          {(item.traits || []).some((t) => String(t).toLowerCase() === 'deflecting') && (
            <div className="shield-info" data-testid="shield-deflecting">
              <strong>Deflecting:</strong> +2 Hardness when you Shield Block a ranged attack.
            </div>
          )}
          {shieldAttachments.length > 0 && (
            <div className="shield-attachments" data-testid="shield-attachments">
              {shieldAttachments.map((a) => (
                <div key={itemUidOf(a)} className="item-affix-state">
                  <span>Attachment: <strong>{a.name}</strong> — its Strike is available while this shield is held.</span>
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => doDetach(a)}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Affixed talismans (#254/#339) — those bound to THIS item as their host.
          Nested here like runes / shield attachments: an affixed talisman has no
          tile of its own, so this is where it is activated or removed. */}
      {hostedTalismans.length > 0 && (
        <div className="item-affix" data-testid="hosted-talismans">
          <h3>Affixed Talismans</h3>
          {hostedTalismans.map((t) => {
            const act = activationOf(t);
            return (
              <div key={itemUidOf(t)} className="item-affix-state item-affix-state--stack">
                <div className="hosted-talisman-info">
                  <span><strong>{t.name}</strong> — affixed to this item.</span>
                  {act && (
                    <p className="item-affix-hint">
                      {act.cost === 'reaction' ? 'Reaction' : act.cost === 'free' ? 'Free action' : `${act.cost} action`}
                      {act.trigger ? ` — ${act.trigger}.` : ''}
                    </p>
                  )}
                </div>
                <div className="hosted-talisman-actions">
                  {act && (
                    <button
                      type="button"
                      className="btn-small btn-primary"
                      data-testid={`hosted-activate-${itemUidOf(t)}`}
                      onClick={() => doActivateHosted(t)}
                    >
                      Activate ({activationSummary(t, charData)})
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    data-testid={`hosted-unaffix-${itemUidOf(t)}`}
                    onClick={() => doUnaffixHosted(t)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Applied whetstone (#1213) — the whetstone effect bound to THIS weapon,
          nested here like an affixed talisman: name, countdown, reminder text,
          and manual removal (it is also visible/removable in EffectsPanel). */}
      {weaponWhetstone && (
        <div className="item-affix" data-testid="hosted-whetstone">
          <h3>Whetstone</h3>
          <div className="item-affix-state item-affix-state--stack">
            <div className="hosted-talisman-info">
              <span>
                <strong>{weaponWhetstone.whetstone.itemName}</strong>
                {weaponWhetstone.whetstone.choice ? ` (${weaponWhetstone.whetstone.choice})` : ''}
                {' — '}
                {weaponWhetstone.expireAtSecs != null
                  ? `until ${expiryLabelSecs(weaponWhetstone.expireAtSecs, nowSecs)}`
                  : weaponWhetstone.expireAt
                    ? `expires ${expiryLabel(weaponWhetstone.expireAt)}`
                    : 'active'}
              </span>
              {weaponWhetstone.whetstone.reminder && (
                <p className="item-affix-hint">{weaponWhetstone.whetstone.reminder}</p>
              )}
            </div>
            <div className="hosted-talisman-actions">
              <button
                type="button"
                className="btn-small btn-secondary"
                data-testid="hosted-whetstone-remove"
                onClick={doRemoveWhetstone}
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Absorbed spellguns (#1208) — the Arcane Duelist's Gloves host spellguns
          nested here (like affixed talismans): fired or retrieved from this card. */}
      {gloveHost && (
        <div className="item-affix" data-testid="absorbed-spellguns">
          <h3>Absorbed Spellguns <span className="item-affix-count">{absorbedGuns.length} / {gloveCapacity}</span></h3>
          {absorbedGuns.length === 0 ? (
            <p className="item-affix-hint">
              No spellgun absorbed. Absorb one from its item card (10-minute activity).
            </p>
          ) : (
            absorbedGuns.map((g) => (
              <div key={itemUidOf(g)} className="item-affix-state item-affix-state--stack">
                <div className="hosted-talisman-info">
                  <span><strong>{g.name}</strong> — absorbed into these gloves.</span>
                  <p className="item-affix-hint">Activate with at least one hand empty.</p>
                </div>
                <div className="hosted-talisman-actions">
                  {onUse && (
                    <button
                      type="button"
                      className="btn-small btn-primary"
                      data-testid={`absorbed-fire-${itemUidOf(g)}`}
                      onClick={() => act(() => onUse(g))}
                    >
                      Fire
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-small btn-secondary"
                    data-testid={`absorbed-retrieve-${itemUidOf(g)}`}
                    onClick={() => doRetrieveHosted(g)}
                  >
                    Retrieve
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Active item-target effects (oils, #339) — with manual removal for the
          untimed ones (timed effects also clear on the game clock). */}
      {activeItemEffects.length > 0 && (
        <div className="item-effects">
          <h3>Active Effects</h3>
          <ul className="item-effects-list">
            {activeItemEffects.map((e) => (
              <li key={e.id} className="item-effect-row">
                <span className="item-effect-label">
                  ✨ {e.label}
                  {e.source ? <span className="item-effect-source"> · {e.source}</span> : null}
                </span>
                <button
                  type="button"
                  className="item-effect-remove"
                  aria-label={`Remove ${e.label}`}
                  onClick={() => setItemEffects(removeItemEffect(itemEffects, e.id))}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Talisman affixing (#254/#339) — affix to a valid host (10-min activity)
          or, when affixed, show the host + Unaffix. */}
      {talisman && (
        <div className="item-affix">
          <h3>Affix</h3>
          {affixedTo ? (
            <>
              <div className="item-affix-state">
                <span>Affixed to <strong>{affixedTo.name}</strong></span>
                <button
                  type="button"
                  className="btn-small btn-secondary"
                  data-testid="item-action-unaffix"
                  onClick={doUnaffix}
                >
                  Unaffix
                </button>
              </div>
              {activation && (
                <div className="item-affix-activate">
                  <p className="item-affix-hint">
                    {activation.cost === 'reaction' ? 'Reaction' : activation.cost === 'free' ? 'Free action' : `${activation.cost} action`}
                    {activation.trigger ? ` — ${activation.trigger}.` : ''}
                  </p>
                  <button
                    type="button"
                    className="btn-small btn-primary"
                    data-testid="item-action-activate"
                    onClick={doActivate}
                  >
                    Activate ({activationSummary(item, charData)})
                  </button>
                </div>
              )}
            </>
          ) : affixHosts.length > 0 ? (
            <>
              <p className="item-affix-hint">
                Affix to {affixTargetType(item) ? `a ${affixTargetType(item)}` : 'an item'} (10-minute activity):
              </p>
              <div className="item-affix-hosts">
                {affixHosts.map((h) => (
                  <button
                    key={itemUidOf(h)}
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => doAffix(h)}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="item-affix-hint">
              No valid {affixTargetType(item) || 'item'} to affix this to.
            </p>
          )}
        </div>
      )}

      {/* Whetstone application (#1213) — apply to a weapon (1 Interact); the
          whetstone is consumed and its timed effect binds to the picked weapon.
          A weapon under an old whetstone effect gets it replaced on apply. */}
      {whetstone && character && (item.quantity ?? 1) > 0 && (
        <div className="item-affix" data-testid="item-whetstone">
          <h3>Apply to Weapon</h3>
          {whetstoneWeapons.length === 0 ? (
            <p className="item-affix-hint">
              No {whetstoneMeta(item)?.targets === 'ranged' ? 'ranged ' : ''}weapon to apply this to.
            </p>
          ) : (
            <>
              <p className="item-affix-hint">
                Apply to a {whetstoneMeta(item)?.targets === 'ranged' ? 'ranged ' : ''}weapon
                (Interact) — consumed on application, lasts {whetstoneDurationLabel(whetstoneDuration(item))}.
                A weapon holds one whetstone effect at a time.
              </p>
              {whetstoneChoiceBlock && (
                <div className="item-affix-hosts item-whetstone-choice" data-testid="whetstone-choice">
                  <span className="item-affix-hint">{whetstoneChoiceBlock.label || 'Choose'}:</span>
                  {whetstoneChoiceBlock.options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      className={`btn-small ${whetstonePick === opt ? 'btn-primary' : 'btn-secondary'}`}
                      data-testid={`whetstone-choice-${opt}`}
                      onClick={() => setWhetstonePick(opt)}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              )}
              <div className="item-affix-hosts">
                {whetstoneWeapons.map((w) => {
                  const replacing = activeWhetstoneOn(effects, itemUidOf(w));
                  return (
                    <button
                      key={itemUidOf(w)}
                      type="button"
                      className="btn-small btn-secondary"
                      data-testid={`whetstone-apply-${itemUidOf(w)}`}
                      disabled={!!whetstoneChoiceBlock && !whetstonePick}
                      onClick={() => doApplyWhetstone(w)}
                    >
                      {w.name}
                      {replacing ? ` (replaces ${replacing.whetstone.itemName})` : ''}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Absorb into gloves (#1208) — a spellgun binds to an Arcane Duelist's
          Gloves host (10-min activity); retrieval returns it intact. */}
      {spellgunItem && (absorbedInto || absorbHosts.length > 0) && (
        <div className="item-affix" data-testid="item-absorb">
          <h3>Absorb</h3>
          {absorbedInto ? (
            <div className="item-affix-state">
              <span>Absorbed into <strong>{absorbedInto.name}</strong></span>
              <button
                type="button"
                className="btn-small btn-secondary"
                data-testid="item-action-retrieve-absorbed"
                onClick={doRetrieveAbsorbed}
              >
                Retrieve
              </button>
            </div>
          ) : (
            <>
              <p className="item-affix-hint">
                Absorb into a pair of spellgun gloves (10-minute activity):
              </p>
              <div className="item-affix-hosts">
                {absorbHosts.map((h) => (
                  <button
                    key={itemUidOf(h)}
                    type="button"
                    className="btn-small btn-secondary"
                    data-testid={`absorb-host-${itemUidOf(h)}`}
                    onClick={() => doAbsorb(h)}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Shield attachment (#1165 Track 2) — attach to a shield (10-min activity,
          reusable) or, when attached, show the host + Remove. */}
      {attachment && (
        <div className="item-affix" data-testid="item-attach">
          <h3>Attach</h3>
          {attachedToShield ? (
            <div className="item-affix-state">
              <span>Attached to <strong>{attachedToShield.name}</strong></span>
              <button
                type="button"
                className="btn-small btn-secondary"
                data-testid="item-action-detach"
                onClick={() => doDetach(item)}
              >
                Remove
              </button>
            </div>
          ) : attachHosts.length > 0 ? (
            <>
              <p className="item-affix-hint">
                Attach to a shield (10-minute activity). Its Strike works while the shield is held,
                and it keeps its own weapon runes.
              </p>
              <div className="item-affix-hosts">
                {attachHosts.map((h) => (
                  <button
                    key={itemUidOf(h)}
                    type="button"
                    className="btn-small btn-secondary"
                    onClick={() => doAttach(h)}
                  >
                    {h.name}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="item-affix-hint">No shield to attach this to.</p>
          )}
        </div>
      )}

      {/* Weapon runes (#548): potency/striking tier summary + each property
          rune's name and flavor. Hidden for non-runed / legacy baked items. */}
      {(runeTierSummary(item.runes) || weaponPropertyRunes(item).length > 0) && (
        <div className="item-runes" data-testid="item-modal-runes">
          <h3>Runes</h3>
          {runeTierSummary(item.runes) && (
            <p className="item-rune-tier">
              {fundamentalRuneId('potency', item.runes?.potency) && (
                <RuneIcon
                  runeId={fundamentalRuneId('potency', item.runes.potency, isArmor(item) ? 'armor' : 'weapon')}
                  tint
                  className="item-rune-glyph"
                />
              )}
              {fundamentalRuneId('striking', item.runes?.striking) && (
                <RuneIcon runeId={fundamentalRuneId('striking', item.runes.striking)} tint className="item-rune-glyph" />
              )}
              {runeTierSummary(item.runes)}
            </p>
          )}
          {weaponPropertyRunes(item).map((rune) => (
            <div key={rune.id} className="item-rune">
              <span className="item-rune-name">
                <RuneIcon runeId={rune.id} tint className="item-rune-glyph" />
                {rune.name}
              </span>
              {rune.description && <p className="item-rune-desc">{rune.description}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Accessory rune (#1033): the one inscribed rune's name, flavor, and any
          rider reminder lines. Rendered whether the host is a plain cloak or a
          dual-host armor (armor runes render above in their own section). */}
      {accessory?.rune && (
        <div className="item-runes" data-testid="item-modal-accessory-rune">
          <h3>Accessory Rune</h3>
          <div className="item-rune">
            <span className="item-rune-name">
              <RuneIcon runeId={accessory.rune.id} tint className="item-rune-glyph" />
              {accessory.rune.name}
            </span>
            {accessory.rune.level != null && (
              <span className="item-rune-level"> · Level {accessory.rune.level}</span>
            )}
            {accessory.rune.description && (
              <p className="item-rune-desc">{accessory.rune.description}</p>
            )}
            {accessory.riders.map((rider) => (
              <p key={rider.id || rider.text} className="item-rune-desc">{rider.text}</p>
            ))}
            {/* Etch-time dragon-type choice (#1055 S4): the rune depicts one
                dragon, fixing the damage type its Widen Spellshape can affect.
                Chosen here on the inscribed item; useCharacter bakes it into the
                derived free action's chain. */}
            {accessory.rune.dragonChoice && uid != null && (
              <label className="item-rune-choice" data-testid="accessory-rune-choice">
                {accessory.rune.dragonChoice.label || 'Depicted dragon'}:{' '}
                <select
                  aria-label={accessory.rune.dragonChoice.label || 'Depicted dragon'}
                  value={runeConfig?.[uid]?.dragonType
                    ?? item.runes?.accessoryConfig?.dragonType
                    ?? accessory.rune.dragonChoice.options?.[0]?.value ?? ''}
                  onChange={(e) => setRuneConfig((cur) => ({
                    ...cur,
                    [uid]: { ...(cur?.[uid] || {}), dragonType: e.target.value },
                  }))}
                >
                  {(accessory.rune.dragonChoice.options || []).map((o) => (
                    <option key={o.value} value={o.value}>{o.label || o.value}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
        </div>
      )}

      {/* Runestone (#800): the held rune's FULL effect (#1055 S1) + an inert
          reminder. A runestone grants no mechanical effect until its rune is
          transferred onto gear. */}
      {item.runestone && (
        <div className="item-runestone" data-testid="item-modal-runestone">
          <h3>Runestone</h3>
          {item.runestone.rune ? (
            <>
              <div className="item-rune">
                <span className="item-rune-name">
                  <RuneIcon runeId={item.runestone.rune.id} tint className="item-rune-glyph" />
                  {item.runestone.rune.name}
                </span>
                {item.runestone.rune.level != null && (
                  <span className="item-rune-level"> · Level {item.runestone.rune.level}</span>
                )}
                <RuneMechanics rune={item.runestone.rune} />
              </div>
              <p className="item-runestone-note">
                Grants no effect while unattached — transfer the rune onto gear it
                etches to use it (the stone is destroyed).
              </p>
            </>
          ) : (
            <p className="item-runestone-note">An empty etching stone — it holds no rune yet.</p>
          )}
        </div>
      )}

      {/* Augmentation (#1202 U1) — the one single-slot modifier fitted to this
          host: name, price/level, choice, description, and any actuated block
          (rendered like an accessory-rune activation). The binding rides the
          inventory entry; the resolver inlined the doc here. */}
      {item.augmentation?.name && (
        <div className="item-runes item-augmentation" data-testid="item-modal-augmentation">
          <h3>
            <GameGlyph name="augmentation" className="item-rune-glyph" title="Augmentation" />
            Augmentation
          </h3>
          <div className="item-rune">
            <span className="item-rune-name">{item.augmentation.name}</span>
            {item.augmentation.choice && (
              <span className="item-rune-level"> · {item.augmentation.choice}</span>
            )}
            {item.augmentation.level != null && (
              <span className="item-rune-level"> · Level {item.augmentation.level}</span>
            )}
            {item.augmentation.price != null && (
              <span className="item-rune-level"> · {item.augmentation.price} gp</span>
            )}
            {item.augmentation.description && (
              <p className="item-rune-desc">{item.augmentation.description}</p>
            )}
          </div>
          {/* The augmentation's actuated block as an INTERACTIVE, frequency-gated
              activation card (#1411 Bucket B) — fires + logs, replacing the U1
              static card. */}
          <AugmentationActivations
            character={character}
            item={item}
            nowSecs={nowSecs}
            onActivate={onAugmentationActivate}
          />
        </div>
      )}

      {/* Description */}
      {item.description && (
        <div className="item-description">
          <h3>Description</h3>
          <p>{item.description}</p>
        </div>
      )}

      {/* Actions / Reactions / Free Actions (shared with the shop preview, #882);
          an inscribed rune's display activations merge in (#1033 S2) */}
      <ItemActivations item={withAccessoryActivations(item)} />

      {/* Shield property-rune activations (#1196 G3/G4) — each rune's actuated
          block gets its own frequency-gated card; spell-casters open the cast. */}
      {item.shield && (
        <ShieldRuneActivations
          character={character}
          item={item}
          nowSecs={nowSecs}
          spells={spells}
          onActivate={onShieldRuneActivate}
        />
      )}

      {/* Actuated activation (#957 S4) — interactive once/day + Overload +
          broken/repair for scepter-style items that declare an `actuated` block. */}
      {actuated && (
        <div className="item-actuated" data-testid="item-actuated">
          <h3>{freeActuated ? 'Activation' : 'Actuated'}</h3>
          <div className="item-action actuated-card">
            <div className="action-header">
              <span className="action-name">{actuated.name}</span>
              <div className="action-count">
                {actuated.actionCount && <ActionSymbol cost={actuated.actionCount} />}
              </div>
            </div>
            {actuated.traits && actuated.traits.length > 0 && (
              <div className="action-traits">
                {actuated.traits.map((t, i) => <TraitTag key={i} trait={t} />)}
              </div>
            )}
            {actuated.description && <p className="action-description">{actuated.description}</p>}
            <p className="actuated-cost">
              {freeActuated
                ? `Frequency: ${actuated.frequency || 'once per day'}`
                : `Cost: sacrifice a spell slot of rank ${itemAct.minRank}+ · once per day`}
            </p>

            {itemAct.broken ? (
              <div className="actuated-broken" data-testid="item-actuated-broken">
                <span className="actuated-broken-tag">⚠ Broken</span>
                {itemAct.repairable ? (
                  <div className="actuated-repair">
                    <button
                      type="button"
                      className="btn-small btn-secondary"
                      data-testid="actuated-repair-action"
                      onClick={doRepairAction}
                    >
                      Repair (action)
                    </button>
                    {itemAct.repair.minRankSlotAvailable && (
                      <button
                        type="button"
                        className="btn-small btn-secondary"
                        data-testid="actuated-repair-slot"
                        onClick={doRepairSlot}
                      >
                        Repair (rank {itemAct.minRank} slot)
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="actuated-hint" data-testid="actuated-repair-locked">
                    Can’t be repaired until your next daily preparations.
                  </p>
                )}
              </div>
            ) : itemAct.activation.canActivate ? (
              freeActuated ? (
                <div className="actuated-controls">
                  <button
                    type="button"
                    className="btn-small btn-primary"
                    data-testid={runeCastSpell ? 'actuated-cast-spell' : 'actuated-activate-free'}
                    onClick={() => doActuate()}
                  >
                    {runeCastSpell ? `Cast ${runeSpellDoc.name}` : 'Activate'}
                  </button>
                </div>
              ) : (
              <div className="actuated-controls">
                <span className="actuated-label">Activate — spend a slot:</span>
                <div className="actuated-ranks">
                  {itemAct.slotOptions.map((o) => (
                    <button
                      key={o.rank}
                      type="button"
                      className="btn-small btn-primary"
                      data-testid={`actuated-activate-rank-${o.rank}`}
                      onClick={() => doActuate(o.rank)}
                    >
                      Rank {o.rank} ({o.remaining})
                    </button>
                  ))}
                </div>
              </div>
              )
            ) : itemAct.overload.canOverload ? (
              <div className="actuated-controls">
                <p className="actuated-hint">
                  Daily use spent. Overload for another use — DC 10 flat check; the item breaks either way.
                </p>
                <div className="actuated-ranks">
                  {itemAct.slotOptions.map((o) => (
                    <button
                      key={o.rank}
                      type="button"
                      className="btn-small btn-danger"
                      data-testid={`actuated-overload-rank-${o.rank}`}
                      onClick={() => doOverload(o.rank)}
                    >
                      Overload (rank {o.rank})
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="actuated-hint" data-testid="actuated-unavailable">
                {!itemAct.gate.available
                  ? freeActuated
                    ? `Used — ${actuated.frequency || 'once per day'}; the clock frees it up.`
                    : 'Daily use spent — no spell slot left to Overload.'
                  : itemAct.activation.disabledReason || 'Unavailable.'}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Rune-granted spell cast (#1055 S3): the fixed-rank/DC spell resolved
          from the actuated block, cast through the shared flow. It records the
          once/day use itself (shared frequency key), so the actuated card
          reflects it as spent on close. */}
      {runeCastSpell && (
        <CastSpellModal
          isOpen={castingRune}
          onClose={() => setCastingRune(false)}
          spell={runeCastSpell}
          castSource="innate"
          character={character}
          themeColor={themeColor}
        />
      )}

      {/* A shield property rune's spell cast (#1196 G3) — opened when a spell-
          casting rune activation fires (Gusting, Darkness, Environmental…). */}
      {shieldRuneCast && (
        <CastSpellModal
          isOpen={!!shieldRuneCast}
          onClose={() => setShieldRuneCast(null)}
          spell={shieldRuneCast}
          castSource="innate"
          character={character}
          themeColor={themeColor}
        />
      )}

      {/* Strikes */}
      {item.strikes && (
        <div className="item-strikes">
          <h3>Strikes</h3>
          <div className="strike-details">
            <div className="strike-detail">
              <span className="strike-detail-label">Attack Bonus</span>
              <span className="strike-detail-value">
                {Array.isArray(item.strikes)
                  ? strikeBonus(item.strikes[0], 0)
                  : strikeBonus(item.strikes, 0)}
              </span>
            </div>
            <div className="strike-detail">
              <span className="strike-detail-label">Type</span>
              <span className="strike-detail-value">
                {Array.isArray(item.strikes)
                  ? item.strikes[0].type || "Melee"
                  : item.strikes.type || "Melee"}
              </span>
            </div>
            <div className="strike-detail">
              <span className="strike-detail-label">Damage</span>
              <span className="strike-detail-value">
                {Array.isArray(item.strikes)
                  ? strikeDamage(item.strikes[0], 0)
                  : strikeDamage(item.strikes, 0)}
              </span>
            </div>
            {Array.isArray(item.strikes) && item.strikes.length > 1 && (
              <div className="strike-detail full-width">
                <span className="strike-detail-label">Additional Strikes</span>
                <div className="additional-strikes">
                  {item.strikes.slice(1).map((strike, index) => (
                    <div key={index} className="additional-strike">
                      <span className="strike-name">{strike.name}: </span>
                      <span className="strike-damage">{strikeDamage(strike, index + 1)} {strike.type}</span>
                      {strike.range && (
                        <span className="strike-range"> (Range: {strike.range})</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {((Array.isArray(item.strikes) && item.strikes[0].traits) ||
              (!Array.isArray(item.strikes) && item.strikes.traits)) && (
              <div className="strike-traits full-width">
                {(Array.isArray(item.strikes) ?
                  item.strikes[0].traits : item.strikes.traits).map((trait, i) => (
                  <TraitTag key={i} trait={trait} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scroll */}
      {item.scroll && (
        <div className="item-scroll">
          <h3>Scroll Spell</h3>
          <div className="scroll-details">
            <div className="scroll-header">
              <span className="scroll-name">{item.scroll.name}</span>
              {item.scroll.actions && <ActionSymbol cost={item.scroll.actions} />}
              <span className="scroll-level">Rank {castRank(item.scroll, item.scroll) ?? item.scroll.level}</span>
            </div>
            {item.scroll.traits && item.scroll.traits.length > 0 && (
              <div className="scroll-traits">
                {item.scroll.traits.map((trait, i) => (
                  <TraitTag key={i} trait={trait} />
                ))}
              </div>
            )}
            <div className="scroll-description">
              {item.scroll.description}
            </div>
          </div>
        </div>
      )}

      {/* Wand */}
      {item.wand && (
        <div className="item-wand">
          <h3>Wand Spell</h3>
          <div className="wand-details">
            <div className="wand-header">
              <span className="wand-name">{item.wand.name}</span>
              {item.wand.actions && <ActionSymbol cost={item.wand.actions} />}
              <span className="wand-level">Rank {castRank(item.wand, item.wand) ?? item.wand.level}</span>
            </div>
            {item.wand.traits && item.wand.traits.length > 0 && (
              <div className="wand-traits">
                {item.wand.traits.map((trait, i) => (
                  <TraitTag key={i} trait={trait} />
                ))}
              </div>
            )}
            <div className="wand-description">
              {item.wand.description}
            </div>
          </div>
        </div>
      )}

      {/* Give to another PC (#656/#657) — exploration/downtime only */}
      {givable && recipients.length > 0 && (
        <div className="item-give" data-testid="item-give">
          <h3>Give to</h3>
          {isGivableConsumable && remainingQty > 1 && (
            <div className="item-give-qty">
              <label htmlFor="give-qty">Quantity</label>
              <input
                id="give-qty"
                type="number"
                min="1"
                max={remainingQty}
                value={giveQty}
                onChange={(e) => setGiveCount(Number(e.target.value) || 1)}
                aria-label="Quantity to give"
              />
              <span className="item-give-qty-of">of {remainingQty}</span>
            </div>
          )}
          <div className="item-give-recipients">
            {recipients.map((r) => (
              <button
                key={r.id}
                type="button"
                className="btn-small btn-secondary"
                data-testid={`give-item-${r.id}`}
                onClick={() => doGive(r)}
              >
                {r.name}
              </button>
            ))}
          </div>
        </div>
      )}

      </div>{/* /.loot-scroll */}

      {/* Loadout actions — state-appropriate (drop / stow / retrieve / …),
          pinned to the card footer outside the scroll region */}
      {(useButton || actions) && (
        <div className="item-modal-actions">{useButton}{actions}</div>
      )}
    </Modal>
  );
};

export default ItemModal;
