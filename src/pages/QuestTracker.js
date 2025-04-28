import React, { useState, useEffect } from 'react';
import { quests as defaultQuests } from '../data';
import './QuestTracker.css';

const QuestTracker = () => {
  const [quests, setQuests] = useState([]);
  const [filter, setFilter] = useState('all');
  
  useEffect(() => {    
    // Set quests directly from the imported data
    setQuests(defaultQuests);
  }, []);
  
  useEffect(() => {
    // Only save to localStorage if quests is not empty
    if (quests && quests.length > 0) {
      localStorage.setItem('pf2e-quests', JSON.stringify(quests));
    }
  }, [quests]);
  
  // Ensure quests is an array before filtering
  const questsArray = Array.isArray(quests) ? quests : [];
  
  const filteredQuests = questsArray.filter(quest => {
    if (filter === 'all') return true;
    return quest.status === filter;
  });
  
  const sortedQuests = [...filteredQuests].sort((a, b) => {
    // Sort by priority first (high > medium > low)
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    
    if (priorityDiff !== 0) return priorityDiff;
    
    // If same priority, sort by status (active > pending > completed)
    const statusOrder = { active: 0, pending: 1, completed: 2 };
    return statusOrder[a.status] - statusOrder[b.status];
  });
  
  return (
    <div className="quest-tracker">
      <h1>Party Quest Tracker</h1>
      
      <div className="quest-filters">
        <button 
          className={`filter-btn ${filter === 'all' ? 'active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All Quests
        </button>
        <button 
          className={`filter-btn ${filter === 'active' ? 'active' : ''}`}
          onClick={() => setFilter('active')}
        >
          Active
        </button>
        <button 
          className={`filter-btn ${filter === 'pending' ? 'active' : ''}`}
          onClick={() => setFilter('pending')}
        >
          Pending
        </button>
        <button 
          className={`filter-btn ${filter === 'completed' ? 'active' : ''}`}
          onClick={() => setFilter('completed')}
        >
          Completed
        </button>
      </div>
      
      {/* Quest count display for debugging */}
      <div style={{ marginBottom: '15px', color: '#666' }}>
        Showing {sortedQuests.length} quests (Total: {questsArray.length})
      </div>
      
      <div className="quests-list">
        {sortedQuests.length > 0 ? (
          sortedQuests.map(quest => (
            <div 
              key={quest.id} 
              className={`quest-card ${quest.status}`}
            >
              <div className="quest-header">
                <div className="quest-title-section">
                  <h2>{quest.title}</h2>
                  <div className="quest-meta">
                    <span className={`quest-priority ${quest.priority}`}>
                      {quest.priority.charAt(0).toUpperCase() + quest.priority.slice(1)} Priority
                    </span>
                    <span className="quest-location">
                      {quest.location}
                    </span>
                  </div>
                </div>
                <div className="quest-status">
                  {quest.status.charAt(0).toUpperCase() + quest.status.slice(1)}
                </div>
              </div>
              
              <div className="quest-details">
                <div className="quest-info">
                  <p><strong>Quest Giver:</strong> {quest.giver}</p>
                  <p><strong>Description:</strong> {quest.description}</p>
                  <p><strong>Reward:</strong> {quest.reward}</p>
                </div>
                
                <div className="quest-notes">
                  <h3>Notes</h3>
                  {quest.notes && quest.notes.length > 0 ? (
                    <div className="notes-list">
                      {quest.notes.map(note => (
                        <div key={note.id} className="quest-note">
                          <div className="note-header">
                            <span className="note-date">
                              {new Date(note.date).toLocaleDateString()}
                            </span>
                            <span className="note-author">
                              Added by {note.addedBy}
                            </span>
                          </div>
                          <div className="note-content">
                            {note.content}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-notes">No notes have been added yet.</p>
                  )}
                </div>
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>No quests found with the current filter.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestTracker;