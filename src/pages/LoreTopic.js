import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { loreEntries } from '../data';
import './LoreTopic.css';

const LoreTopic = () => {
  const { id } = useParams();
  const entry = loreEntries.find(e => e.id === id);

  if (!entry) {
    return (
      <div className="lore-topic-page">
        <div className="topic-not-found">
          <h2>Entry Not Found</h2>
          <p>No lore entry exists with id "{id}".</p>
          <Link to="/lore" className="back-link">← Back to Lore Library</Link>
        </div>
      </div>
    );
  }

  const relatedEntries = (entry.related || [])
    .map(relId => loreEntries.find(e => e.id === relId))
    .filter(Boolean);

  return (
    <div className="lore-topic-page">
      <Link to="/lore" className="back-link">← Back to Lore Library</Link>

      <div className="topic-card">
        <div className="topic-header">
          <h1>{entry.title}</h1>
          <span className="topic-category">{entry.category}</span>
        </div>

        <div className="topic-content">
          {entry.content.split('\n').map((paragraph, i) => (
            <p key={i}>{paragraph}</p>
          ))}
        </div>
      </div>

      {relatedEntries.length > 0 && (
        <div className="related-topics">
          <h3>Related Topics</h3>
          <div className="related-links">
            {relatedEntries.map(related => (
              <Link
                key={related.id}
                to={`/lore/${related.id}`}
                className="related-link"
              >
                <span className="related-category">{related.category}</span>
                {related.title}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default LoreTopic;
