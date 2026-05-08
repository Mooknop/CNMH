import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { loreEntries as allLoreEntries } from '../data';
import HistoryTimeline from '../components/shared/HistoryTimeline';
import CollapsibleCard from '../components/shared/CollapsibleCard';
import LoreDiscoveryPanel from '../components/shared/LoreDiscoveryPanel';
import {
  getAllCategories,
  getEntriesByCategory,
  groupEntriesByCategory,
  buildBacklinkMap,
  getConnectionData,
  filterBySearchTerm,
  getSubgroupsForCategory,
} from '../utils/loreUtils';
import './Lore.css';

const Lore = () => {
  const [filter, setFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [focusedEntryId, setFocusedEntryId] = useState(null);
  const [compressed, setCompressed] = useState(false);

  const categories = useMemo(() => getAllCategories(allLoreEntries), []);
  const backlinkMap = useMemo(() => buildBacklinkMap(allLoreEntries), []);

  const baseEntries = useMemo(
    () => filter ? getEntriesByCategory(allLoreEntries, filter) : allLoreEntries,
    [filter]
  );

  const visibleEntries = useMemo(
    () => filterBySearchTerm(baseEntries, searchTerm),
    [baseEntries, searchTerm]
  );

  const subgroups = useMemo(
    () => (filter && filter !== 'History') ? getSubgroupsForCategory(visibleEntries) : [],
    [filter, visibleEntries]
  );

  const allGrouped = useMemo(
    () => !filter ? groupEntriesByCategory(allLoreEntries) : null,
    [filter]
  );

  const focusedEntry = useMemo(
    () => focusedEntryId ? allLoreEntries.find(e => e.id === focusedEntryId) : null,
    [focusedEntryId]
  );

  const connectionData = useMemo(
    () => focusedEntry ? getConnectionData(focusedEntry, allLoreEntries, backlinkMap) : null,
    [focusedEntry, backlinkMap]
  );

  const handleFilterChange = (newFilter) => {
    setFilter(newFilter);
    setSearchTerm('');
    setFocusedEntryId(null);
  };

  const renderEntryCard = (entry) => {
    const isFocused = focusedEntryId === entry.id;
    return (
      <div
        key={entry.id}
        className={`lore-entry ${isFocused ? 'focused' : ''}`}
        onClick={() => setFocusedEntryId(isFocused ? null : entry.id)}
      >
        <div className="entry-header">
          <Link
            to={`/lore/${entry.id}`}
            className="entry-title-link"
            onClick={e => e.stopPropagation()}
          >
            <h3>{entry.title}</h3>
          </Link>
          <span className="entry-category">{entry.category}</span>
        </div>
        <div className="entry-summary">
          {(entry.summary || entry.content).split('\n').map((para, i) => (
            <p key={i}>{para}</p>
          ))}
          {(entry.tags || []).length > 0 && (
            <div className="entry-tags">
              {entry.tags.map(tag => (
                <span key={tag} className="entry-tag">{tag}</span>
              ))}
            </div>
          )}
          <Link
            to={`/lore/${entry.id}`}
            className="read-more-link"
            onClick={e => e.stopPropagation()}
          >
            Read More →
          </Link>
        </div>
      </div>
    );
  };

  const renderCompressedEntry = (entry) => {
    const isFocused = focusedEntryId === entry.id;
    return (
      <div
        key={entry.id}
        className={`lore-entry-row ${isFocused ? 'focused' : ''}`}
        onClick={() => setFocusedEntryId(isFocused ? null : entry.id)}
      >
        <span className="entry-row-title">{entry.title}</span>
        {!filter && <span className="entry-category">{entry.category}</span>}
      </div>
    );
  };

  const renderEntry = compressed ? renderCompressedEntry : renderEntryCard;

  const renderSubgroupedEntries = () => {
    if (subgroups.length === 0) {
      return (
        <div className={compressed ? 'lore-entry-list' : undefined}>
          {visibleEntries.map(entry => renderEntry(entry))}
        </div>
      );
    }
    const coveredIds = new Set(subgroups.flatMap(g => g.entries.map(e => e.id)));
    const ungrouped = visibleEntries.filter(e => !coveredIds.has(e.id));
    return (
      <>
        {subgroups.map((group, i) => (
          <CollapsibleCard
            key={group.tag}
            initialExpanded={i < 2}
            header={
              <span className="subgroup-header">
                {group.tag}
                <span className="subgroup-count">({group.entries.length})</span>
              </span>
            }
            themeColor="var(--color-primary)"
            className="subgroup-card"
          >
            <div className={compressed ? 'lore-entry-list' : undefined}>
              {group.entries.map(entry => renderEntry(entry))}
            </div>
          </CollapsibleCard>
        ))}
        {ungrouped.length > 0 && (
          <CollapsibleCard
            key="__other"
            initialExpanded={subgroups.length < 2}
            header={
              <span className="subgroup-header">
                Other
                <span className="subgroup-count">({ungrouped.length})</span>
              </span>
            }
            themeColor="var(--color-primary)"
            className="subgroup-card"
          >
            <div className={compressed ? 'lore-entry-list' : undefined}>
              {ungrouped.map(entry => renderEntry(entry))}
            </div>
          </CollapsibleCard>
        )}
      </>
    );
  };

  const renderAllGrouped = () => {
    if (!allGrouped) return null;
    return allGrouped.map(({ category, entries }) => (
      <CollapsibleCard
        key={category}
        initialExpanded
        header={
          <span className="subgroup-header">
            {category}
            <span className="subgroup-count">({entries.length})</span>
          </span>
        }
        themeColor="var(--color-primary)"
        className="subgroup-card"
      >
        <div className={compressed ? 'lore-entry-list' : undefined}>
          {entries.map(entry => renderEntry(entry))}
        </div>
      </CollapsibleCard>
    ));
  };

  return (
    <div className="lore-page">
      <h1>Campaign Lore</h1>

      <div className={`lore-container ${focusedEntryId ? 'panel-open' : ''}`}>
        <div className="lore-sidebar">
          <div className="category-filters">
            <h3>Categories</h3>
            <button
              className={`category-btn ${!filter ? 'active' : ''}`}
              onClick={() => handleFilterChange('')}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                className={`category-btn ${filter === category ? 'active' : ''}`}
                onClick={() => handleFilterChange(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="lore-entries">
          <div className="entries-header">
            <h2>{filter ? `${filter} Entries` : 'All Lore Entries'}</h2>
            {filter !== 'History' && (
              <div className="view-toggle">
                <button
                  className={`view-toggle-btn ${!compressed ? 'active' : ''}`}
                  onClick={() => setCompressed(false)}
                  title="Card view"
                >
                  ⊞
                </button>
                <button
                  className={`view-toggle-btn ${compressed ? 'active' : ''}`}
                  onClick={() => setCompressed(true)}
                  title="Compact view"
                >
                  ☰
                </button>
              </div>
            )}
          </div>

          {filter !== 'History' && (
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search entries..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="search-clear-btn" onClick={() => setSearchTerm('')}>
                  ✕
                </button>
              )}
            </div>
          )}

          {filter === 'History' ? (
            <HistoryTimeline loreEntries={allLoreEntries} />
          ) : filter ? (
            renderSubgroupedEntries()
          ) : (
            renderAllGrouped()
          )}

          {filter !== 'History' && visibleEntries.length === 0 && (
            <div className="empty-state">
              <p>No lore entries found.</p>
            </div>
          )}
        </div>

        {focusedEntryId && (
          <LoreDiscoveryPanel
            entry={focusedEntry}
            connectionData={connectionData}
            onEntrySelect={setFocusedEntryId}
            onClose={() => setFocusedEntryId(null)}
          />
        )}
      </div>
    </div>
  );
};

export default Lore;
