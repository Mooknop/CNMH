// src/components/inventory/CraftingModal.js
import React, { useState } from 'react';
import './CraftingModal.css';
import { getProficiencyLabel, getSkillModifier, formatModifier } from '../../utils/CharacterUtils';

const CraftingModal = ({ isOpen, onClose, character, characterColor }) => {
  const [activeTab, setActiveTab] = useState('rules');
  
  if (!isOpen) return null;
  
  // Use the characterColor or default to the theme color
  const themeColor = characterColor || '#5e2929';
  
  // Get crafting skill information
  const craftingSkill = character.skills?.crafting || { proficiency: 0 };
  const craftingModifier = getSkillModifier(character, 'crafting');
  const proficiencyLabel = getProficiencyLabel(craftingSkill.proficiency);
  
  // Get known recipes
  const knownRecipes = character.crafting || [];
  
  return (
    <div className="crafting-modal-overlay" onClick={onClose}>
      <div className="crafting-modal" onClick={(e) => e.stopPropagation()}>
        <div className="crafting-modal-header" style={{ backgroundColor: themeColor }}>
          <h2>Crafting</h2>
          <button className="close-button" onClick={onClose}>&times;</button>
        </div>
        
        <div className="crafting-modal-content">
          {/* Crafting Skill Info */}
          <div className="crafting-skill-info">
            <div className="skill-stat">
              <span className="stat-label">Crafting Skill</span>
              <span className="stat-value" style={{ color: themeColor }}>
                {formatModifier(craftingModifier)} ({proficiencyLabel})
              </span>
            </div>
          </div>
          
          {/* Tab Navigation */}
          <div className="crafting-tabs">
            <button 
              className={`tab-button ${activeTab === 'rules' ? 'active' : ''}`}
              onClick={() => setActiveTab('rules')}
              style={{ backgroundColor: activeTab === 'rules' ? themeColor : '' }}
            >
              Crafting Rules
            </button>
            <button 
              className={`tab-button ${activeTab === 'recipes' ? 'active' : ''}`}
              onClick={() => setActiveTab('recipes')}
              style={{ backgroundColor: activeTab === 'recipes' ? themeColor : '' }}
            >
              Known Recipes ({knownRecipes.length})
            </button>
          </div>
          
          {/* Tab Content */}
          <div className="tab-content">
            {activeTab === 'rules' && (
              <div className="crafting-rules">
                <div className="rules-section">
                  <h3 style={{ color: themeColor }}>Craft Activity</h3>
                  <div className="activity-header">
                    <span className="activity-time">4 days, then variable</span>
                    <span className="activity-traits">Concentrate, Exploration, Manipulate</span>
                  </div>
                  
                  <div className="requirements-section">
                    <h4 style={{ color: themeColor }}>Requirements</h4>
                    <ul>
                      <li>The formula for the item you're crafting</li>
                      <li>A set of artisan's tools appropriate to the item</li>
                      <li>Raw materials worth at least half the Price of the finished item</li>
                    </ul>
                  </div>
                  
                  <div className="description-section">
                    <p>
                      You can make an item from raw materials. You need the Formula to Craft a common item, 
                      or you can work from a schematic or other document with the GM's permission. It takes 
                      4 days of work to attempt a Crafting check for the item. The GM determines the DC to 
                      Craft the item based on its level, rarity, and other circumstances.
                    </p>
                    
                    <p>
                      If your attempt to create the item is successful, you expend the raw materials you 
                      supplied. You can pay the remaining portion of the item's Price in materials to 
                      complete the item immediately, or you can spend additional downtime days working on 
                      the item to reduce the materials needed.
                    </p>
                  </div>
                  
                  <div className="degrees-section">
                    <h4 style={{ color: themeColor }}>Degrees of Success</h4>
                    <div className="degree-entry">
                      <span className="degree-level critical-success">Critical Success:</span>
                      <span className="degree-description">
                        Your attempt is successful. Each additional day spent Crafting reduces the materials 
                        needed to complete the item by an amount based on your level + 1 and your proficiency rank.
                      </span>
                    </div>
                    <div className="degree-entry">
                      <span className="degree-level success">Success:</span>
                      <span className="degree-description">
                        Your attempt is successful. Each additional day spent Crafting reduces the materials 
                        needed to complete the item by an amount based on your level and your proficiency rank.
                      </span>
                    </div>
                    <div className="degree-entry">
                      <span className="degree-level failure">Failure:</span>
                      <span className="degree-description">
                        You fail to complete the item. You can salvage the raw materials you supplied for 
                        their full value. If you want to try again, you must start over.
                      </span>
                    </div>
                    <div className="degree-entry">
                      <span className="degree-level critical-failure">Critical Failure:</span>
                      <span className="degree-description">
                        You fail to complete the item. You ruin 10% of the raw materials you supplied, 
                        but you can salvage the rest. If you want to try again, you must start over.
                      </span>
                    </div>
                  </div>
                  
                  <div className="earnings-section">
                    <h4 style={{ color: themeColor }}>Crafting Earnings</h4>
                    <div className="earnings-table">
                      <div className="table-header">
                        <span>Proficiency Rank</span>
                        <span>Untrained</span>
                        <span>Trained</span>
                        <span>Expert</span>
                        <span>Master</span>
                        <span>Legendary</span>
                      </div>
                      <div className="table-row">
                        <span>Earnings*</span>
                        <span>1 cp</span>
                        <span>5 cp</span>
                        <span>2 sp</span>
                        <span>2 gp</span>
                        <span>5 gp</span>
                      </div>
                      <div className="table-note">
                        * Multiply by your level
                      </div>
                    </div>
                  </div>
                  
                  <div className="special-section">
                    <h4 style={{ color: themeColor }}>Special Rules</h4>
                    <ul>
                      <li>
                        <strong>Alchemical Items:</strong> You can Craft alchemical items in batches of 
                        four of the same item. This requires you to include the raw materials for all the 
                        items in the batch at the start, and you make a single Crafting check for the batch.
                      </li>
                      <li>
                        <strong>Magical Items:</strong> You can Craft magic items, though some have other 
                        requirements, as listed in the item. When you Craft a magic item, you also need 
                        magical components, which you can gain by learning the Magical Crafting feat.
                      </li>
                      <li>
                        <strong>Consumables:</strong> You can Craft consumable items in batches, similar 
                        to alchemical items.
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
            
            {activeTab === 'recipes' && (
              <div className="known-recipes">
                {knownRecipes.length > 0 ? (
                  <div className="recipes-list">
                    {knownRecipes.map((recipe, index) => (
                      <div key={index} className="recipe-card">
                        <div className="recipe-header">
                          <h3 style={{ color: themeColor }}>{recipe.name}</h3>
                          <span className="recipe-weight">Bulk: {recipe.weight || 'L'}</span>
                        </div>
                        
                        <div className="recipe-description">
                          <p>{recipe.description}</p>
                        </div>
                        
                        {recipe.types && recipe.types.length > 0 && (
                          <div className="recipe-types">
                            <h4 style={{ color: themeColor }}>Variants</h4>
                            <div className="types-list">
                              {recipe.types.map((type, typeIndex) => (
                                <div key={typeIndex} className="type-entry">
                                  <div className="type-header">
                                    <span className="type-name">{type.type}</span>
                                    <span className="type-level">Level {type.level}</span>
                                    <span className="type-price">{type.price} gp</span>
                                  </div>
                                  <div className="type-effect">
                                    {type.effect}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-recipes">
                    <p>No known crafting recipes.</p>
                    <p className="empty-note">
                      Recipes can be learned by purchasing formulas, finding schematics, 
                      or through certain feats and class features.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default CraftingModal;