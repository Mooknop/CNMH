import React from 'react';

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

const RoomDetail = ({ room, showBody = true }) => {
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
  } = room;

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

      {treasure && <Html as="p" className="gm-room-loot" html={`<strong>Treasure:</strong> ${treasure}`} />}
      {reward && <Html as="p" className="gm-room-loot" html={`<strong>Reward:</strong> ${reward}`} />}

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
