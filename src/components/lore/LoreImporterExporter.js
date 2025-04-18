import React, { useState, useEffect } from 'react';
import { loreEntries as defaultLoreEntries } from '../../data';
import './LoreImporterExporter.css';

const LoreImporterExporter = ({ onImport }) => {
  const [message, setMessage] = useState('');
  
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonData = JSON.parse(e.target.result);
        
        // Check if the imported data has the expected structure
        if (jsonData.loreEntries && Array.isArray(jsonData.loreEntries)) {
          onImport(jsonData.loreEntries);
          setMessage('Lore entries imported successfully!');
          setTimeout(() => {
            setMessage('');
          }, 3000);
        } else {
          setMessage('Error: Invalid lore data format. Expected a "loreEntries" array.');
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
  
  const handleExport = () => {
    // Get the latest lore entries from localStorage
    const storedLore = localStorage.getItem('pf2e-lore');
    if (!storedLore) {
      setMessage('No lore entries to export.');
      return;
    }
    
    try {
      const loreEntries = JSON.parse(storedLore);
      // Create a lore object with the entries array
      const loreData = { loreEntries };
      
      // Convert lore object to JSON string
      const jsonData = JSON.stringify(loreData, null, 2);
      
      // Create a blob from the JSON data
      const blob = new Blob([jsonData], { type: 'application/json' });
      
      // Create a URL for the blob
      const url = URL.createObjectURL(blob);
      
      // Create a link element
      const link = document.createElement('a');
      link.href = url;
      link.download = 'campaign-lore.json';
      
      // Append the link to the document body
      document.body.appendChild(link);
      
      // Click the link to trigger the download
      link.click();
      
      // Clean up
      URL.revokeObjectURL(url);
      document.body.removeChild(link);
      
      setMessage('Lore entries exported successfully!');
      setTimeout(() => {
        setMessage('');
      }, 3000);
    } catch (error) {
      console.error('Error exporting lore entries:', error);
      setMessage('Error: Could not export lore entries.');
    }
  };
  
  // Load sample lore data from our imported default entries
  const loadSampleLore = () => {
    try {
      if (defaultLoreEntries && Array.isArray(defaultLoreEntries)) {
        onImport(defaultLoreEntries);
        setMessage('Sample lore entries loaded successfully!');
        setTimeout(() => {
          setMessage('');
        }, 3000);
      } else {
        setMessage('Error: Could not load sample lore data.');
      }
    } catch (error) {
      console.error('Error loading sample lore:', error);
      setMessage('Error: Could not load sample lore data.');
    }
  };
  
  return (
    <div className="lore-importer-exporter">
      <h3>Import/Export Lore</h3>
      
      <div className="lore-io-controls">
        <div className="import-controls">
          <h4>Import Lore</h4>
          <input
            type="file"
            accept=".json"
            id="lore-file"
            onChange={handleFileUpload}
            className="file-input"
          />
          <label htmlFor="lore-file" className="file-label">
            Choose a JSON file
          </label>
          <button 
            onClick={loadSampleLore}
            className="btn-secondary sample-btn"
          >
            Load Sample Lore
          </button>
        </div>
        
        <div className="export-controls">
          <h4>Export Lore</h4>
          <button 
            onClick={handleExport}
            className="btn-secondary export-btn"
          >
            Export as JSON
          </button>
        </div>
      </div>
      
      {message && (
        <div className={`io-message ${message.includes('Error') ? 'error' : 'success'}`}>
          {message}
        </div>
      )}
    </div>
  );
};

export default LoreImporterExporter;