import React, { useContext, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterContext } from '../../contexts/CharacterContext';
import './CharacterImporter.css';

const CharacterImporter = () => {
  const { loadCharactersFromJSON } = useContext(CharacterContext);
  const [message, setMessage] = useState('');
  const navigate = useNavigate();

  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        const characterId = loadCharactersFromJSON(jsonData);
        
        if (characterId) {
          setMessage('Character imported successfully!');
          // Navigate to the imported character after a brief delay
          setTimeout(() => {
            navigate(`/character/${characterId}`);
          }, 1500);
        } else {
          setMessage('Error: Invalid character data format.');
        }
      } catch (error) {
        console.error('Error parsing JSON file:', error);
        setMessage('Error: Could not parse the JSON file. Please make sure it is valid JSON.');
      }
    };
    
    reader.onerror = () => {
      setMessage('Error: Could not read the file.');
    };
    
    reader.readAsText(file);
  };

  // Function to handle paste from clipboard
  const handlePaste = async () => {
    try {
      const clipboardText = await navigator.clipboard.readText();
      try {
        const jsonData = JSON.parse(clipboardText);
        const characterId = loadCharactersFromJSON(jsonData);
        
        if (characterId) {
          setMessage('Character imported successfully!');
          // Navigate to the imported character after a brief delay
          setTimeout(() => {
            navigate(`/character/${characterId}`);
          }, 1500);
        } else {
          setMessage('Error: Invalid character data format.');
        }
      } catch (error) {
        console.error('Error parsing clipboard content as JSON:', error);
        setMessage('Error: Could not parse clipboard content as JSON. Please make sure it is valid JSON.');
      }
    } catch (error) {
      console.error('Error accessing clipboard:', error);
      setMessage('Error: Could not access clipboard. Make sure you have granted clipboard permissions.');
    }
  };

  return (
    <div className="character-importer">
      <h3>Import Character</h3>
      
      <div className="import-methods">
        <div className="import-method">
          <h4>From JSON File</h4>
          <input
            type="file"
            accept=".json"
            id="character-file"
            onChange={handleFileUpload}
            className="file-input"
          />
          <label htmlFor="character-file" className="file-label">
            Choose a JSON file
          </label>
        </div>
        
        <div className="import-method">
          <h4>From Clipboard</h4>
          <p>Copy a JSON character and paste it:</p>
          <button 
            onClick={handlePaste}
            className="btn-secondary"
          >
            Paste from Clipboard
          </button>
        </div>
      </div>
      
      {message && (
        <div className={`import-message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default CharacterImporter;