import React, { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useContent } from '../contexts/ContentContext';
import { useRecallKnowledge } from '../hooks/useRecallKnowledge';
import { useGmAuth } from '../hooks/useGmAuth';
import { useLore } from '../contexts/LoreContext';
import { rkKeyFor } from '../utils/recallKnowledge';
import { capturedMonsters, monsterToEnemy, monsterLocations, formatLastSeen } from '../utils/bestiary';
import { traitToAccent, dexNumber, formatDexNo } from '../utils/bestiaryPresentation';
import BestiaryEntry from '../components/bestiary/BestiaryEntry';
import BestiaryRecallKnowledge from '../components/bestiary/BestiaryRecallKnowledge';
import './BestiaryBrowser.css';

// Out-of-combat Bestiary — the standing "Specimen Dex" (#334, refreshed #779).
// A numbered grid of every creature the party has encountered; clicking a card
// opens its full reveal-gated entry. Shares the reveal-gated BestiaryEntry with
// the in-combat modal; only the list source differs (full persisted set vs the
// current encounter's enemies).
const BestiaryBrowser = () => {
  const { creatureKey } = useParams();
  const { monsters } = useContent();
  const { recordFor } = useRecallKnowledge();
  const { isGm } = useGmAuth();
  const { openLore } = useLore();

  const [query, setQuery] = useState('');
  const [traitFilter, setTraitFilter] = useState(null);
  // Grid ⇄ detail: null shows the dex grid; a key shows that creature's entry.
  // Seeded from the deep-link param so /bestiary/:key opens the entry directly.
  const [focusKey, setFocusKey] = useState(creatureKey || null);

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

  const focused = focusKey ? rows.find((r) => r.doc.id === focusKey) || null : null;
  const focusedLocations = focused ? monsterLocations(focused.doc) : [];

  const knownCount = rows.filter((r) => r.visible).length;
  const unknownCount = rows.length - knownCount;

  return (
    <div className="bestiary-page">
      <div className="bestiary-container">
        {focused ? (
          /* ── Detail view — the full dex entry ────────────────────────── */
          <div className="dex-detail">
            <button
              type="button"
              className="dex-back"
              onClick={() => setFocusKey(null)}
            >
              ← Bestiary
            </button>
            <BestiaryEntry enemy={focused.enemy} record={focused.record} revealAll={isGm} />
            <BestiaryRecallKnowledge key={focused.doc.id} enemy={focused.enemy} />
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
          </div>
        ) : (
          /* ── Grid view — the numbered dex index ──────────────────────── */
          <div className="dex-browser">
            <div className="dex-br-bar">
              <h1 className="dex-br-title">
                Bestiary
                {rows.length > 0 && (
                  <small>{knownCount} catalogued · {unknownCount} unknown</small>
                )}
              </h1>
              {rows.length > 0 && (
                <input
                  type="search"
                  className="dex-search"
                  placeholder="⌕ search specimens…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Search creatures by name"
                />
              )}
            </div>

            {rows.length === 0 ? (
              <p className="bestiary-empty">
                No creatures encountered yet. Stat blocks are captured as the party fights.
              </p>
            ) : (
              <>
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

                <div className="dex-grid-wrap" data-testid="dex-grid" aria-label="Creature list">
                  {filtered.map(({ doc, enemy, visible }) => {
                    const traits = enemy.bestiary?.traits || [];
                    const accent = visible ? traitToAccent(traits) : 'var(--wisp)';
                    const num = visible ? dexNumber(monsters, doc.id) : null;
                    const typeLabel = traits.length
                      ? traits[0].charAt(0).toUpperCase() + traits[0].slice(1)
                      : '';
                    return (
                      <button
                        key={doc.id}
                        type="button"
                        className={`dex-card${visible ? '' : ' unknown'}`}
                        style={{ '--cc': accent }}
                        onClick={() => setFocusKey(doc.id)}
                        aria-label={visible ? doc.name : 'Unidentified creature'}
                      >
                        <div className="dex-card-screen">
                          <span className="dex-card-no">{formatDexNo(num)}</span>
                          {enemy.bestiary?.img ? (
                            <img
                              className="dex-card-img"
                              src={enemy.bestiary.img}
                              alt=""
                              aria-hidden="true"
                              onError={(e) => { e.currentTarget.style.display = 'none'; }}
                            />
                          ) : (
                            <span className="dex-card-noart" aria-hidden="true" />
                          )}
                          {!visible && <span className="lock" aria-hidden="true">?</span>}
                        </div>
                        <div className="dex-card-meta">
                          <div className="dex-card-nm">{visible ? doc.name : '— unidentified —'}</div>
                          <div className="dex-card-lv">
                            {visible
                              ? `Creature ${enemy.bestiary?.level ?? '?'}${typeLabel ? ` · ${typeLabel}` : ''}`
                              : 'not yet recalled'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                  {filtered.length === 0 && (
                    <p className="bestiary-empty">No creatures match your filters.</p>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BestiaryBrowser;
