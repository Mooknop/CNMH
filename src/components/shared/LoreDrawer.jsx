import React, { useContext, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLore } from '../../contexts/LoreContext';
import { useContent } from '../../contexts/ContentContext';
import { CharacterContext } from '../../contexts/CharacterContext';
import { useRecallKnowledge } from '../../hooks/useRecallKnowledge';
import { useGmAuth } from '../../hooks/useGmAuth';
import { useShops } from '../../hooks/useShops';
import { useLocationSupport } from '../../hooks/useLocationSupport';
import { useSyncedState } from '../../hooks/useSyncedState';
import { employerById, employerSkillSummary } from '../../data/earnIncomeEmployers';
import { trainingVendorById, trainingSummary } from '../../data/trainingVendors';
import { buildBacklinkMap, getConnectionData, buildChildrenMap, getAncestors, getChildren } from '../../utils/loreUtils';
import { getShopsForLocation } from '../../utils/shopUtils';
import { monstersAtLocation, monsterToEnemy } from '../../utils/bestiary';
import { rkKeyFor } from '../../utils/recallKnowledge';
import LoreMarkdown from './LoreMarkdown';
import ShopStorefront from '../shop/ShopStorefront';
import './LoreDrawer.css';
import { APP, globalKey } from '../../sync/keys';

const LoreDrawer = () => {
  const { isOpen, currentEntryId, closeLore, navigateTo, goBack, canGoBack } = useLore();
  const { loreEntries: visibleEntries, allLoreEntries, monsters, items, runes, spells } = useContent();
  const { recordFor } = useRecallKnowledge();
  const { isGm } = useGmAuth();
  const { shops } = useShops();
  const { supported } = useLocationSupport();
  const [campaign] = useSyncedState(globalKey(APP.CAMPAIGN), { locationLoreId: '' });
  const { activeCharacter } = useContext(CharacterContext) || {};
  const [shopOpen, setShopOpen] = useState(false);
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

  // Containment hierarchy: ancestors (breadcrumb) + direct children ("Contains").
  // `loreEntries` is already the visibility-gated list on player routes, so
  // unrevealed ancestors/children simply don't appear.
  const childrenMap = useMemo(() => buildChildrenMap(loreEntries), [loreEntries]);
  const ancestors = useMemo(() => getAncestors(entry, loreEntries), [entry, loreEntries]);
  const children = useMemo(() => getChildren(entry, childrenMap), [entry, childrenMap]);

  // Shops located in this place: the revealed shop-children of the entry. The
  // button browses them in the storefront; purchasing is gated on the party actually
  // being in this town (campaign location) with an active character, else the
  // modal opens read-only.
  const locationShops = useMemo(
    () => (entry ? getShopsForLocation(entry.id, loreEntries, shops) : []),
    [entry, loreEntries, shops]
  );
  const inTown = !!entry && campaign?.locationLoreId === entry.id;
  const canBuy = inTown && !!activeCharacter;

  // If this location is a Sandpoint Earn Income employer the party supports,
  // surface a badge with the skills it unlocks (#1152 S3). employerById returns
  // null for non-employer entries, so most lore pages show nothing.
  const employer = useMemo(() => (entry ? employerById(entry.id) : null), [entry]);
  const supportsHere = !!employer && !!supported?.[entry.id];

  // Trainer badge (#1191 S4): a supported Training Vendor location surfaces what
  // it trains, mirroring the employer badge. A location can be both (the
  // Garrison is an Earn Income employer AND a shield trainer) → both badges show.
  const trainer = useMemo(() => (entry ? trainingVendorById(entry.id) : null), [entry]);
  const trainsHere = !!trainer && !!supported?.[entry.id];

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
            {ancestors.length > 0 && (
              <nav className="lore-drawer-breadcrumb" aria-label="Location hierarchy">
                {ancestors.map(a => (
                  <button
                    key={a.id}
                    className="lore-drawer-crumb"
                    onClick={() => navigateTo(a.id)}
                  >
                    {a.title}
                  </button>
                ))}
              </nav>
            )}

            <div className="lore-drawer-title-area">
              <h2 className="lore-drawer-title">{entry.title}</h2>
              <span className="lore-drawer-category">{entry.category}</span>
            </div>

            {supportsHere && (
              <div className="lore-drawer-support" data-testid="lore-support-badge">
                <span className="lore-drawer-support-badge">Supports the party</span>
                <span className="lore-drawer-support-skills">
                  Earn Income here (up to level {employer.level}): {employerSkillSummary(employer)}
                </span>
              </div>
            )}

            {trainsHere && (
              <div className="lore-drawer-support" data-testid="lore-trainer-badge">
                <span className="lore-drawer-support-badge">Trains the party</span>
                <span className="lore-drawer-support-skills">
                  Trains: {trainingSummary(trainer)}
                </span>
              </div>
            )}

            {locationShops.length > 0 && (
              <div className="lore-drawer-shops">
                <button
                  type="button"
                  className="lore-drawer-shop-btn"
                  data-testid="lore-shops-button"
                  onClick={() => setShopOpen(true)}
                >
                  <span role="img" aria-label="Shop">🛒</span>
                  Shops
                  <span className="lore-drawer-shop-count">{locationShops.length}</span>
                </button>
                {!canBuy && (
                  <span className="lore-drawer-shop-note">
                    {inTown ? 'Browse only' : 'Browse (party not here)'}
                  </span>
                )}
              </div>
            )}

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

            {children.length > 0 && (
              <div className="lore-drawer-connections">
                <div className="lore-drawer-section">
                  <p className="lore-drawer-section-label">Contains</p>
                  <div className="lore-drawer-conn-list">
                    {children.map(child => (
                      <button
                        key={child.id}
                        className="lore-drawer-conn-btn"
                        onClick={() => navigateTo(child.id)}
                      >
                        {child.title}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

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

      {/* The redesigned full-screen storefront (#857) is the one shop surface:
          in-town it buys + etches; from a lore page out of town it's read-only. */}
      <ShopStorefront
        isOpen={shopOpen}
        onClose={() => setShopOpen(false)}
        shops={locationShops}
        waresStore={shops}
        items={items}
        runes={runes}
        spells={spells}
        character={canBuy ? activeCharacter : null}
        readOnly={!canBuy}
      />
    </>
  );
};

export default LoreDrawer;
