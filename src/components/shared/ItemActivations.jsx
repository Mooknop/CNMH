import React from 'react';
import TraitTag from './TraitTag';
import ActionSymbol from './ActionSymbol';

// Shared, display-only render of an item's activations — Actions, Reactions and
// Free Actions — used by both the inventory ItemModal and the shop item preview
// (#882) so the two views stay in sync. The caller themes the
// `.item-action`/`.item-reaction`/`.item-free-action` cards within its own scope
// (`.loot-scroll` for the modal, `.ps-preview` for the shop).
const ItemActivations = ({ item }) => {
  const actions = item && Array.isArray(item.actions) ? item.actions : [];
  const reactions = item && Array.isArray(item.reactions) ? item.reactions : [];
  const freeActions = item && Array.isArray(item.freeActions) ? item.freeActions : [];
  if (!actions.length && !reactions.length && !freeActions.length) return null;

  return (
    <>
      {actions.length > 0 && (
        <div className="item-actions">
          <h3>Actions</h3>
          <div className="item-actions-list">
            {actions.map((action, index) => (
              <div key={index} className="item-action">
                <div className="action-header">
                  <span className="action-name">{action.name}</span>
                  <div className="action-count">
                    {action.actionCount && <ActionSymbol cost={action.actionCount} />}
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

      {reactions.length > 0 && (
        <div className="item-reactions">
          <h3>Reactions</h3>
          <div className="item-reactions-list">
            {reactions.map((reaction, index) => (
              <div key={index} className="item-reaction">
                <div className="reaction-header">
                  <span className="reaction-name">{reaction.name}</span>
                  <div className="reaction-icon"><ActionSymbol cost="reaction" /></div>
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

      {freeActions.length > 0 && (
        <div className="item-free-actions">
          <h3>Free Actions</h3>
          <div className="item-free-actions-list">
            {freeActions.map((freeAction, index) => (
              <div key={index} className="item-free-action">
                <div className="free-action-header">
                  <span className="free-action-name">{freeAction.name}</span>
                  <div className="free-action-icon"><ActionSymbol cost="free" /></div>
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
    </>
  );
};

export default ItemActivations;
