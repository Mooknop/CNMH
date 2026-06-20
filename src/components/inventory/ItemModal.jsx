// src/components/inventory/ItemModal.js
import React from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import { formatBulk, normalizeShield, isContainer, flattenInventory } from '../../utils/InventoryUtils';
import { ITEM_STATE_LABEL, isHeldState } from '../../utils/itemState';
import { consumableMeta, consumableVerb } from '../../utils/consumables';
import { itemEffectsFor, removeItemEffect, itemEffectsKey } from '../../utils/itemEffects';
import {
  isTalisman, affixTargetType, validAffixHosts, affixedHostUid,
  affix, unaffix, affixedKey, itemUidOf, deactivateTalisman,
} from '../../utils/affix';
import { activationOf, activationSummary } from '../../utils/talismanActivation';
import { useCharacter } from '../../hooks/useCharacter';
import { useLoadout } from '../../hooks/useLoadout';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import './ItemModal.css';

const ItemModal = ({ isOpen, onClose, item, character, characterColor, onUse }) => {
  // Hooks must run unconditionally (before the early return).
  const charData = useCharacter(character);
  const { drop, pickUp, stow, unhand, retrieve, moveToContainer } = useLoadout(character?.id);
  // Item-target effects (oils, #339) — read live so removal stays in sync.
  const [itemEffects, setItemEffects] = useSyncedState(itemEffectsKey(character?.id), []);
  // Affixed-talisman overlay (#254/#339) + consumed overlay for activation.
  const [affixed, setAffixed] = useSyncedState(affixedKey(character?.id), {});
  const [, setConsumed] = useSyncedState(`cnmh_consumed_${character?.id}`, {});
  const { appendEvent } = useSessionLog();

  if (!isOpen || !item) return null;

  const activeItemEffects = itemEffectsFor(itemEffects, item);

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
  const doUnaffix = () => {
    setAffixed((cur) => unaffix(cur, itemUidOf(item)));
    appendEvent({ type: 'action', text: `${character?.name || 'Someone'} removed ${item.name} from ${affixedTo?.name || 'its item'}` });
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

  const themeColor = characterColor || 'var(--color-primary)';
  // Normalize so legacy { health, breakThreshold } and canonical
  // { hp, brokenThreshold } shields both display correctly.
  const shield = normalizeShield(item.shield);

  // ── Loadout actions, scoped to the item's current ownership state ──
  const uid = item.uid;
  const containers = (charData?.inventory || []).filter(isContainer);
  const parent = containers.find((c) =>
    (c.container?.contents || []).some((ci) => ci.uid === uid)
  );
  const isContainerItem = isContainer(item);
  const stowTargets = containers.filter((c) => c.uid !== uid);
  const moveTargets = containers.filter((c) => c.uid !== uid && c.uid !== parent?.uid);

  // Run a loadout mutation then close so the refreshed list is visible.
  const act = (fn) => { fn(); onClose(); };

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
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} themeColor={themeColor} maxWidth="500px" highZ>
      {item.image && (
        <img src={`/api/images/${item.image}`} alt="" className="entity-image" style={item.imagePosition ? { objectPosition: `${item.imagePosition.x}% ${item.imagePosition.y}%` } : undefined} />
      )}
      {/* Display traits if they exist */}
      {item.traits && item.traits.length > 0 && (
        <div className="item-traits">
          {item.traits.map((trait, i) => (
            <TraitTag key={i} trait={trait} />
          ))}
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

        {item.state && (
          <div className="item-detail">
            <span className="item-detail-label">State</span>
            <span className="item-detail-value">
              {ITEM_STATE_LABEL[item.state] || ITEM_STATE_LABEL.worn}
            </span>
          </div>
        )}

        {item.price && (
          <div className="item-detail">
            <span className="item-detail-label">Price</span>
            <span className="item-detail-value">{item.price} gp</span>
          </div>
        )}
      </div>

      {/* Shield properties */}
      {shield && (
        <div className="shield-properties">
          <h3>Shield Properties</h3>
          <div className="item-detail-grid">
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

      {/* Description */}
      {item.description && (
        <div className="item-description">
          <h3>Description</h3>
          <p>{item.description}</p>
        </div>
      )}

      {/* Actions */}
      {item.actions && item.actions.length > 0 && (
        <div className="item-actions">
          <h3>Actions</h3>
          <div className="item-actions-list">
            {item.actions.map((action, index) => (
              <div key={index} className="item-action">
                <div className="action-header">
                  <span className="action-name">{action.name}</span>
                  <div className="action-count">
                    {action.actionCount && Array.from({ length: action.actionCount }, (_, i) => (
                      <span key={i} className="action-icon">⚬</span>
                    ))}
                  </div>
                </div>
                {action.traits && action.traits.length > 0 && (
                  <div className="action-traits">
                    {action.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                <p className="action-description">{action.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Reactions */}
      {item.reactions && item.reactions.length > 0 && (
        <div className="item-reactions">
          <h3>Reactions</h3>
          <div className="item-reactions-list">
            {item.reactions.map((reaction, index) => (
              <div key={index} className="item-reaction">
                <div className="reaction-header">
                  <span className="reaction-name">{reaction.name}</span>
                  <div className="reaction-icon">⟳</div>
                </div>
                {reaction.traits && reaction.traits.length > 0 && (
                  <div className="reaction-traits">
                    {reaction.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                {reaction.trigger && (
                  <div className="reaction-trigger">
                    <span className="trigger-label">Trigger</span>
                    <span className="trigger-text">{reaction.trigger}</span>
                  </div>
                )}
                <p className="reaction-description">{reaction.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Free Actions */}
      {item.freeActions && item.freeActions.length > 0 && (
        <div className="item-free-actions">
          <h3>Free Actions</h3>
          <div className="item-free-actions-list">
            {item.freeActions.map((freeAction, index) => (
              <div key={index} className="item-free-action">
                <div className="free-action-header">
                  <span className="free-action-name">{freeAction.name}</span>
                  <div className="free-action-icon">◆</div>
                </div>
                {freeAction.traits && freeAction.traits.length > 0 && (
                  <div className="free-action-traits">
                    {freeAction.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                {freeAction.trigger && (
                  <div className="free-action-trigger">
                    <span className="trigger-label">Trigger</span>
                    <span className="trigger-text">{freeAction.trigger}</span>
                  </div>
                )}
                <p className="free-action-description">{freeAction.description}</p>
              </div>
            ))}
          </div>
        </div>
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
                  ? item.strikes[0].bonus || "-"
                  : item.strikes.bonus || "-"}
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
                  ? item.strikes[0].damage || "-"
                  : item.strikes.damage || "-"}
              </span>
            </div>
            {Array.isArray(item.strikes) && item.strikes.length > 1 && (
              <div className="strike-detail full-width">
                <span className="strike-detail-label">Additional Strikes</span>
                <div className="additional-strikes">
                  {item.strikes.slice(1).map((strike, index) => (
                    <div key={index} className="additional-strike">
                      <span className="strike-name">{strike.name}: </span>
                      <span className="strike-damage">{strike.damage} {strike.type}</span>
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
              <span className="scroll-level">Level {item.scroll.level}</span>
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
              <span className="wand-level">Level {item.wand.level}</span>
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

      {/* Loadout actions — state-appropriate (drop / stow / retrieve / …) */}
      {(useButton || actions) && (
        <div className="item-modal-actions">{useButton}{actions}</div>
      )}
    </Modal>
  );
};

export default ItemModal;
