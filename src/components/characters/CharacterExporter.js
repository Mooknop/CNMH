import React, { useContext } from 'react';
import { CharacterContext } from '../../contexts/CharacterContext';
import './CharacterExporter.css';

const CharacterExporter = ({ characterId }) => {
  const { getCharacter } = useContext(CharacterContext);
  
  const handleExport = () => {
    const character = getCharacter(characterId);
    if (!character) return;
    
    // Convert character object to JSON string
    const jsonData = JSON.stringify(character, null, 2);
    
    // Create a blob from the JSON data
    const blob = new Blob([jsonData], { type: 'application/json' });
    
    // Create a URL for the blob
    const url = URL.createObjectURL(blob);
    
    // Create a link element
    const link = document.createElement('a');
    link.href = url;
    link.download = `${character.name.replace(/\s+/g, '-').toLowerCase()}.json`;
    
    // Append the link to the document body
    document.body.appendChild(link);
    
    // Click the link to trigger the download
    link.click();
    
    // Clean up
    URL.revokeObjectURL(url);
    document.body.removeChild(link);
  };
  
  const handleCopyToClipboard = () => {
    const character = getCharacter(characterId);
    if (!character) return;
    
    // Convert character object to JSON string
    const jsonData = JSON.stringify(character, null, 2);
    
    // Copy to clipboard
    navigator.clipboard.writeText(jsonData)
      .then(() => {
        const notification = document.createElement('div');
        notification.className = 'clipboard-notification';
        notification.textContent = 'Character copied to clipboard!';
        document.body.appendChild(notification);
        
        // Remove notification after a delay
        setTimeout(() => {
          document.body.removeChild(notification);
        }, 2000);
      })
      .catch(err => {
        console.error('Error copying to clipboard:', err);
        alert('Failed to copy character to clipboard');
      });
  };
  
  return (
    <div className="character-exporter">
      <button 
        onClick={handleExport}
        className="btn-secondary export-btn"
        title="Export character as JSON file"
      >
        Export JSON
      </button>
      <button 
        onClick={handleCopyToClipboard}
        className="btn-secondary copy-btn"
        title="Copy character JSON to clipboard"
      >
        Copy to Clipboard
      </button>
    </div>
  );
};

export default CharacterExporter;