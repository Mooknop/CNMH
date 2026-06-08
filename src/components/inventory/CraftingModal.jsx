// src/components/inventory/CraftingModal.js
import React, { useState } from 'react';
import Modal from '../shared/Modal';
import './CraftingModal.css';
import { getProficiencyLabel, getSkillModifier, formatModifier } from '../../utils/CharacterUtils';
import { getLevelBasedDc, formatBulk } from '../../utils/InventoryUtils';

const CraftingModal = ({ isOpen, onClose, character, characterColor }) => {
  const [activeTab, setActiveTab] = useState('rules');

  if (!isOpen) return null;

  const themeColor = characterColor || 'var(--color-primary)';

  const craftingSkill = character.skills?.crafting || { proficiency: 0 };
  const craftingModifier = getSkillModifier(character, 'crafting');
  const proficiencyLabel = getProficiencyLabel(craftingSkill.proficiency);

  const knownRecipes = character.crafting || [];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Crafting" themeColor={themeColor} maxWidth="900px">
      {/* Crafting Skill Info */}
      <div className="crafting-skill-info">
        <div className="skill-stat">
          <span className="stat-label">Crafting Skill</span>
          <span className="stat-value">
            {formatModifier(craftingModifier)} ({proficiencyLabel})
          </span>
        </div>
      </div>

      {/* 3-tab pill-strip navigation */}
      <div className="crafting-tabs">
        <button
          className={`crafting-tab${activeTab === 'rules' ? ' crafting-tab--active' : ''}`}
          onClick={() => setActiveTab('rules')}
        >
          Rules
        </button>
        <button
          className={`crafting-tab${activeTab === 'earnings' ? ' crafting-tab--active' : ''}`}
          onClick={() => setActiveTab('earnings')}
        >
          Earnings
        </button>
        <button
          className={`crafting-tab${activeTab === 'recipes' ? ' crafting-tab--active' : ''}`}
          onClick={() => setActiveTab('recipes')}
        >
          Known Recipes ({knownRecipes.length})
        </button>
      </div>

      {/* Tab Content */}
      <div className="crafting-tab-content">

        {/* ── Rules ─────────────────────────────────────────── */}
        {activeTab === 'rules' && (
          <div className="crafting-rules">
            <div className="rules-section">
              <h3>Craft Activity</h3>
              <div className="activity-header">
                <span className="activity-time">8–16 hours (or more)</span>
                <span className="activity-traits">Concentrate · Exploration · Manipulate</span>
              </div>

              <div className="requirements-section">
                <h4>Requirements</h4>
                <ul>
                  <li>The item is Common, or you have a crafting recipe for it.</li>
                  <li>If the item is 9th level or higher, you must be a master in Crafting; 17th or higher requires legendary.</li>
                  <li>You have an appropriate set of tools and, in many cases, a workshop.</li>
                  <li>You must have raw materials worth at least half the item's Price.</li>
                </ul>
              </div>

              <div className="description-section">
                <p>
                  You attempt a Crafting check after you spend 16 hours of work (2 days), or 8 hours (1 day) if you have the item's formula.
                </p>
                <p>
                  If your attempt to create the item is successful, you expend the raw materials you supplied.
                  You can pay the remaining portion of the item's Price in materials to complete the item immediately,
                  or spend additional downtime days working to reduce the materials needed.
                </p>
              </div>

              <div className="degrees-section">
                <h4>Degrees of Success</h4>
                <div className="degree-entry degree-entry--crit-success">
                  <span className="degree-level">Critical Success</span>
                  <span className="degree-description">
                    Your attempt is successful. Each additional day spent Crafting reduces the materials
                    needed by an amount based on your level + 1 and your proficiency rank.
                  </span>
                </div>
                <div className="degree-entry degree-entry--success">
                  <span className="degree-level">Success</span>
                  <span className="degree-description">
                    Your attempt is successful. Each additional day reduces materials based on your level
                    and proficiency rank.
                  </span>
                </div>
                <div className="degree-entry degree-entry--failure">
                  <span className="degree-level">Failure</span>
                  <span className="degree-description">
                    You fail to complete the item. You can salvage the raw materials you supplied for
                    their full value. If you want to try again, you must start over.
                  </span>
                </div>
                <div className="degree-entry degree-entry--crit-failure">
                  <span className="degree-level">Critical Failure</span>
                  <span className="degree-description">
                    You fail to complete the item. You ruin 10% of the raw materials you supplied,
                    but can salvage the rest. If you want to try again, you must start over.
                  </span>
                </div>
              </div>

              <div className="special-section">
                <h4>Special Rules</h4>
                <ul>
                  <li>
                    <strong>Alchemical and Magical Items</strong> — Requires the Alchemical Crafting
                    or Magical Crafting skill feat in addition to being trained.
                  </li>
                  <li>
                    <strong>Consumables and Ammunition</strong> — You can Craft up to four identical
                    consumable items at once with a single check.
                  </li>
                  <li>
                    <strong>Formulas</strong> — Reduces start time from 2 days to 1, and lets you
                    Craft uncommon and rarer items if you have their formulas.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}

        {/* ── Earnings ──────────────────────────────────────── */}
        {activeTab === 'earnings' && (
          <div className="crafting-earnings">
            <p className="earnings-intro">
              For each additional day you spend after the first 2, reduce the remaining materials
              needed based on your Crafting proficiency and character level (Income Earned table).
              Below are approximate savings per 8-hour work period.
            </p>
            <table className="earnings-table" aria-label="Crafting earnings by degree of success">
              <thead>
                <tr>
                  <th>Result</th>
                  <th>Savings / 8 hrs</th>
                </tr>
              </thead>
              <tbody>
                <tr className="earnings-row earnings-row--crit-success">
                  <td className="earnings-degree">Critical Success</td>
                  <td className="earnings-value">9 sp</td>
                </tr>
                <tr className="earnings-row earnings-row--success">
                  <td className="earnings-degree">Success</td>
                  <td className="earnings-value">7 sp</td>
                </tr>
                <tr className="earnings-row earnings-row--failure">
                  <td className="earnings-degree">Failure</td>
                  <td className="earnings-value">2 sp</td>
                </tr>
                <tr className="earnings-row earnings-row--crit-failure">
                  <td className="earnings-degree">Critical Failure</td>
                  <td className="earnings-value">—</td>
                </tr>
              </tbody>
            </table>
            <p className="earnings-note">
              Actual savings scale with your character level and proficiency rank.
              These values reflect a level-appropriate baseline.
            </p>
          </div>
        )}

        {/* ── Recipes ───────────────────────────────────────── */}
        {activeTab === 'recipes' && (
          <div className="known-recipes">
            {knownRecipes.length > 0 ? (
              <div className="recipes-list">
                {knownRecipes.map((recipe, index) => (
                  <div key={index} className="recipe-card">
                    <div className="recipe-header">
                      <h3>{recipe.name}</h3>
                      {/* Flat item (no variants): show base price/weight */}
                      {(!recipe.variants || recipe.variants.length === 0) && (
                        <div className="recipe-meta">
                          {recipe.level != null && (
                            <span className="recipe-level">Level {recipe.level}</span>
                          )}
                          {recipe.price != null && (
                            <span className="recipe-price">{recipe.price} gp</span>
                          )}
                          {recipe.level != null && (
                            <span className="recipe-dc">DC {getLevelBasedDc(recipe.level)}</span>
                          )}
                          {recipe.weight != null && (
                            <span className="recipe-weight">Bulk: {formatBulk(recipe.weight)}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {recipe.description && (
                      <div className="recipe-description">
                        <p>{recipe.description}</p>
                      </div>
                    )}
                    {recipe.effect && (
                      <div className="recipe-effect">{recipe.effect}</div>
                    )}
                    {/* Catalog variants from resolved item */}
                    {recipe.variants && recipe.variants.length > 0 && (
                      <div className="recipe-types">
                        <h4>Variants</h4>
                        <div className="types-list">
                          {recipe.variants.map((v, vi) => (
                            <div key={vi} className="type-entry">
                              <div className="type-header">
                                <span className="type-name">{v.label}</span>
                                <span className="type-level">Level {v.level}</span>
                                {v.price != null && <span className="type-price">{v.price} gp</span>}
                                <span className="type-dc">DC {getLevelBasedDc(v.level)}</span>
                              </div>
                              {v.effect && <div className="type-effect">{v.effect}</div>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Legacy back-compat: inline recipes with types array */}
                    {recipe.types && recipe.types.length > 0 && (
                      <div className="recipe-types">
                        <h4>Variants</h4>
                        <div className="types-list">
                          {recipe.types.map((type, typeIndex) => (
                            <div key={typeIndex} className="type-entry">
                              <div className="type-header">
                                <span className="type-name">{type.type}</span>
                                <span className="type-level">Level {type.level}</span>
                                <span className="type-price">{type.price} gp</span>
                                <span className="type-dc">DC {getLevelBasedDc(type.level)}</span>
                              </div>
                              <div className="type-effect">{type.effect}</div>
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
    </Modal>
  );
};

export default CraftingModal;
