import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLore } from '../../contexts/LoreContext';
import { useContent } from '../../contexts/ContentContext';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { useGmAuth } from '../../hooks/useGmAuth';
import { buildBacklinkMap, getConnectionData } from '../../utils/loreUtils';
import { monstersAtLocation, monsterToEnemy } from '../../utils/bestiary';
import { rkKeyFor } from '../../utils/recallKnowledge';
import LoreMarkdown from './LoreMarkdown';
import './LoreDrawer.css';

const LoreDrawer = () => {
  const { isOpen, currentEntryId, closeLore, navigateTo, goBack, canGoBack } = useLore();
  const { loreEntries: visibleEntries, allLoreEntries, monsters } = useContent();
  const { recordFor } = useRecallKnowledge();
  const { isGm } = useGmAuth();
  const navigate = useNavigate();
  // On GM pages (Access-gated at the edge) the drawer resolves unrevealed
  // entries too — e.g. the marquee's location link. Player routes only ever
  // see revealed lore; an unrevealed id falls through to "Entry not found".
  const { pathname } = useLocation();
  const loreEntries = pathname.startsWith('/gm') ? allLoreEntries : visibleEntries;

  const backlinkMap = useMemo(() => buildBacklinkMap(loreEntries), [loreEntries]);

  const entry = useMemo(
    () => currentEntryId ? loreEntries.find(e => e.id === currentEntryId) : null,
    [currentEntryId, loreEntries]
  );

  const connectionData = useMemo(
    () => entry ? getConnectionData(entry, loreEntries, backlinkMap) : null,
    [entry, loreEntries, backlinkMap]
  );

  // Creatures the party has fought at this location (#334) — derived from the
  // captured monster docs' `locations` map, gated to the party's learned state.
  const monstersHere = useMemo(() => {
    if (!entry) return [];
    return monstersAtLocation(monsters, entry.id).map((doc) => {
      const enemy = monsterToEnemy(doc);
      const visible = isGm || !!recordFor(rkKeyFor(enemy)).identity;
      return { doc, visible };
    });
  }, [entry, monsters, isGm, recordFor]);

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
              <img src={`/api/images/${entry.image}`} alt="" className="entity-image" style={entry.imagePosition ? { objectPosition: `${entry.imagePosition.x}% ${entry.imagePosition.y}%` } : undefined} />
            )}

            <div className="lore-drawer-content">
              <LoreMarkdown
                content={entry.content || entry.summary || ''}
                entries={loreEntries}
                onNavigate={navigateTo}
              />
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

            {monstersHere.length > 0 && (
              <div className="lore-drawer-connections">
                <div className="lore-drawer-section">
                  <p className="lore-drawer-section-label">Monsters encountered here</p>
                  <div className="lore-drawer-conn-list">
                    {monstersHere.map(({ doc, visible }) => (
                      <button
                        key={doc.id}
                        className="lore-drawer-conn-btn"
                        onClick={() => { closeLore(); navigate(`/bestiary/${encodeURIComponent(doc.id)}`); }}
                      >
                        {visible ? doc.name : 'Unknown creature'}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
};

export default LoreDrawer;
