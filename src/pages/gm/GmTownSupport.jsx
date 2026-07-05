import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGameDate } from '../../contexts/GameDateContext';
import { useLocationSupport } from '../../hooks/useLocationSupport';
import { employersByFaction, employerSkillSummary as unlockLabel } from '../../data/earnIncomeEmployers';
import './GmTownSupport.css';

// World → Town Support (#1152 S1). The GM marks which Sandpoint locations
// support the party; support unlocks that location's Earn Income tasks in the
// player Downtime tab (#1154). Support is party-wide and persistent, per the
// gazetteer — it's not tied to any one downtime period. Data comes from the
// static employer list; the toggles write cnmh_support_global via
// useLocationSupport.
const GmTownSupport = () => {
  const { supported, setSupport } = useLocationSupport();
  const { formatGameDate } = useGameDate();
  const [search, setSearch] = useState('');

  const groups = useMemo(() => employersByFaction(), []);
  const supportedCount = Object.keys(supported).length;

  const q = search.trim().toLowerCase();
  const visibleGroups = useMemo(
    () =>
      groups
        .map((g) => ({
          ...g,
          employers: g.employers.filter(
            (e) =>
              !q
              || e.name.toLowerCase().includes(q)
              || unlockLabel(e).toLowerCase().includes(q),
          ),
        }))
        .filter((g) => g.employers.length),
    [groups, q],
  );

  const toggle = (e) => {
    const on = !supported[e.id];
    setSupport(e.id, on, on ? formatGameDate() : null);
  };

  return (
    <div className="gm-support">
      <header className="gm-support-head">
        <h1>Town Support</h1>
        <p className="gm-help">
          Mark which Sandpoint locations support the party. A supported employer
          lets players Earn Income there during Downtime, up to the location's
          level, using the skills shown. Support is party-wide and lasts until
          you turn it off.
        </p>
        <p className="gm-help gm-support-rp-hint">
          The <em>first</em> time the party earns a location's support, bump their{' '}
          <Link to="/gm/world/reputation">Reputation</Link> with that faction by
          +1 (unless already admired or hated).
        </p>
        <input
          type="search"
          className="gm-support-search"
          placeholder="Search locations or skills…"
          aria-label="Search town support locations"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <span className="gm-support-count">
          {supportedCount} location{supportedCount === 1 ? '' : 's'} supporting the party
        </span>
      </header>

      {visibleGroups.map((g) => (
        <section key={g.faction} className="gm-support-faction">
          <h2 className="gm-support-faction-name">{g.faction}</h2>
          <ul className="gm-support-list">
            {g.employers.map((e) => {
              const on = Boolean(supported[e.id]);
              const stamp = supported[e.id]?.earnedAt;
              return (
                <li key={e.id} className={`gm-support-row${on ? ' is-on' : ''}`}>
                  <label className="gm-support-toggle">
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() => toggle(e)}
                      aria-label={`${e.name} supports the party`}
                    />
                    <span className="gm-support-name">{e.name}</span>
                    <span className="gm-support-level">L{e.level}</span>
                  </label>
                  <div className="gm-support-meta">
                    <span className="gm-support-skills">{unlockLabel(e)}</span>
                    {e.bonus && (
                      <span className="gm-support-tag gm-support-tag--bonus" title={e.bonus.note}>
                        +{e.bonus.value} {e.bonus.type}
                      </span>
                    )}
                    {e.risk && (
                      <span className="gm-support-tag gm-support-tag--risk" title={e.risk}>
                        conditional
                      </span>
                    )}
                    {on && stamp && (
                      <span className="gm-support-since">since {stamp}</span>
                    )}
                  </div>
                  {e.note && <p className="gm-support-note">{e.note}</p>}
                  {e.risk && <p className="gm-support-risk">{e.risk}</p>}
                </li>
              );
            })}
          </ul>
        </section>
      ))}

      {!visibleGroups.length && (
        <p className="gm-help">No locations match “{search}”.</p>
      )}
    </div>
  );
};

export default GmTownSupport;
