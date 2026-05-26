import React, { useMemo } from 'react';
import { useLore } from '../../contexts/LoreContext';
import { useContent } from '../../contexts/ContentContext';
import { buildBacklinkMap, getConnectionData } from '../../utils/loreUtils';
import './LoreDrawer.css';

const LoreDrawer = () => {
  const { isOpen, currentEntryId, closeLore, navigateTo, goBack, canGoBack } = useLore();
  const { loreEntries } = useContent();

  const backlinkMap = useMemo(() => buildBacklinkMap(loreEntries), [loreEntries]);

  const entry = useMemo(
    () => currentEntryId ? loreEntries.find(e => e.id === currentEntryId) : null,
    [currentEntryId, loreEntries]
  );

  const connectionData = useMemo(
    () => entry ? getConnectionData(entry, loreEntries, backlinkMap) : null,
    [entry, loreEntries, backlinkMap]
  );

  if (!isOpen) return null;

  const { outgoingByCategory = {}, incomingByCategory = {} } = connectionData || {};
  const outgoingCategories = Object.keys(outgoingByCategory).sort();
  const incomingCategories = Object.keys(incomingByCategory).sort();
  const hasConnections = outgoingCategories.length > 0 || incomingCategories.length > 0;

  return (
    <>
      <div className="lore-drawer-backdrop" onClick={closeLore} />
      <div className={`lore-drawer ${isOpen ? 'open' : ''}`} role="dialog" aria-modal="true">
        <div className="lore-drawer-header">
          <div className="lore-drawer-nav">
            {canGoBack && (
              <button className="lore-drawer-back" onClick={goBack} aria-label="Go back">
                ← Back
              </button>
            )}
          </div>
          <button className="lore-drawer-close" onClick={closeLore} aria-label="Close">
            ✕
          </button>
        </div>

        {!entry ? (
          <div className="lore-drawer-not-found">Entry not found.</div>
        ) : (
          <div className="lore-drawer-body">
            <div className="lore-drawer-title-area">
              <h2 className="lore-drawer-title">{entry.title}</h2>
              <span className="lore-drawer-category">{entry.category}</span>
            </div>

            {entry.image && (
              <img src={`/api/images/${entry.image}`} alt="" className="entity-image" />
            )}

            {(entry.tags || []).length > 0 && (
              <div className="lore-drawer-tags">
                {entry.tags.map(tag => (
                  <span key={tag} className="lore-drawer-tag">{tag}</span>
                ))}
              </div>
            )}

            <div className="lore-drawer-content">
              {(entry.content || entry.summary || '').split('\n').filter(Boolean).map((para, i) => (
                <p key={i}>{para}</p>
              ))}
            </div>

            {hasConnections && (
              <div className="lore-drawer-connections">
                {outgoingCategories.length > 0 && (
                  <div className="lore-drawer-section">
                    <p className="lore-drawer-section-label">Connections</p>
                    {outgoingCategories.map(cat => (
                      <div key={cat} className="lore-drawer-conn-group">
                        <p className="lore-drawer-conn-category">{cat}</p>
                        <div className="lore-drawer-conn-list">
                          {outgoingByCategory[cat].map(related => (
                            <button
                              key={related.id}
                              className="lore-drawer-conn-btn"
                              onClick={() => navigateTo(related.id)}
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
                  <div className="lore-drawer-section">
                    <p className="lore-drawer-section-label">Referenced By</p>
                    {incomingCategories.map(cat => (
                      <div key={cat} className="lore-drawer-conn-group">
                        <p className="lore-drawer-conn-category">{cat}</p>
                        <div className="lore-drawer-conn-list">
                          {incomingByCategory[cat].map(related => (
                            <button
                              key={related.id}
                              className="lore-drawer-conn-btn"
                              onClick={() => navigateTo(related.id)}
                            >
                              {related.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default LoreDrawer;
