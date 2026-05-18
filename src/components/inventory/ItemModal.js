// src/components/inventory/ItemModal.js
import React from 'react';
import Modal from '../shared/Modal';
import TraitTag from '../shared/TraitTag';
import { formatBulk } from '../../utils/InventoryUtils';
import { ITEM_STATE_LABEL } from '../../utils/itemState';
import './ItemModal.css';

const ItemModal = ({ isOpen, onClose, item, characterColor }) => {
  if (!isOpen || !item) return null;

  const themeColor = characterColor || 'var(--color-primary)';

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={item.name} themeColor={themeColor} maxWidth="500px" highZ>
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
      {item.shield && (
        <div className="shield-properties">
          <h3 style={{ color: themeColor }}>Shield Properties</h3>
          <div className="item-detail-grid">
            {item.shield.bonus && (
              <div className="item-detail">
                <span className="item-detail-label">AC Bonus</span>
                <span className="item-detail-value">+{item.shield.bonus}</span>
              </div>
            )}
            {item.shield.hardness !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">Hardness</span>
                <span className="item-detail-value">{item.shield.hardness}</span>
              </div>
            )}
            {item.shield.hp !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">Hit Points</span>
                <span className="item-detail-value">{item.shield.hp}</span>
              </div>
            )}
            {item.shield.broken_threshold !== undefined && (
              <div className="item-detail">
                <span className="item-detail-label">Broken Threshold</span>
                <span className="item-detail-value">{item.shield.broken_threshold}</span>
              </div>
            )}
          </div>
          <div className="shield-info">
            <strong>Shield Rules:</strong> Raise this shield for +{item.shield.bonus || 0} AC.
            It has {item.shield.hardness || 0} Hardness and {item.shield.hp || 0} HP.
          </div>
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
                      <span key={i} className="action-icon" style={{ color: themeColor }}>⚬</span>
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
                  <div className="reaction-icon" style={{ color: themeColor }}>⟳</div>
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
                    <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
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
                  <div className="free-action-icon" style={{ color: themeColor }}>◆</div>
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
                    <span className="trigger-label" style={{ color: themeColor }}>Trigger</span>
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
    </Modal>
  );
};

export default ItemModal;
