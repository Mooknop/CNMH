import React, { useMemo, useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';

// GM Quick Action modal: set the party's current location by picking one of the
// Location Lore entries. Writes both the display title and a reference to the
// lore id into the synced campaign meta, so the marquee/navbar can later link
// back to the lore entry.

const SetLocationModal = ({ isOpen, onClose }) => {
  // GM-only surface: pick from ALL Location lore, including entries not yet
  // revealed to players (the party can be somewhere before they can read
  // about it — the marquee only shows the title).
  const { allLoreEntries } = useContent();
  // Same key as PlayModeControl — writes sync to every client + that marquee.
  const [campaign, setCampaign] = useSyncedState('cnmh_campaign_global', { location: '', locationLoreId: '' });
  const [query, setQuery] = useState('');

  const locations = useMemo(() => {
    const list = (allLoreEntries || []).filter(
      (e) => (e.category || '').trim() === 'Location'
    );
    return list.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  }, [allLoreEntries]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return locations;
    return locations.filter((e) => {
      const haystack = [e.title, e.summary, ...(e.tags || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [locations, query]);

  const selectedId = campaign?.locationLoreId ?? '';

  const handlePick = (entry) => {
    setCampaign({ ...(campaign || {}), location: entry.title, locationLoreId: entry.id });
    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Set Location" maxWidth="680px">
      <section className="ct-section">
        <h3 className="ct-section-title">Choose Location</h3>
        <input
          type="search"
          className="pmc-meta-input"
          aria-label="Search locations"
          placeholder="Search locations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{ marginBottom: '1rem', width: '100%' }}
        />
        <div className="ct-browser-grid">
          {filtered.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className={`ct-browser-card${selectedId === entry.id ? ' ct-browser-card--active' : ''}`}
              onClick={() => handlePick(entry)}
              title={entry.summary}
              style={{ textAlign: 'left' }}
            >
              <span className="ct-browser-name">{entry.title}</span>
              <span className="ct-browser-summary">{entry.summary}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="gm-help">No matching locations.</p>
          )}
        </div>
      </section>
    </Modal>
  );
};

export default SetLocationModal;
