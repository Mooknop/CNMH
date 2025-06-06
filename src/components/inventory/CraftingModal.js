// src/components/inventory/CraftingModal.js
import React, { useState } from 'react';
import './CraftingModal.css';
import { getProficiencyLabel, getSkillModifier, formatModifier, formatBulk } from '../../utils/CharacterUtils';
import { getLevelBasedDc } from '../../utils/InventoryUtils';

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
                    <span className="activity-time">8-16 hours (or more)</span>
                    <span className="activity-traits">Concentrate, Exploration, Manipulate</span>
                  </div>
                  
                  <div className="requirements-section">
                    <h4 style={{ color: themeColor }}>Requirements</h4>
                    <ul>
                      <li>The item is Common, or you have a crafting recipe for it.</li>
                      <li>If the item is 9th level or higher, you must be a master in Crafting, and if it's 17th or higher, you must be legendary.</li>
                      <li>You have an appropriate set of tools and, in many cases, a workshop. For example, you need access to a smithy to forge a metal shield, or an alchemist's lab to produce alchemical items.</li>
                      <li>You must have raw materials worth at least half the item's Price. If you're in a settlement, you can usually spend currency to get the amount of raw materials you need, except in the case of rarer precious materials.</li>
                    </ul>
                  </div>
                  
                  <div className="description-section">
                    <p>
                      You attempt a Crafting check after you spend 16 hours of work (2 days), or 8 hours (1 day) if you have the item's formula. 
                      These hours need not be consecutive, but must be done in 1 hour increments.
                    </p>
                    
                    <p>
                      If your attempt to create the item is successful, you expend the raw materials you 
                      supplied. You can pay the remaining portion of the item's Price in materials to 
                      complete the item immediately, or you can spend additional downtime days working on 
                      the item to reduce the materials needed. For each additional day you spend, reduce 
                      the value of the materials you need to expend to complete the item. This amount is 
                      determined using the Income Earned table, based on your proficiency rank in Crafting 
                      and using your own level as the task level.
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
                        <span></span>
                        <span>Critical Success</span>
                        <span>Success</span>
                      </div>
                      <div className="table-row">
                        <span>8hrs of work saves: </span>
                        <span>9 sp</span>
                        <span>7 sp</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="special-section">
                    <h4 style={{ color: themeColor }}>Special Rules</h4>
                    <ul>
                      <li>
                        <strong>Alchemical and Magical Items</strong> If you want to Craft alchemical items 
                        or magic items, you need to select the skill feat for Alchemical Crafting or Magical 
                        Crafting in addition to being trained.
                      </li>
                      <li>
                        <strong>Consumables and Ammunition</strong> You can Craft items with the consumable 
                        trait in batches, making up to four of the same item at once with a single check. 
                        This requires you to include the raw materials for all the items in the batch at the 
                        start, and you must complete the batch all at once.
                      </li>
                      <li>
                        <strong>Formulas</strong> A written formula for an item helps you create it with less 
                        difficulty. This has two functions. First, it reduces the time needed to start Crafting 
                        from 2 days to 1, as you have less preparation to do. Second, you can Craft uncommon 
                        and rarer items if you're able to acquire their formulas.
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
                          <span className="recipe-weight">Bulk: {formatBulk(recipe.weight)}</span>
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
                                    <span className="type-dc">DC {getLevelBasedDc(type.level)}</span>
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