import React, { useState } from 'react';
import './FeatsList.css';

// Ability Dial S4 — feats as a level-ladder (.ftrack): rungs grouped by
// acquisition level along a connector spine, category carried by a tint
// chip, an open slot at the character's current level as the ladder's CTA.
//
// Category derives from the feat's free-text `source`: literal Skill /
// General, the character's ancestry (or the literal 'Ancestry') → ancestry,
// and everything else — class, archetype and dedication tracks — buckets
// under Class. The chips filter within the ladder.
const categoryOf = (feat, character) => {
  const source = String(feat.source || '').trim().toLowerCase();
  if (!source || source === 'general') return 'general';
  if (source === 'skill') return 'skill';
  const ancestry = String(character?.ancestry || '').trim().toLowerCase();
  if (source === 'ancestry' || (ancestry && source === ancestry)) return 'ancestry';
  return 'class';
};

const CATEGORY_LABELS = {
  class: 'Class',
  ancestry: 'Ancestry',
  skill: 'Skill',
  general: 'General',
};
const FILTERS = ['all', 'class', 'ancestry', 'skill', 'general'];

const FeatsList = ({ character, characterColor }) => {
  const themeColor = characterColor || 'var(--color-primary)';
  const [filter, setFilter] = useState('all');
  const [expandedKey, setExpandedKey] = useState(null);

  const feats = (character.feats || []).map((feat) => ({
    ...feat,
    category: categoryOf(feat, character),
  }));
  const filtered = filter === 'all' ? feats : feats.filter((f) => f.category === filter);

  // Ladder rungs: acquisition level ascending. An empty rung at the
  // character's current level (unfiltered view only) is the open-slot CTA.
  const byLevel = new Map();
  filtered
    .slice()
    .sort((a, b) => (a.level || 0) - (b.level || 0))
    .forEach((feat) => {
      const lv = feat.level || 0;
      if (!byLevel.has(lv)) byLevel.set(lv, []);
      byLevel.get(lv).push(feat);
    });
  const charLevel = character.level ?? null;
  if (filter === 'all' && feats.length > 0 && charLevel != null && !byLevel.has(charLevel)) {
    byLevel.set(charLevel, []);
  }
  const rungs = [...byLevel.entries()].sort((a, b) => a[0] - b[0]);

  const featKey = (feat) => feat.id || `${feat.name}-${feat.level}`;
  const toggle = (key) => setExpandedKey((prev) => (prev === key ? null : key));

  if (feats.length === 0) {
    return (
      <div className="feats-list" style={{ '--color-theme': themeColor }}>
        <div className="empty-state">
          <p>No feats or abilities.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="feats-list" style={{ '--color-theme': themeColor }}>
      <div className="sortbar" role="group" aria-label="Filter feats by category">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            className={`sortchip${filter === f ? ' active' : ''}`}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
          >
            {f === 'all' ? 'All' : CATEGORY_LABELS[f]}
          </button>
        ))}
      </div>

      {rungs.length === 0 ? (
        <p className="ftrack-none">No {CATEGORY_LABELS[filter].toLowerCase()} feats.</p>
      ) : (
        <ol className="ftrack">
          {rungs.map(([lv, list]) => (
            <li key={lv} className="frung">
              <span className="flevel" aria-label={`Level ${lv}`}>{lv}</span>
              <div className="frung-feats">
                {list.map((feat) => {
                  const key = featKey(feat);
                  const open = expandedKey === key;
                  return (
                    <div key={key} className={`fnode${open ? ' open' : ''}`}>
                      <button
                        type="button"
                        className="fnode-h"
                        aria-expanded={open}
                        onClick={() => toggle(key)}
                      >
                        <h3 className="fname">{feat.name}</h3>
                        <span className={`fcat fcat--${feat.category}`}>
                          {CATEGORY_LABELS[feat.category]}
                        </span>
                        {feat.source && <span className="fsource">{feat.source}</span>}
                      </button>
                      {open && <div className="fbody">{feat.description}</div>}
                    </div>
                  );
                })}
                {list.length === 0 && (
                  <div className="fnode fnode--open">
                    <span className="fopen-label">
                      Open slot — pick a level {lv} feat with your GM
                    </span>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
};

export default FeatsList;
