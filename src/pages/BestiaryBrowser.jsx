import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useContent } from '../contexts/ContentContext';
import { useRecallKnowledge } from '../hooks/useRecallKnowledge';
import { useGmAuth } from '../hooks/useGmAuth';
import { useLore } from '../contexts/LoreContext';
import { rkKeyFor } from '../utils/recallKnowledge';
import { capturedMonsters, monsterToEnemy, monsterLocations, formatLastSeen } from '../utils/bestiary';
import BestiaryEntry from '../components/bestiary/BestiaryEntry';
import './BestiaryBrowser.css';

// Out-of-combat Bestiary — a standing log of every creature the party has ever
// encountered (#334), each rendered at the level of detail the party has learned.
// Shares the reveal-gated BestiaryEntry with the in-combat modal; only the list
// source differs (full persisted set vs the current encounter's enemies).
const BestiaryBrowser = () => {
  const { creatureKey } = useParams();
  const { monsters } = useContent();
  const { recordFor } = useRecallKnowledge();
  const { isGm } = useGmAuth();
  const { openLore } = useLore();

  const [query, setQuery] = useState('');
  const [traitFilter, setTraitFilter] = useState(null);
  const [focusKey, setFocusKey] = useState(null);

  // Build the row set: each captured monster mapped to an enemy-shaped object +
  // its learned record. `visible` gates spoiler-safe search/filter and labels.
  const rows = useMemo(() => {
    return capturedMonsters(monsters)
      .map((doc) => {
        const enemy = monsterToEnemy(doc);
        const record = recordFor(rkKeyFor(enemy));
        const visible = isGm || !!record.identity;
        return { doc, enemy, record, visible };
      })
      .sort((a, b) => {
        // Identified creatures sort by name; unidentified sink to the bottom.
        if (a.visible !== b.visible) return a.visible ? -1 : 1;
        return (a.doc.name || '').localeCompare(b.doc.name || '');
      });
  }, [monsters, recordFor, isGm]);

  // Trait chips come only from creatures the party can see — no spoilers.
  const traitOptions = useMemo(() => {
    const set = new Set();
    rows.forEach((r) => {
      if (r.visible) (r.enemy.bestiary?.traits || []).forEach((t) => set.add(t));
    });
    return [...set].sort();
  }, [rows]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      // A creature can only be matched on data the viewer can actually see.
      if (q) {
        if (!r.visible || !(r.doc.name || '').toLowerCase().includes(q)) return false;
      }
      if (traitFilter) {
        if (!r.visible || !(r.enemy.bestiary?.traits || []).includes(traitFilter)) return false;
      }
      return true;
    });
  }, [rows, query, traitFilter]);

  // Focus the deep-linked creatureKey when valid, else keep the current
  // selection while it's still in the filtered list, else fall back to the first
  // row. One effect with a functional update so the two rules never race.
  useEffect(() => {
    setFocusKey((cur) => {
      if (creatureKey && filtered.some((r) => r.doc.id === creatureKey)) return creatureKey;
      if (cur && filtered.some((r) => r.doc.id === cur)) return cur;
      return filtered[0]?.doc.id ?? null;
    });
  }, [filtered, creatureKey]);

  const focused = rows.find((r) => r.doc.id === focusKey) || null;
  const focusedLocations = focused ? monsterLocations(focused.doc) : [];

  return (
    <div className="bestiary-page">
      <div className="bestiary-container">
        <h1 className="bestiary-title">Bestiary</h1>

        {rows.length === 0 ? (
          <p className="bestiary-empty">No creatures encountered yet. Stat blocks are captured as the party fights.</p>
        ) : (
          <>
            <div className="bestiary-filters">
              <input
                type="search"
                className="bestiary-search"
                placeholder="Search by name…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                aria-label="Search creatures by name"
              />
              {traitOptions.length > 0 && (
                <div className="bestiary-trait-filters" role="group" aria-label="Filter by trait">
                  {traitOptions.map((t) => (
                    <button
                      key={t}
                      type="button"
                      className={`bestiary-trait-chip${traitFilter === t ? ' bestiary-trait-chip--active' : ''}`}
                      onClick={() => setTraitFilter(traitFilter === t ? null : t)}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="bestiary-layout">
              <div className="bestiary-list bm-list" role="listbox" aria-label="Creature list">
                {filtered.map(({ doc, enemy, visible }) => {
                  const isFocused = doc.id === focusKey;
                  return (
                    <button
                      key={doc.id}
                      type="button"
                      role="option"
                      aria-selected={isFocused}
                      className={`bm-list-item${isFocused ? ' bm-list-item--active' : ''}`}
                      onClick={() => setFocusKey(doc.id)}
                    >
                      {enemy.bestiary?.img && (
                        <img
                          className="bm-thumb"
                          src={enemy.bestiary.img}
                          alt=""
                          aria-hidden="true"
                          onError={(e) => { e.currentTarget.style.display = 'none'; }}
                        />
                      )}
                      <span className="bm-list-name">
                        {visible
                          ? doc.name
                          : <span className="bm-redacted bm-redacted--inline" style={{ width: '7ch' }} aria-label="name redacted" aria-hidden="true" />}
                      </span>
                      {enemy.bestiary?.level != null && visible && (
                        <span className="bm-list-level">CR {enemy.bestiary.level}</span>
                      )}
                    </button>
                  );
                })}
                {filtered.length === 0 && (
                  <p className="bestiary-empty">No creatures match your filters.</p>
                )}
              </div>

              <div className="bestiary-detail-pane bm-detail-pane">
                {focused ? (
                  <>
                    <BestiaryEntry enemy={focused.enemy} record={focused.record} revealAll={isGm} />
                    <div className="bestiary-seen">
                      <span className="bestiary-seen-label">Encountered at</span>
                      {focusedLocations.length > 0 ? (
                        <ul className="bestiary-seen-list">
                          {focusedLocations.map((loc) => (
                            <li key={loc.loreId}>
                              <button
                                type="button"
                                className="bestiary-seen-link"
                                onClick={() => openLore(loc.loreId)}
                              >
                                {loc.name}
                              </button>
                              {formatLastSeen(loc.lastSeenAt) && (
                                <span className="bestiary-seen-date"> · {formatLastSeen(loc.lastSeenAt)}</span>
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <span className="bestiary-seen-date">
                          {formatLastSeen(focused.doc.lastSeenAt) || 'unknown'}
                        </span>
                      )}
                    </div>
                  </>
                ) : (
                  <p className="bm-empty">Select a creature.</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default BestiaryBrowser;
