import React from 'react';
import { roomTreasureCache } from '../../utils/rooms';

// Shared renderer for one imported adventure room (or a site "Features" doc),
// used by both the World → Rooms browser and the dashboard's Current Room
// panel (#1077). Text fields carry safe inline HTML produced by the transform
// (scripts/importAdventureRooms.js): @Check enrichers become <strong>DC N
// Skill</strong>, @UUID links are flattened to labels, images stripped. The
// content is GM-authored campaign data behind Cloudflare Access, so rendering
// it as HTML here is intended.
const Html = ({ html, className, as: Tag = 'div', ...rest }) => (
  <Tag className={className} dangerouslySetInnerHTML={{ __html: html }} {...rest} />
);

const RoomDetail = ({ room, showBody = true, showNotes = true, showTreasure = true }) => {
  if (!room) return null;
  const {
    code,
    name,
    encounterLabel,
    readAloud,
    checks = [],
    creatures = [],
    hazards = [],
    treasure,
    reward,
    body,
    notes,
  } = room;

  const cache = roomTreasureCache(room);
  const distributed = room.distributedAt != null;

  return (
    <div className="gm-room-detail">
      <header className="gm-room-detail-head">
        <h3>{code ? `${code}. ` : ''}{name}</h3>
        {encounterLabel && <span className="gm-room-budget">{encounterLabel}</span>}
      </header>

      {readAloud && (
        <Html as="blockquote" className="gm-room-readaloud" aria-label="Read-aloud text" html={readAloud} />
      )}

      {checks.length > 0 && (
        <div className="gm-room-section">
          <h4>Hidden checks</h4>
          <table className="gm-room-checks">
            <thead>
              <tr>
                <th scope="col">Check</th>
                <th scope="col">DC</th>
                <th scope="col">Skill</th>
                <th scope="col" aria-label="Secret" />
              </tr>
            </thead>
            <tbody>
              {checks.map((c, i) => (
                <tr key={i} className={c.secret ? 'is-secret' : ''}>
                  <td>{c.label}</td>
                  <td className="gm-room-dc">{c.dc != null ? c.dc : '—'}</td>
                  <td>{c.statistic}{c.basic ? ' (basic)' : ''}</td>
                  <td>{c.secret && <span className="gm-room-secret-badge">secret</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creatures.length > 0 || hazards.length > 0) && (
        <div className="gm-room-section gm-room-threats">
          {creatures.length > 0 && (
            <p><strong>Creatures:</strong> {creatures.join(', ')}</p>
          )}
          {hazards.length > 0 && (
            <ul className="gm-room-hazards">
              {hazards.map((h, i) => (
                <li key={i}>
                  <strong>{h.name}</strong>
                  {' — '}Stealth DC {h.stealthDc != null ? h.stealthDc : '—'}
                  {h.level != null && `, level ${h.level}`}
                  {h.complex && ', complex'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showTreasure && (cache || distributed) && (
        <div className="gm-room-section gm-room-cache">
          <h4>Treasure cache{distributed ? ' · distributed' : ''}</h4>
          {cache && cache.gold > 0 && <p className="gm-room-cache-gold">{cache.gold} gp</p>}
          {cache && cache.items.length > 0 && (
            <ul className="gm-room-cache-items">
              {cache.items.map((it, i) => (
                <li key={i} className={`gm-room-cache-chip${it.ref ? '' : ' is-unmatched'}`}>
                  <span className="gm-room-cache-chip-name">
                    {it.name}{it.variant ? ` (${it.variant})` : ''}
                  </span>
                  {it.qty > 1 && <span className="gm-room-cache-chip-qty">×{it.qty}</span>}
                  {!it.ref && <span className="gm-room-cache-chip-flag">not in catalog</span>}
                </li>
              ))}
            </ul>
          )}
          {distributed && (
            <p className="gm-room-cache-stamp">
              Distributed {new Date(room.distributedAt).toLocaleDateString()}
            </p>
          )}
        </div>
      )}

      {treasure && <Html as="p" className="gm-room-loot" html={`<strong>Treasure:</strong> ${treasure}`} />}
      {reward && <Html as="p" className="gm-room-loot" html={`<strong>Reward:</strong> ${reward}`} />}

      {showNotes && notes && (
        <div className="gm-room-section gm-room-notes-display">
          <h4>Campaign significance</h4>
          <p className="gm-room-notes-text">{notes}</p>
        </div>
      )}

      {showBody && body && (
        <details className="gm-room-body">
          <summary>Full room text</summary>
          <Html className="gm-room-body-html" html={body} />
        </details>
      )}
    </div>
  );
};

export default RoomDetail;
