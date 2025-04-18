import React, { useState, useEffect } from 'react';
import { loreEntries as defaultLoreEntries } from '../data';
import './Lore.css';

const Lore = () => {
  const [loreEntries, setLoreEntries] = useState(defaultLoreEntries);
  const [filter, setFilter] = useState('');
  const [categories, setCategories] = useState([]);
  
  useEffect(() => {
    // Extract unique categories from lore entries
    const uniqueCategories = [...new Set(loreEntries.map(entry => entry.category))];
    setCategories(uniqueCategories);
  }, [loreEntries]);
  
  const filteredEntries = loreEntries.filter(entry => {
    const matchesFilter = filter ? entry.category === filter : true;
    return matchesFilter;
  });
  
  return (
    <div className="lore-page">
      <h1>Campaign Lore</h1>
      
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
          <h2>{filter ? `${filter} Entries` : 'All Lore Entries'}</h2>
          
          {filteredEntries.length > 0 ? (
            filteredEntries.map(entry => (
              <div key={entry.id} className="lore-entry">
                <div className="entry-header">
                  <h3>{entry.title}</h3>
                  <span className="entry-category">{entry.category}</span>
                </div>
                <div className="entry-content">
                  {entry.content.split('\n').map((paragraph, i) => (
                    <p key={i}>{paragraph}</p>
                  ))}
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