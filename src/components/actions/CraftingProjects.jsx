import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { getLevelBasedDc } from '../../utils/InventoryUtils';
import { craftCostCp, halfCostCp } from '../../utils/craftingOutcome';
import { cpToGp } from '../../utils/earnIncome';
import './CraftingProjects.css';

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const CraftingProjects = ({ character }) => {
  const charId = character?.id || 'unknown';
  const [craftProjects, setCraftProjects] = useSyncedState(`cnmh_craftprojects_${charId}`, null);
  const [gold, setGold] = useSyncedState(`cnmh_gold_${charId}`, 0);
  const { items } = useContent();

  const [adding, setAdding] = useState(false); // false | 'recipe' | 'catalog'
  const [recipeIdx, setRecipeIdx] = useState(null);
  const [recipeLevel, setRecipeLevel] = useState('');
  const [catalogRef, setCatalogRef] = useState('');
  const [catalogLevel, setCatalogLevel] = useState('');
  const [rollInputs, setRollInputs] = useState({}); // { [projectId]: string }
  const [banners, setBanners] = useState({});        // { [projectId]: { roll, name } }

  const projects = craftProjects?.projects || [];
  const knownRecipes = (character?.crafting || []).filter(r => r.name);
  const catalogItems = (items || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const selectedCatalogItem = catalogItems.find(i => i.id === catalogRef);
  const variants = selectedCatalogItem?.variants || [];

  const cancelAdding = () => {
    setAdding(false);
    setRecipeIdx(null);
    setRecipeLevel('');
    setCatalogRef('');
    setCatalogLevel('');
  };

  const craftRank = character?.skills?.crafting?.proficiency || 0;

  const startProject = (ref, level, name, source, price) => {
    const costCp = craftCostCp(price);
    const paidCp = halfCostCp(price);
    const remainingCp = costCp - paidCp;
    // Half the materials cost is paid up front from the crafter's personal gold.
    if (paidCp > 0) setGold(g => (Number(g) || 0) - cpToGp(paidCp));
    setCraftProjects(prev => ({
      projects: [...(prev?.projects || []), {
        id: makeId(),
        ref,
        level: level ?? null,
        name,
        source,
        threshold: source === 'recipe' ? 8 : 16,
        hours: 0,
        price: price ?? null,
        costCp,
        paidCp,
        remainingCp,
        craftRank,
        status: 'in-progress',
      }],
    }));
    cancelAdding();
  };

  const abandonProject = (id) => {
    setCraftProjects(prev => ({
      projects: (prev?.projects || []).filter(p => p.id !== id),
    }));
  };

  const completeProject = (p) => {
    const roll = parseInt(rollInputs[p.id] || '0', 10);
    setBanners(prev => ({ ...prev, [p.id]: { roll, name: p.name } }));
    setCraftProjects(prev => ({
      projects: (prev?.projects || []).filter(x => x.id !== p.id),
    }));
    setTimeout(() => {
      setBanners(prev => { const next = { ...prev }; delete next[p.id]; return next; });
    }, 3000);
  };

  const selectedRecipe = recipeIdx !== null ? knownRecipes[recipeIdx] : null;
  const recipeVariants = selectedRecipe?.variants || [];
  const canStartFromRecipe = recipeIdx !== null && (recipeVariants.length === 0 || !!recipeLevel);
  const canStartFromCatalog = !!catalogRef && (variants.length === 0 || !!catalogLevel);

  // Resolve the chosen item's Price (decimal gp) for the up-front half-cost.
  // Variants carry their own price; fall back to the base item when none.
  const priceFor = (base, variantList, levelStr) => {
    if (variantList.length > 0) {
      const v = levelStr ? variantList.find(x => x.level === parseInt(levelStr, 10)) : null;
      return v?.price ?? null;
    }
    return base?.price ?? null;
  };
  const recipePrice = selectedRecipe ? priceFor(selectedRecipe, recipeVariants, recipeLevel) : null;
  const catalogPrice = selectedCatalogItem ? priceFor(selectedCatalogItem, variants, catalogLevel) : null;

  // Up-front cost preview (half the Price) + an over-budget warning. Insufficient
  // gold warns but never blocks — the GM reconciles at the approval step.
  const upfrontNote = (price) => {
    if (price == null) return null;
    const upfront = cpToGp(halfCostCp(price));
    return (
      <span className="cp-cost-note">
        Up-front: {upfront} gp <span className="cp-cost-sub">(½ of {price} gp)</span>
        {upfront > (Number(gold) || 0) && (
          <span className="cp-cost-warn"> — over your {Number(gold) || 0} gp</span>
        )}
      </span>
    );
  };

  return (
    <div className="cp-wrap">
      <div className="cp-header">
        <span className="cp-title">Crafting Projects</span>
        {!adding && (
          <button className="cp-new-btn" onClick={() => setAdding('recipe')}>+ New</button>
        )}
      </div>

      {Object.entries(banners).map(([id, { roll, name }]) => (
        <div key={id} className="cp-completed-banner" role="status" data-testid={`cp-banner-${id}`}>
          Item Completed! <strong>{name}</strong> — rolled {roll}
        </div>
      ))}

      {projects.length > 0 && (
        <ul className="cp-list" aria-label="Crafting projects">
          {projects.map(p => {
            const isReady = p.hours >= p.threshold;
            const pct = Math.min(100, (p.hours / p.threshold) * 100);
            return (
              <li
                key={p.id}
                className={`cp-project${isReady ? ' cp-project--ready' : ''}`}
                data-testid={`cp-project-${p.id}`}
              >
                <div className="cp-project-header">
                  <span className="cp-project-name">{p.name}</span>
                  <button
                    className="cp-abandon-btn"
                    onClick={() => abandonProject(p.id)}
                    aria-label={`Abandon ${p.name}`}
                  >
                    Abandon
                  </button>
                </div>

                {isReady ? (
                  <div className="cp-ready">
                    <span className="cp-ready-badge">Ready to complete!</span>
                    <div className="cp-ready-row">
                      <label className="cp-ready-label">
                        d20 total
                        <input
                          type="number"
                          className="cp-ready-input"
                          min={1}
                          value={rollInputs[p.id] ?? ''}
                          onChange={e => setRollInputs(prev => ({ ...prev, [p.id]: e.target.value }))}
                          aria-label={`d20 roll for ${p.name}`}
                          placeholder="—"
                        />
                      </label>
                      <button
                        className="cp-complete-btn"
                        disabled={!rollInputs[p.id]}
                        onClick={() => completeProject(p)}
                        aria-label={`Complete ${p.name}`}
                      >
                        Complete item
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="cp-progress-row">
                      <div className="cp-progress-track">
                        <div
                          className="cp-progress-fill"
                          style={{ '--cp-fill': `${pct}%` }}
                        />
                      </div>
                      <span className="cp-progress-label">{p.hours}h / {p.threshold}h</span>
                    </div>
                    {p.level != null && (
                      <span className="cp-project-meta">
                        Level {p.level} · DC {getLevelBasedDc(p.level)} · {p.source === 'recipe' ? '8h (recipe)' : '16h (item)'}
                        {p.remainingCp != null && p.remainingCp > 0 && (
                          <> · {cpToGp(p.remainingCp)} gp left</>
                        )}
                      </span>
                    )}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!adding && projects.length === 0 && Object.keys(banners).length === 0 && (
        <p className="cp-empty">No active projects.</p>
      )}

      {adding && (
        <div className="cp-add-panel">
          <div className="cp-add-tabs">
            <button
              className={`cp-add-tab${adding === 'recipe' ? ' cp-add-tab--active' : ''}`}
              onClick={() => { setAdding('recipe'); setRecipeIdx(null); }}
            >
              From Recipe ({knownRecipes.length})
            </button>
            <button
              className={`cp-add-tab${adding === 'catalog' ? ' cp-add-tab--active' : ''}`}
              onClick={() => { setAdding('catalog'); setCatalogRef(''); setCatalogLevel(''); }}
            >
              From Catalog
            </button>
          </div>

          {adding === 'recipe' && (
            <>
              {knownRecipes.length === 0 ? (
                <p className="cp-empty">No known recipes.</p>
              ) : (
                <ul className="cp-recipe-list" aria-label="Known recipes">
                  {knownRecipes.map((r, i) => (
                    <li key={i}>
                      <button
                        className={`cp-recipe-btn${recipeIdx === i ? ' cp-recipe-btn--selected' : ''}`}
                        onClick={() => { setRecipeIdx(recipeIdx === i ? null : i); setRecipeLevel(''); }}
                        data-testid={`cp-recipe-${i}`}
                      >
                        <span className="cp-recipe-name">{r.name}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {recipeVariants.length > 0 && (
                <label className="cp-form-label">
                  Grade
                  <select
                    className="cp-form-select"
                    value={recipeLevel}
                    onChange={e => setRecipeLevel(e.target.value)}
                    aria-label="Recipe grade"
                  >
                    <option value="">— select grade —</option>
                    {recipeVariants.map(v => (
                      <option key={v.level} value={String(v.level)}>
                        {v.label} (Level {v.level})
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {canStartFromRecipe && upfrontNote(recipePrice)}
              <div className="cp-add-footer">
                <button
                  className="cp-confirm-btn"
                  disabled={!canStartFromRecipe}
                  onClick={() => {
                    const r = knownRecipes[recipeIdx];
                    const lvl = recipeLevel ? parseInt(recipeLevel, 10) : null;
                    const v = lvl != null ? recipeVariants.find(x => x.level === lvl) : null;
                    const name = v ? `${r.name} (${v.label})` : r.name;
                    startProject(r.ref || r.id, lvl, name, 'recipe', recipePrice);
                  }}
                >
                  Start project
                </button>
                <button className="cp-cancel-btn" onClick={cancelAdding}>Cancel</button>
              </div>
            </>
          )}

          {adding === 'catalog' && (
            <>
              <div className="cp-catalog-form">
                <label className="cp-form-label">
                  Item
                  <select
                    className="cp-form-select"
                    value={catalogRef}
                    onChange={e => { setCatalogRef(e.target.value); setCatalogLevel(''); }}
                    aria-label="Catalog item"
                  >
                    <option value="">— select item —</option>
                    {catalogItems.map(i => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </select>
                </label>
                {variants.length > 0 && (
                  <label className="cp-form-label">
                    Grade
                    <select
                      className="cp-form-select"
                      value={catalogLevel}
                      onChange={e => setCatalogLevel(e.target.value)}
                      aria-label="Item grade"
                    >
                      <option value="">— select grade —</option>
                      {variants.map(v => (
                        <option key={v.level} value={String(v.level)}>
                          {v.label} (Level {v.level})
                        </option>
                      ))}
                    </select>
                  </label>
                )}
              </div>
              {canStartFromCatalog && upfrontNote(catalogPrice)}
              <div className="cp-add-footer">
                <button
                  className="cp-confirm-btn"
                  disabled={!canStartFromCatalog}
                  onClick={() => {
                    const lvl = catalogLevel ? parseInt(catalogLevel, 10) : null;
                    const v = lvl != null ? variants.find(x => x.level === lvl) : null;
                    const name = v ? `${selectedCatalogItem.name} (${v.label})` : selectedCatalogItem.name;
                    startProject(selectedCatalogItem.id, lvl, name, 'catalog-item', catalogPrice);
                  }}
                >
                  Start project
                </button>
                <button className="cp-cancel-btn" onClick={cancelAdding}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default CraftingProjects;
