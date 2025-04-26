// src/components/character-sheet/ItemModal.js
import React from 'react';
import './ItemModal.css';

const ItemModal = ({ isOpen, onClose, item, characterColor }) => {
  if (!isOpen || !item) return null;
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';

  return (
    <div className="item-modal-overlay" onClick={onClose}>
      <div className="item-modal" onClick={(e) => e.stopPropagation()}>
        <div className="item-modal-header" style={{ backgroundColor: themeColor }}>
          <h2>{item.name}</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="item-modal-content">
          <div className="item-detail-grid">
            <div className="item-detail">
              <span className="item-detail-label">Quantity</span>
              <span className="item-detail-value">{item.quantity}</span>
            </div>
            
            <div className="item-detail">
              <span className="item-detail-label">Bulk</span>
              <span className="item-detail-value">
                {formatBulk(poundsToBulk(item.weight))}
                {item.quantity > 1 && poundsToBulk(item.weight) > 0 && 
                  ` (total: ${formatBulk(poundsToBulk(item.weight) * item.quantity)})`}
              </span>
            </div>
          </div>
          
          {item.description && (
            <div className="item-description">
              <h3>Description</h3>
              <p>{item.description}</p>
            </div>
          )}
          
          {/* Display actions if the item has them */}
          {item.actions && item.actions.length > 0 && (
            <div className="item-actions">
              <h3>Actions</h3>
              <div className="item-actions-list">
                {item.actions.map((action, index) => (
                  <div key={index} className="item-action">
                    <div className="action-header">
                      <span className="action-name">{action.name}</span>
                      <div className="action-count">
                        {Array(action.actionCount || 1).fill().map((_, i) => (
                          <span key={i} className="action-icon" style={{ color: themeColor }}>●</span>
                        ))}
                      </div>
                    </div>
                    {action.traits && (
                      <div className="action-traits">
                        {action.traits.map((trait, i) => (
                          <span key={i} className="trait-tag">{trait}</span>
                        ))}
                      </div>
                    )}
                    <p className="action-description">{action.description}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Display reactions if the item has them */}
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
                    {reaction.traits && (
                      <div className="reaction-traits">
                        {reaction.traits.map((trait, i) => (
                          <span key={i} className="trait-tag">{trait}</span>
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
          
          {/* Display strikes if the item has them */}
          {item.strikes && (
            <div className="item-strikes">
              <h3>Strikes</h3>
              <div className="strike-details">
                <div className="strike-detail">
                  <span className="strike-detail-label">Type</span>
                  <span className="strike-detail-value">{item.strikes.type || "Melee"}</span>
                </div>
                <div className="strike-detail">
                  <span className="strike-detail-label">Damage</span>
                  <span className="strike-detail-value">{item.strikes.damage || "-"}</span>
                </div>
                {item.strikes.traits && (
                  <div className="strike-traits">
                    {item.strikes.traits.map((trait, i) => (
                      <span key={i} className="trait-tag">{trait}</span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// Helper functions for bulk formatting
const poundsToBulk = (pounds) => {
  if (!pounds || pounds < 0.1) return 0; // Negligible Bulk
  if (pounds < 1) return 0.1; // Light (L) Bulk
  return Math.ceil(pounds / 10); // 1 Bulk is roughly 10 pounds
};

const formatBulk = (bulk) => {
  if (bulk === 0) return '—'; // Negligible
  if (bulk < 1) return 'L'; // Light Bulk
  return bulk.toString(); // Regular Bulk
};

export default ItemModal;