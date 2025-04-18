import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { CharacterContext } from '../contexts/CharacterContext';
import './CharacterCreator.css';

const CharacterCreator = () => {
  const { addCharacter } = useContext(CharacterContext);
  const navigate = useNavigate();
  
  const [formData, setFormData] = useState({
    name: '',
    ancestry: '',
    background: '',
    class: '',
    level: 1,
    maxHp: 0,
    currentHp: 0,
    ac: 10,
    abilities: {
      strength: 10,
      dexterity: 10,
      constitution: 10,
      intelligence: 10,
      wisdom: 10,
      charisma: 10
    },
    saves: {
      fortitude: 0,
      reflex: 0,
      will: 0
    },
    skills: {},
    feats: [],
    inventory: [],
    notes: []
  });
  
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    if (name.includes('.')) {
      // Handle nested properties (e.g., abilities.strength)
      const [parentProp, childProp] = name.split('.');
      setFormData({
        ...formData,
        [parentProp]: {
          ...formData[parentProp],
          [childProp]: value
        }
      });
    } else {
      setFormData({ ...formData, [name]: value });
    }
  };
  
  const handleSubmit = (e) => {
    e.preventDefault();
    const characterId = addCharacter(formData);
    navigate(`/character/${characterId}`);
  };
  
  return (
    <div className="character-creator">
      <h1>Create New Character</h1>
      
      <form onSubmit={handleSubmit}>
        <div className="form-section">
          <h2>Basic Information</h2>
          
          <div className="form-group">
            <label htmlFor="name">Character Name</label>
            <input
              type="text"
              id="name"
              name="name"
              value={formData.name}
              onChange={handleInputChange}
              required
            />
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="ancestry">Ancestry</label>
              <input
                type="text"
                id="ancestry"
                name="ancestry"
                value={formData.ancestry}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="background">Background</label>
              <input
                type="text"
                id="background"
                name="background"
                value={formData.background}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="class">Class</label>
              <input
                type="text"
                id="class"
                name="class"
                value={formData.class}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="level">Level</label>
              <input
                type="number"
                id="level"
                name="level"
                min="1"
                max="20"
                value={formData.level}
                onChange={handleInputChange}
              />
            </div>
          </div>
        </div>
        
        <div className="form-section">
          <h2>Abilities</h2>
          
          <div className="abilities-grid">
            <div className="form-group">
              <label htmlFor="strength">STR</label>
              <input
                type="number"
                id="strength"
                name="abilities.strength"
                min="1"
                value={formData.abilities.strength}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="dexterity">DEX</label>
              <input
                type="number"
                id="dexterity"
                name="abilities.dexterity"
                min="1"
                value={formData.abilities.dexterity}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="constitution">CON</label>
              <input
                type="number"
                id="constitution"
                name="abilities.constitution"
                min="1"
                value={formData.abilities.constitution}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="intelligence">INT</label>
              <input
                type="number"
                id="intelligence"
                name="abilities.intelligence"
                min="1"
                value={formData.abilities.intelligence}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="wisdom">WIS</label>
              <input
                type="number"
                id="wisdom"
                name="abilities.wisdom"
                min="1"
                value={formData.abilities.wisdom}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="charisma">CHA</label>
              <input
                type="number"
                id="charisma"
                name="abilities.charisma"
                min="1"
                value={formData.abilities.charisma}
                onChange={handleInputChange}
              />
            </div>
          </div>
        </div>
        
        <div className="form-section">
          <h2>Hit Points & Defenses</h2>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="maxHp">Max HP</label>
              <input
                type="number"
                id="maxHp"
                name="maxHp"
                min="1"
                value={formData.maxHp}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="ac">AC</label>
              <input
                type="number"
                id="ac"
                name="ac"
                min="1"
                value={formData.ac}
                onChange={handleInputChange}
              />
            </div>
          </div>
          
          <div className="form-row">
            <div className="form-group">
              <label htmlFor="fortitude">Fortitude</label>
              <input
                type="number"
                id="fortitude"
                name="saves.fortitude"
                value={formData.saves.fortitude}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="reflex">Reflex</label>
              <input
                type="number"
                id="reflex"
                name="saves.reflex"
                value={formData.saves.reflex}
                onChange={handleInputChange}
              />
            </div>
            
            <div className="form-group">
              <label htmlFor="will">Will</label>
              <input
                type="number"
                id="will"
                name="saves.will"
                value={formData.saves.will}
                onChange={handleInputChange}
              />
            </div>
          </div>
        </div>
        
        <div className="form-actions">
          <button type="submit" className="btn-primary">Create Character</button>
          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => navigate('/')}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
};

export default CharacterCreator;