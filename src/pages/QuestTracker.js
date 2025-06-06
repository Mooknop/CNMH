import React, { useState, useEffect } from 'react';
import { quests as defaultQuests } from '../data';
import './QuestTracker.css';

const QuestTracker = () => {
  const [quests, setQuests] = useState([]);
  
  useEffect(() => {    
    // Set quests directly from the imported data
    setQuests(defaultQuests);
  }, []);
  
  const questsArray = Array.isArray(quests) ? quests : [];
  
  const sortedQuests = [...questsArray].sort((a, b) => {
    // If same priority, sort by status (active > pending > completed)
    const statusOrder = { active: 0, pending: 1, completed: 2 };
    var statusDiff = statusOrder[a.status] - statusOrder[b.status];

    if(statusDiff !== 0) return statusDiff;

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });
  
  return (
    <div className="quest-tracker">
      <h1>Quests</h1>
      
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
                  {(quest.giver && <p><strong>Quest Giver:</strong> {quest.giver}</p>)}
                  <p>{quest.description}</p>
                </div>
                
                <div className="quest-notes">
                  <h3>Notes</h3>
                  {quest.notes && quest.notes.length > 0 ? (
                    <div className="notes-list">
                      {quest.notes.map(note => (
                        <div key={note.id} className="quest-note">
                          <div className="note-header">
                            <span className="note-date">
                              ⭐
                            </span>
                            <span className="note-date">
                              ⭐
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
            <p>No quests found.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default QuestTracker;