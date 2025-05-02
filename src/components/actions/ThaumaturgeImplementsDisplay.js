// src/components/actions/ThaumaturgeImplementsDisplay.js
import React from 'react';
import './ActionsList.css';

/**
 * Component to display Thaumaturge implements and exploits
 * @param {Object} props - Component props
 * @param {Object} props.character - Character data
 * @param {string} props.themeColor - Character color theme
 */
const ThaumaturgeImplementsDisplay = ({ character, themeColor }) => {
  // Return null if character doesn't have thaumaturge data
  if (!character.thaumaturge) return null;

  const { passives = [], exploits = [] } = character.thaumaturge;

  return (
    <div className="thaumaturge-implements-container">
      {/* Implements Section */}
      {passives.length > 0 && (
        <div className="thaumaturge-section">
          <h3 className="thaumaturge-section-header" style={{ 
            color: themeColor,
            borderBottom: `1px solid ${themeColor}`,
            marginBottom: '1rem'
          }}>
            Implements
          </h3>
          
          <div className="thaumaturge-description">
            <p>
              Thaumaturge implements are symbolic items that serve as a focus for your supernatural powers.
              You use these implements to harness and direct esoteric forces against your foes.
            </p>
          </div>
          
          <div className="implements-list">
            {passives.map((implement, index) => (
              <div key={index} className="implement-card" style={{ 
                borderLeft: `4px solid ${themeColor}`, 
                padding: '1rem',
                marginBottom: '1rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '0 6px 6px 0'
              }}>
                <h4 style={{ color: themeColor, marginTop: 0 }}>{implement.name}</h4>
                <p className="implement-description">
                  {implement.description || implement.benefit}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Exploits Section */}
      {exploits.length > 0 && (
        <div className="thaumaturge-section">
          <h3 className="thaumaturge-section-header" style={{ 
            color: themeColor,
            borderBottom: `1px solid ${themeColor}`,
            marginTop: '2rem',
            marginBottom: '1rem'
          }}>
            Exploits
          </h3>
          
          <div className="thaumaturge-description">
            <p>
              Exploits are techniques you use to identify and target a creature's weaknesses.
              By using your esoterica and implements, you can create supernatural effects that 
              exploit the vulnerabilities of your foes.
            </p>
          </div>
          
          <div className="exploits-list">
            {exploits.map((exploit, index) => (
              <div key={index} className="exploit-card" style={{ 
                borderLeft: `4px solid ${themeColor}`, 
                padding: '1rem',
                marginBottom: '1rem',
                backgroundColor: '#f9f9f9',
                borderRadius: '0 6px 6px 0'
              }}>
                <h4 style={{ color: themeColor, marginTop: 0 }}>{exploit.name}</h4>
                <p className="exploit-description">
                  {exploit.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ThaumaturgeImplementsDisplay;