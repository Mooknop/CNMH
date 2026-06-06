// src/components/actions/ThaumaturgeImplementsDisplay.js
import React from 'react';
import './ActionsList.css';

const ThaumaturgeImplementsDisplay = ({ thaumaturge }) => {
  if (!thaumaturge) return null;

  const { passives = [] } = thaumaturge;

  return (
    <div className="thaumaturge-implements-container">
      {passives.length > 0 && (
        <div className="thaumaturge-section">
          <h3 className="thaumaturge-section-header">Implements</h3>

          <div className="thaumaturge-description">
            <p>
              Thaumaturge implements are symbolic items that serve as a focus for your supernatural powers.
              You use these implements to harness and direct esoteric forces against your foes.
            </p>
          </div>

          <div className="implements-list">
            {passives.map((implement, index) => (
              <div key={index} className="implement-card">
                <h4>{implement.name}</h4>
                <p className="implement-description">
                  {implement.description || implement.benefit}
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
