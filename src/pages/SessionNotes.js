import React, { useContext, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import './SessionNotes.css';

const SessionNotes = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { getCharacter } = useContext(CharacterContext);
  const [character, setCharacter] = useState(null);
  
  useEffect(() => {
    const characterData = getCharacter(id);
    if (characterData) {
      setCharacter(characterData);
    } else {
      navigate('/');
    }
  }, [id, getCharacter, navigate]);
  
  if (!character) return <div>Loading notes...</div>;
  
  // Sort notes by date, most recent first
  const sortedNotes = [...(character.notes || [])].sort((a, b) => 
    new Date(b.date) - new Date(a.date)
  );
  
  return (
    <div className="session-notes">
      <h1>{character.name}'s Session Notes</h1>
      
      <div className="notes-list">
        <h2>Session History</h2>
        
        {sortedNotes.length > 0 ? (
          sortedNotes.map(note => (
            <div key={note.id} className="note-card">
              <div className="note-header">
                <h3>{note.title}</h3>
                <span className="note-date">{new Date(note.date).toLocaleDateString()}</span>
              </div>
              <div className="note-content">
                {note.content.split('\n').map((paragraph, i) => (
                  <p key={i}>{paragraph}</p>
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <p>No session notes yet.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionNotes;