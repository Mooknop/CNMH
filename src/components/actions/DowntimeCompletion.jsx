import React, { useState } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { benchmarkReached } from '../../utils/downtimeUtils';
import {
  buildRetrainResult,
  buildResearchResult,
  hasAccumulateResult,
} from '../../utils/earnIncomeResults';
import './DowntimeCompletion.css';

const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const RETRAIN_TYPES = ['Feat', 'Skill', 'Class option', 'Other'];

// Shown in the Downtime progress area when an accumulate activity (Retrain /
// Research) reaches its GM benchmark and hasn't been submitted this period.
// Retrain captures the structured swap; Research captures the topic and hands
// the unlock to the GM (#206). Submitting queues a pending result for GM review.
const DowntimeCompletion = ({ character, activity, startedAt, hoursBanked }) => {
  const charId = character?.id || 'unknown';
  const charData = useCharacter(character);
  const [benchMap] = useSyncedState('cnmh_downtimebench_global', null);
  const [results, setResults] = useSyncedState('cnmh_downtimeresults_global', null);

  const [retrainType, setRetrainType] = useState('');
  const [fromLabel, setFromLabel] = useState('');
  const [toLabel, setToLabel] = useState('');
  const [topic, setTopic] = useState('');

  const isResearch = activity === 'Research';
  const kind = isResearch ? 'research' : 'retrain';
  const benchmarkDays = benchMap?.[charId]?.[activity];

  if (!benchmarkReached(hoursBanked, benchmarkDays)) return null;
  if (hasAccumulateResult(results?.entries, charId, startedAt, kind)) return null;

  // Trained-or-better skills + lores, for the Retrain "from" picker.
  const skillOptions = [
    ...Object.entries(charData?.skillProficiencies || {})
      .filter(([, rank]) => rank >= 1)
      .map(([id]) => cap(id)),
    ...(charData?.loreSkills || []).filter((l) => (l.proficiency || 0) >= 1).map((l) => `${l.name} Lore`),
  ];
  const featOptions = (charData?.feats || []).map((f) => f.name);
  const fromIsSelect = retrainType === 'Feat' || retrainType === 'Skill';
  const fromOptions = retrainType === 'Feat' ? featOptions : retrainType === 'Skill' ? skillOptions : [];

  const append = (entry) =>
    setResults((prev) => ({ entries: [...(prev?.entries || []), entry] }));

  const submitRetrain = () => {
    append(buildRetrainResult({
      charId, charName: character?.name, retrainType, fromLabel, toLabel, startedAt,
    }));
  };
  const submitResearch = () => {
    append(buildResearchResult({ charId, charName: character?.name, topic: topic.trim(), startedAt }));
  };

  const canSubmitRetrain = !!retrainType && !!fromLabel.trim() && !!toLabel.trim();
  const canSubmitResearch = !!topic.trim();

  return (
    <div className="dc-wrap">
      <div className="dc-header">
        <span className="dc-title">{activity} — benchmark reached</span>
        <span className="dc-sub">{benchmarkDays} day{benchmarkDays === 1 ? '' : 's'}</span>
      </div>

      {isResearch ? (
        <>
          <label className="dc-field">
            Topic / goal
            <input
              className="dc-input"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What did you research?"
              aria-label="Research topic"
            />
          </label>
          <p className="dc-note">The GM resolves what this unlocks (Research Topics, #206).</p>
          <button className="dc-submit-btn" onClick={submitResearch} disabled={!canSubmitResearch}>
            Submit for GM
          </button>
        </>
      ) : (
        <>
          <label className="dc-field">
            Retraining
            <select
              className="dc-select"
              value={retrainType}
              onChange={(e) => { setRetrainType(e.target.value); setFromLabel(''); }}
              aria-label="Retrain type"
            >
              <option value="">— what are you retraining? —</option>
              {RETRAIN_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>

          {retrainType && (
            <label className="dc-field">
              From
              {fromIsSelect ? (
                <select
                  className="dc-select"
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  aria-label="Retrain from"
                >
                  <option value="">— select —</option>
                  {fromOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input
                  className="dc-input"
                  value={fromLabel}
                  onChange={(e) => setFromLabel(e.target.value)}
                  placeholder="What you're replacing"
                  aria-label="Retrain from"
                />
              )}
            </label>
          )}

          {retrainType && (
            <label className="dc-field">
              To
              <input
                className="dc-input"
                value={toLabel}
                onChange={(e) => setToLabel(e.target.value)}
                placeholder="What you're taking instead"
                aria-label="Retrain to"
              />
            </label>
          )}

          <button className="dc-submit-btn" onClick={submitRetrain} disabled={!canSubmitRetrain}>
            Submit for GM
          </button>
        </>
      )}
    </div>
  );
};

export default DowntimeCompletion;
