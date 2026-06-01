import React from 'react';
import { useLore } from '../../contexts/LoreContext';
import './LoreDiscoveryPanel.css';

const LoreDiscoveryPanel = ({ entry, connectionData, onEntrySelect, onClose }) => {
  const { openLore } = useLore();

  if (!entry) return null;

  const { outgoingByCategory = {}, incomingByCategory = {} } = connectionData || {};
  const outgoingCategories = Object.keys(outgoingByCategory).sort();
  const incomingCategories = Object.keys(incomingByCategory).sort();
  const hasConnections = outgoingCategories.length > 0 || incomingCategories.length > 0;

  return (
    <div className="lore-discovery-panel">
      <div className="discovery-panel-header">
        <div className="discovery-panel-title-area">
          <h3 className="discovery-panel-title">{entry.title}</h3>
          <span className="discovery-panel-category">{entry.category}</span>
        </div>
        <button className="discovery-close-btn" onClick={onClose} aria-label="Close panel">
          ✕
        </button>
      </div>

      {entry.summary && (
        <p className="discovery-summary">{entry.summary}</p>
      )}

      {(entry.tags || []).length > 0 && (
        <div className="discovery-tags">
          {entry.tags.map(tag => (
            <span key={tag} className="discovery-tag">{tag}</span>
          ))}
        </div>
      )}

      <button className="discovery-full-link" onClick={() => openLore(entry.id)}>
        Open full entry →
      </button>

      {hasConnections ? (
        <>
          {outgoingCategories.length > 0 && (
            <div className="discovery-section">
              <p className="discovery-section-label">Connections</p>
              {outgoingCategories.map(category => (
                <div key={category} className="discovery-category-group">
                  <p className="discovery-category-name">{category}</p>
                  <div className="discovery-entry-list">
                    {outgoingByCategory[category].map(related => (
                      <button
                        key={related.id}
                        className="discovery-entry-btn"
                        onClick={() => onEntrySelect(related.id)}
                      >
                        {related.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {incomingCategories.length > 0 && (
            <div className="discovery-section">
              <p className="discovery-section-label">Referenced By</p>
              {incomingCategories.map(category => (
                <div key={category} className="discovery-category-group">
                  <p className="discovery-category-name">{category}</p>
                  <div className="discovery-entry-list">
                    {incomingByCategory[category].map(related => (
                      <button
                        key={related.id}
                        className="discovery-entry-btn"
                        onClick={() => onEntrySelect(related.id)}
                      >
                        {related.title}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <p className="discovery-empty">No connections recorded for this entry.</p>
      )}
    </div>
  );
};

export default LoreDiscoveryPanel;
