import React from 'react';
import { useContent } from '../contexts/ContentContext';
import HistoryTimelineComponent from '../components/shared/HistoryTimeline';
import './HistoryTimeline.css';

const HistoryTimeline = () => {
  const { loreEntries } = useContent();
  return (
    <div className="history-timeline-page">
      <h1>History Timeline</h1>
      <HistoryTimelineComponent loreEntries={loreEntries} />
    </div>
  );
};

export default HistoryTimeline;
