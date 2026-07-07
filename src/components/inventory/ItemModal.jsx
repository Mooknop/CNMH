// src/components/inventory/ItemModal.js
import React, { useState } from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import ActionSymbol from '../shared/ActionSymbol';
import ItemActivations from '../shared/ItemActivations';
import RuneMechanics from '../shared/RuneMechanics';
import CastSpellModal from '../encounter/CastSpellModal';
import ShieldRuneActivations from './ShieldRuneActivations';
import { formatBulk, normalizeShield, isContainer, flattenInventory, isArmor } from '../../utils/InventoryUtils';
import { armorDisplayName } from '../../utils/armorRunes';
import { ITEM_STATE_LABEL, isHeldState, STOWED } from '../../utils/itemState';
import { consumableMeta, consumableVerb } from '../../utils/consumables';
import { itemEffectsFor, removeItemEffect, itemEffectsKey } from '../../utils/itemEffects';
import {
  isTalisman, affixTargetType, validAffixHosts, affixedHostUid,
  affix, unaffix, affixedKey, itemUidOf, deactivateTalisman, affixedTalismansByHost,
} from '../../utils/affix';
import { activationOf, activationSummary } from '../../utils/talismanActivation';
import { itemModesOf, activeItemMode } from '../../utils/itemModes';
import { weaponDisplayName, runeTierSummary, weaponPropertyRunes } from '../../utils/weaponRunes';
import { shieldDisplayName, resolveShieldBlock, shieldRuneTierSummary, hasReinforcing, shieldEffectiveTraits, shieldPropertyRunes } from '../../utils/shieldRunes';
import {
  attachedKey, isShieldAttachment, validAttachHosts, attachedHostUid,
  attach, unattach, attachmentsByHost,
} from '../../utils/shieldAttach';
import { hasAccessoryRune, resolveAccessoryItem, accessoryDisplayName, withAccessoryActivations } from '../../utils/accessoryRunes';
import { actuatedCastsSpell, buildRuneCastSpell } from '../../utils/runeSpellCast';
import { spellItemDisplayName, castRank } from '../../utils/spellItems';
import { resolveItemStrikes } from '../../utils/strikeUtils';
import { itemTint, itemCharges, itemCode, isGlowy, itemRarity } from '../../utils/inventoryTile';
import { formatModifier } from '../../utils/CharacterUtils';
import { useCharacter } from '../../hooks/useCharacter';
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
  const [, setConsumed] = useSyncedState(`cnmh_consumed_${character?.id}`, {});
  // Etch-time accessory-rune config (#1055 S4) — the depicted dragon type for a
  // Dragon's Breath rune, chosen on the inscribed item and read by useCharacter
  // when it derives the rune's Widen Spellshape free action.
  const [runeConfig, setRuneConfig] = useSyncedState(`cnmh_runeconfig_${character?.id}`, {});
  // Item-mode toggle (#1093) — the player-facing switch between an item's
  // authored states (Gloom Blade's light, a hood up/down). This modal is the
  // sole writer; useCharacter applies the choice to the effective inventory.
  const [itemModeState, setItemModeState] = useSyncedState(`cnmh_itemmode_${character?.id}`, {});
  // Active-effects store (#1055 S5) — an actuated block may apply a lasting
  // self-effect on activation (Trackless (Greater)'s 8-hour emanation). Written
  // here on activate; EffectsPanel renders it with a Dismiss ×.
  const [, setEffects] = useSyncedState(`cnmh_effects_${character?.id}`, []);
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

  if (!isOpen || !item) return null;

  const activeItemEffects = itemEffectsFor(itemEffects, item);

  // Strike resolution (#691): the catalog strike has no stored attack bonus —
  // it's derived from the wielder's stats (ability/proficiency, runes/potency,
  // and special rules like the Flawless Hammer's spell-attack). Resolve per-item
  // so the modal can show the real bonus/damage; fall back to any explicitly
  // authored values (used by tests/synthetic items) or "-".
  const resolvedStrikes = resolveItemStrikes(item, charData);
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
  const runeCastSpell = runeSpellDoc
    ? buildRuneCastSpell(actuated, runeSpellDoc, itemUidOf(item))
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
  const onShieldRuneActivate = (rune, spellDoc) => {
    const cast = spellDoc
      ? buildRuneCastSpell(rune.actuated, spellDoc, `${itemUidOf(item)}:${rune.id}`)
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
  const category =
    isContainerItem ? 'Container'
    : item.strikes ? 'Weapon'
    : item.shield ? 'Shield'
    : item.staff ? 'Staff'
    : item.wand ? 'Wand'
    : item.scroll ? 'Scroll'
    : item.runestone ? 'Runestone'
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

  // Attunement is slot-driven (drag into the Attuned area); the modal only
  // reflects the status as a chip.
  const invested = isInvested(uid);

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
    !hostsAffixedTalisman;
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
  const useButton = onUse && consumableMeta(item) && (item.quantity ?? 1) > 0 ? (
    <button className="btn-small btn-primary" data-testid="item-action-use" onClick={() => act(() => onUse(item))}>
      {consumableVerb(item)}
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

      {/* ── hero art: full-panel tile (real art or itemCode placeholder) ── */}
      <div className="loot-art">
        <span className={`loot-tile tint-${tint}${isGlowy(item) ? ' is-glow' : ''}`}>
          {item.image
            ? <img src={`/api/images/${item.image}`} alt="" style={item.imagePosition ? { objectPosition: `${item.imagePosition.x}% ${item.imagePosition.y}%` } : undefined} />
            : <span className="loot-code">{code}</span>}
        </span>
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

      {/* Shield properties */}
      {shield && (
        <div className="shield-properties">
          <h3>Shield Properties</h3>
          {hasReinforcing(item) && (
            <p className="shield-rune-tier" data-testid="shield-rune-tier">
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
            <p className="item-rune-tier">{runeTierSummary(item.runes)}</p>
          )}
          {weaponPropertyRunes(item).map((rune) => (
            <div key={rune.id} className="item-rune">
              <span className="item-rune-name">{rune.name}</span>
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
            <span className="item-rune-name">{accessory.rune.name}</span>
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
                <span className="item-rune-name">{item.runestone.rune.name}</span>
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
