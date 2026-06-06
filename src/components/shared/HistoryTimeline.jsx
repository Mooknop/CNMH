import React, { useState } from 'react';
import { useLore } from '../../contexts/LoreContext';
import {
  buildTimelineData,
  getDateLabel,
  getRelatedEntries,
} from '../../utils/timelineUtils';
import eraDescriptions from '../../data/lore/eras.json';
import './HistoryTimeline.css';

const HistoryTimeline = ({ loreEntries }) => {
  const [expandedEntryId, setExpandedEntryId] = useState(null);
  const { openLore } = useLore();

  const timelineData = buildTimelineData(loreEntries);

  const handleEntryClick = (entryId) => {
    setExpandedEntryId(expandedEntryId === entryId ? null : entryId);
  };

  const handleRelatedEntryClick = (relatedId) => {
    openLore(relatedId);
  };

  const renderEraDescription = (period) => {
    const eraData = eraDescriptions[period.periodKey];
    if (!eraData) return null;
    return (
      <div className="period-description">
        <p className="period-description-text">{eraData.description}</p>
        {eraData.subEras && eraData.subEras.length > 0 && (
          <div className="era-sub-list">
            {eraData.subEras.map((sub) => (
              <div key={sub.id} className="era-sub-item">
                <div className="era-sub-title">{sub.title}</div>
                <p className="era-sub-description">{sub.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderEraMarker = (era) => (
    <div key={`era-${era.id}`} className="timeline-era-marker">
      <div className="era-marker-label">{era.title}</div>
      <div className="era-marker-date">{getDateLabel(era)}</div>
    </div>
  );

  const renderEntry = (entry) => {
    const isExpanded = expandedEntryId === entry.id;
    const relatedEntries = getRelatedEntries(entry, loreEntries);

    return (
      <div
        key={entry.id}
        className={`timeline-entry ${isExpanded ? 'expanded' : ''}`}
      >
        <div className="entry-marker">
          <div className="marker-dot"></div>
          <div className="entry-marker-content" onClick={() => handleEntryClick(entry.id)}>
            <div className="entry-title">{entry.title}</div>
            <div className="entry-date">{getDateLabel(entry)}</div>
            <div className="entry-summary">{entry.summary}</div>
          </div>
        </div>

        {isExpanded && (
          <div className="entry-expanded">
            <div className="entry-content">{entry.content}</div>

            {relatedEntries.length > 0 && (
              <div className="entry-related">
                <h4>Related Topics</h4>
                <div className="related-entries">
                  {relatedEntries.map((related) => (
                    <button
                      key={related.id}
                      className="related-entry-button"
                      onClick={() => handleRelatedEntryClick(related.id)}
                    >
                      {related.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="history-timeline">
      <div className="timeline-container">
        {timelineData.periods.map((period) => (
          <div key={period.periodKey} className="timeline-period">
            {/* Period label */}
            <div className="period-header">
              <h3 className="period-label">{period.periodLabel}</h3>
            </div>

            {/* Era description */}
            {renderEraDescription(period)}

            {/* Timeline content for this period */}
            <div className="period-content">
              {/* Era markers */}
              {period.eras && period.eras.length > 0 && (
                <div className="era-markers">
                  {period.eras.map((era) => renderEraMarker(era))}
                </div>
              )}

              {/* History entries */}
              {period.entries && period.entries.length > 0 ? (
                <div className="entries-list">
                  {period.entries.map((entry) => renderEntry(entry))}
                </div>
              ) : (
                <div className="no-entries">
                  {period.eras && period.eras.length > 0
                    ? 'No recorded events in this period'
                    : 'No recorded history in this period'}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HistoryTimeline;
