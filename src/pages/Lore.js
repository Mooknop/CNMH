import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { loreEntries as defaultLoreEntries } from '../data';
import HistoryTimeline from '../components/shared/HistoryTimeline';
import './Lore.css';

const Lore = () => {
  const [loreEntries] = useState(defaultLoreEntries);
  const [filter, setFilter] = useState('');
  const [categories, setCategories] = useState([]);
  const [randomEntry, setRandomEntry] = useState(null);

  const getRandomEntry = () => {
    const nonHistoryEntries = loreEntries.filter(entry => entry.category !== 'History');
    if (nonHistoryEntries.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * nonHistoryEntries.length);
    return nonHistoryEntries[randomIndex];
  };

  useEffect(() => {
    const uniqueCategories = [...new Set(loreEntries.map(entry => entry.category))];
    setCategories(uniqueCategories);
    setRandomEntry(getRandomEntry());
  }, [loreEntries]);

  const filteredEntries = filter
    ? filter === 'History'
      ? [] // History entries are handled by HistoryTimeline component
      : loreEntries.filter(entry => entry.category === filter)
    : randomEntry ? [randomEntry] : [];

  return (
    <div className="lore-page">
      <h1>Lore Library</h1>

      <div className="lore-container">
        <div className="lore-sidebar">
          <div className="category-filters">
            <h3>Categories</h3>
            <button
              className={`category-btn ${!filter ? 'active' : ''}`}
              onClick={() => setFilter('')}
            >
              All
            </button>
            {categories.map(category => (
              <button
                key={category}
                className={`category-btn ${filter === category ? 'active' : ''}`}
                onClick={() => setFilter(category)}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        <div className="lore-entries">
          <div className="entries-header">
            <h2>{filter ? `${filter} Entries` : 'Random Entry'}</h2>
            {!filter && (
              <button 
                className="random-button" 
                onClick={() => setRandomEntry(getRandomEntry())}
                title="Load another random entry"
              >
                🎲 New Random
              </button>
            )}
          </div>

          {filter === 'History' ? (
            <HistoryTimeline loreEntries={loreEntries} />
          ) : filteredEntries.length > 0 ? (
            filteredEntries.map(entry => (
              <div key={entry.id} className="lore-entry">
                <div className="entry-header">
                  <Link to={`/lore/${entry.id}`} className="entry-title-link">
                    <h3>{entry.title}</h3>
                  </Link>
                  <span className="entry-category">{entry.category}</span>
                </div>
                <div className="entry-summary">
                  <p>{entry.summary || entry.content}</p>
                  <Link to={`/lore/${entry.id}`} className="read-more-link">
                    Read More →
                  </Link>
                </div>
              </div>
            ))
          ) : (
            <div className="empty-state">
              <p>No lore entries found for this category.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Lore;
