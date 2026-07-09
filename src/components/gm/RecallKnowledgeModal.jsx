import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSession } from '../../contexts/SessionContext';
import { KNOWLEDGE_SKILLS, recallKnowledgeDC } from '../../utils/recallKnowledge';
import { useSessionLog } from '../../hooks/useSessionLog';
import './RecallKnowledgeModal.css';
import { APP } from '../../sync/keys';

const SKILL_LABELS = {
  arcana:    'Arcana',
  nature:    'Nature',
  occultism: 'Occultism',
  religion:  'Religion',
  society:   'Society',
};

const RARITY_OPTIONS = [
  { value: 'common',   label: 'Common'   },
  { value: 'uncommon', label: 'Uncommon' },
  { value: 'rare',     label: 'Rare'     },
  { value: 'unique',   label: 'Unique'   },
];

let _reqCounter = 0;

const RecallKnowledgeModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();

  const [label,  setLabel]  = useState('');
  const [skill,  setSkill]  = useState('arcana');
  const [dc,     setDc]     = useState('');
  const [level,  setLevel]  = useState('');
  const [rarity, setRarity] = useState('common');
  const [target, setTarget] = useState('all');

  const suggestedDc = (level !== '' && !isNaN(parseInt(level, 10)))
    ? recallKnowledgeDC(parseInt(level, 10), rarity)
    : null;

  const canSend = dc !== '' && parseInt(dc, 10) > 0 && (characters || []).length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const dcNum = parseInt(dc, 10);
    const reqIdBase = `skill-${Date.now()}-${++_reqCounter}`;
    const targets = target === 'all'
      ? (characters || [])
      : (characters || []).filter((c) => c.id === target);

    for (const c of targets) {
      sendUpdate(c.id, APP.SKILLPROMPT, {
        reqId:  `${reqIdBase}-${c.id}`,
        skill,
        dc:     dcNum,
        label:  label.trim() || undefined,
      });
    }
    const skillLabel = SKILL_LABELS[skill] || skill;
    const targetLabel = target === 'all' ? 'all characters' : (targets[0]?.name ?? target);
    const subjectStr = label.trim() ? ` — ${label.trim()}` : '';
    appendEvent({ type: 'recall', text: `${skillLabel} DC ${dcNum}${subjectStr} → ${targetLabel}` });
    handleClose();
  };

  const handleClose = () => {
    setLabel('');
    setDc('');
    setLevel('');
    setRarity('common');
    setTarget('all');
    onClose();
  };

  const handleUseSuggested = () => {
    if (suggestedDc !== null) setDc(String(suggestedDc));
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Recall Knowledge" maxWidth="440px">
      <div className="rk-body">

        <div className="rk-row">
          <label htmlFor="rk-label">Creature / Subject</label>
          <input
            id="rk-label"
            type="text"
            placeholder="e.g. Dragon, Skeleton Knight…"
            aria-label="creature or subject label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div className="rk-row">
          <label htmlFor="rk-skill">Knowledge Skill</label>
          <select
            id="rk-skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            aria-label="knowledge skill"
          >
            {KNOWLEDGE_SKILLS.map((s) => (
              <option key={s} value={s}>{SKILL_LABELS[s]}</option>
            ))}
          </select>
        </div>

        <div className="rk-dc-section">
          <div className="rk-dc-inputs">
            <div className="rk-row rk-row--inline">
              <label htmlFor="rk-level">Creature Level</label>
              <input
                id="rk-level"
                type="number"
                min="-1"
                max="25"
                placeholder="—"
                aria-label="creature level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
              />
            </div>
            <div className="rk-row rk-row--inline">
              <label htmlFor="rk-rarity">Rarity</label>
              <select
                id="rk-rarity"
                value={rarity}
                onChange={(e) => setRarity(e.target.value)}
                aria-label="creature rarity"
              >
                {RARITY_OPTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          </div>

          {suggestedDc !== null && (
            <div className="rk-dc-suggest">
              <span className="rk-dc-suggest-label">Suggested DC:</span>
              <span className="rk-dc-suggest-value">{suggestedDc}</span>
              <button
                type="button"
                className="rk-dc-use-btn"
                onClick={handleUseSuggested}
                aria-label={`Use suggested DC ${suggestedDc}`}
              >
                Use
              </button>
            </div>
          )}

          <div className="rk-row">
            <label htmlFor="rk-dc">DC</label>
            <input
              id="rk-dc"
              type="number"
              min="1"
              placeholder="DC"
              aria-label="recall knowledge DC"
              value={dc}
              onChange={(e) => setDc(e.target.value)}
            />
          </div>
        </div>

        <div className="rk-row">
          <label htmlFor="rk-target">Send To</label>
          <select
            id="rk-target"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            aria-label="target characters"
          >
            <option value="all">All Characters</option>
            {(characters || []).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <button
          type="button"
          className="btn-primary rk-send-btn"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Send recall knowledge prompt"
        >
          Send Prompt
        </button>
      </div>
    </Modal>
  );
};

export default RecallKnowledgeModal;
