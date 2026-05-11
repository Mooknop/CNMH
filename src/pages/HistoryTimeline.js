import React from 'react';
import { loreEntries } from '../data';
import HistoryTimelineComponent from '../components/shared/HistoryTimeline';
import './HistoryTimeline.css';

const HistoryTimeline = () => {
  return (
    <div className="history-timeline-page">
      <h1>History Timeline</h1>
      <HistoryTimelineComponent loreEntries={loreEntries} />
    </div>
  );
};

export default HistoryTimeline;
