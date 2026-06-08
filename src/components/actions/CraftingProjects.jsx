import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useContent } from '../../contexts/ContentContext';
import { getLevelBasedDc } from '../../utils/InventoryUtils';
import './CraftingProjects.css';

const makeId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

const CraftingProjects = ({ character }) => {
  const charId = character?.id || 'unknown';
  const [craftProjects, setCraftProjects] = useSyncedState(`cnmh_craftprojects_${charId}`, null);
  const { items } = useContent();

  const [adding, setAdding] = useState(false); // false | 'recipe' | 'catalog'
  const [recipeIdx, setRecipeIdx] = useState(null);
  const [catalogRef, setCatalogRef] = useState('');
  const [catalogLevel, setCatalogLevel] = useState('');

  const projects = craftProjects?.projects || [];
  const knownRecipes = (character?.crafting || []).filter(r => r.name);
  const catalogItems = (items || []).slice().sort((a, b) => a.name.localeCompare(b.name));
  const selectedCatalogItem = catalogItems.find(i => i.id === catalogRef);
  const variants = selectedCatalogItem?.variants || [];

  const cancelAdding = () => {
    setAdding(false);
    setRecipeIdx(null);
    setCatalogRef('');
    setCatalogLevel('');
  };

  const startProject = (ref, level, name, source) => {
    setCraftProjects(prev => ({
      projects: [...(prev?.projects || []), {
        id: makeId(),
        ref,
        level: level ?? null,
        name,
        source,
        threshold: source === 'recipe' ? 8 : 16,
        hours: 0,
      }],
    }));
    cancelAdding();
  };

  const abandonProject = (id) => {
    setCraftProjects(prev => ({
      projects: (prev?.projects || []).filter(p => p.id !== id),
    }));
  };

  const canStartFromRecipe = recipeIdx !== null;
  const canStartFromCatalog = !!catalogRef && (variants.length === 0 || !!catalogLevel);

  return (
    <div className="cp-wrap">
      <div className="cp-header">
        <span className="cp-title">Crafting Projects</span>
        {!adding && (
          <button className="cp-new-btn" onClick={() => setAdding('recipe')}>+ New</button>
        )}
      </div>

      {projects.length > 0 && (
        <ul className="cp-list" aria-label="Crafting projects">
          {projects.map(p => {
            const pct = Math.min(100, (p.hours / p.threshold) * 100);
            return (
              <li key={p.id} className="cp-project" data-testid={`cp-project-${p.id}`}>
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
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!adding && projects.length === 0 && (
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
                        onClick={() => setRecipeIdx(recipeIdx === i ? null : i)}
                        data-testid={`cp-recipe-${i}`}
                      >
                        <span className="cp-recipe-name">
                          {r.name}{r.label ? ` (${r.label})` : ''}
                        </span>
                        {r.level != null && (
                          <span className="cp-recipe-level">Lv {r.level} · DC {getLevelBasedDc(r.level)}</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="cp-add-footer">
                <button
                  className="cp-confirm-btn"
                  disabled={!canStartFromRecipe}
                  onClick={() => {
                    const r = knownRecipes[recipeIdx];
                    startProject(
                      r.ref || r.id,
                      r.level ?? null,
                      r.label ? `${r.name} (${r.label})` : r.name,
                      'recipe',
                    );
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
              <div className="cp-add-footer">
                <button
                  className="cp-confirm-btn"
                  disabled={!canStartFromCatalog}
                  onClick={() => {
                    const lvl = catalogLevel ? parseInt(catalogLevel, 10) : null;
                    const v = lvl != null ? variants.find(x => x.level === lvl) : null;
                    const name = v ? `${selectedCatalogItem.name} (${v.label})` : selectedCatalogItem.name;
                    startProject(selectedCatalogItem.id, lvl, name, 'catalog-item');
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
