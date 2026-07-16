import React, { useState } from 'react';
import Modal from '../shared/Modal';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useSessionLog } from '../../hooks/useSessionLog';
import { SKILL_ABILITY_MAP } from '../../utils/CharacterUtils';
import { skillLabel, normalizeChallenges, CHALLENGE_MODES } from '../../utils/victoryPoints';
import './SkillChallengeModal.css';
import { APP, globalKey } from '../../sync/keys';

const SKILL_KEYS = Object.keys(SKILL_ABILITY_MAP);

const emptySkillRow = () => ({ skill: 'diplomacy', dc: '' });
const emptyTierRow = () => ({ at: '', note: '' });

/**
 * GM quick action (#205): configure a GMG Influence encounter and launch it
 * as an influence track on the shared challenge collection. Runs on combat
 * rounds during an encounter (checks cost actions) or on GM-advanced scene
 * rounds otherwise; the live scene controls (DC stepper, reveals, tiers)
 * live on the dashboard card, not here.
 */
const InfluenceSetupModal = ({ isOpen, onClose }) => {
  const { characters } = useContent();
  const { appendEvent } = useSessionLog();
  const [, setChallenges] = useSyncedState(globalKey(APP.VPCHALLENGE), null);

  const [name,        setName]        = useState('');
  const [roundsTotal, setRoundsTotal] = useState('');
  const [target,      setTarget]      = useState('all');
  const [actionCost,  setActionCost]  = useState('1');
  const [influence,   setInfluence]   = useState([emptySkillRow()]);
  const [discovery,   setDiscovery]   = useState([]);
  const [tiers,       setTiers]       = useState([emptyTierRow()]);
  const [resistNote,  setResistNote]  = useState('');

  const rowEditors = (rows, setRows, empty) => ({
    update: (idx, patch) => setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r))),
    add: () => setRows((prev) => [...prev, empty()]),
    remove: (idx) => setRows((prev) => prev.filter((_, i) => i !== idx)),
  });
  const inf = rowEditors(influence, setInfluence, emptySkillRow);
  const disc = rowEditors(discovery, setDiscovery, emptySkillRow);
  const tier = rowEditors(tiers, setTiers, emptyTierRow);

  const validSkillRows = (rows) => rows.every((r) => parseInt(r.dc, 10) > 0);
  const filledTiers = tiers.filter((t) => t.at !== '' || t.note.trim() !== '');
  const canSend =
    name.trim() !== '' &&
    influence.length > 0 &&
    validSkillRows(influence) &&
    validSkillRows(discovery) &&
    filledTiers.every((t) => parseInt(t.at, 10) > 0) &&
    (characters || []).length > 0;

  const handleSend = () => {
    if (!canSend) return;
    const targets = target === 'all'
      ? (characters || [])
      : (characters || []).filter((c) => c.id === target);
    const id = `inf-${Date.now()}`;
    const roundsNum = parseInt(roundsTotal, 10);

    const doc = {
      id,
      kind: 'influence',
      name: name.trim(),
      skills: influence.map((r) => ({ skill: r.skill, dc: parseInt(r.dc, 10) })),
      discoveries: discovery.map((r) => ({ skill: r.skill, dc: parseInt(r.dc, 10) })),
      tiers: filledTiers
        .map((t) => ({ at: parseInt(t.at, 10), note: t.note.trim() }))
        .sort((a, b) => a.at - b.at),
      revealed: [],
      resistNote: resistNote.trim(),
      dcModifier: 0,
      roundsTotal: roundsNum >= 1 ? roundsNum : null,
      sceneRound: 1,
      threshold: null,
      mode: CHALLENGE_MODES.PER_ROUND,
      actionCost: parseInt(actionCost, 10) || 0,
      target,
      targetIds: targets.map((c) => c.id),
      adjust: 0,
      drainPerRound: 0,
      lastDrainRound: null,
      createdAt: Date.now(),
    };
    setChallenges((cur) => ({ ...normalizeChallenges(cur), [id]: doc }));

    const targetLabel = target === 'all' ? 'all characters' : (targets[0]?.name ?? target);
    appendEvent({
      type: 'challenge',
      text: `Influence encounter "${name.trim()}" — ${doc.skills.map((s) => skillLabel(s.skill)).join(', ')}${doc.roundsTotal ? `, ${doc.roundsTotal} rounds` : ''} → ${targetLabel}`,
    });
    handleClose();
  };

  const handleClose = () => {
    setName('');
    setRoundsTotal('');
    setTarget('all');
    setActionCost('1');
    setInfluence([emptySkillRow()]);
    setDiscovery([]);
    setTiers([emptyTierRow()]);
    setResistNote('');
    onClose();
  };

  const renderSkillRows = (label, rows, editors, minRows) => (
    <div className="sc-skills-section">
      <span className="sc-skills-heading">{label}</span>
      {rows.map((row, idx) => (
        <div className="sc-skill-row" key={idx}>
          <select
            value={row.skill}
            onChange={(e) => editors.update(idx, { skill: e.target.value })}
            aria-label={`${label} skill ${idx + 1}`}
          >
            {SKILL_KEYS.map((s) => (
              <option key={s} value={s}>{skillLabel(s)}</option>
            ))}
          </select>
          <input
            type="number"
            min="1"
            placeholder="DC"
            aria-label={`${label} skill ${idx + 1} DC`}
            value={row.dc}
            onChange={(e) => editors.update(idx, { dc: e.target.value })}
          />
          <button
            type="button"
            className="sc-remove-btn"
            onClick={() => editors.remove(idx)}
            disabled={rows.length <= minRows}
            aria-label={`Remove ${label} skill ${idx + 1}`}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        className="sc-add-btn"
        onClick={editors.add}
        aria-label={`Add ${label} skill`}
      >
        + Add skill
      </button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Influence Encounter" maxWidth="520px">
      <div className="sc-body">

        <div className="sc-row">
          <label htmlFor="inf-name">NPC Name</label>
          <input
            id="inf-name"
            type="text"
            placeholder="e.g. Nualia's Spirit"
            aria-label="influence npc name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {renderSkillRows('Influence', influence, inf, 1)}
        {renderSkillRows('Discovery', discovery, disc, 0)}

        <div className="sc-skills-section">
          <span className="sc-skills-heading">Thresholds</span>
          {tiers.map((row, idx) => (
            <div className="sc-skill-row sc-tier-row" key={idx}>
              <input
                type="number"
                min="1"
                placeholder="pts"
                aria-label={`threshold ${idx + 1} points`}
                value={row.at}
                onChange={(e) => tier.update(idx, { at: e.target.value })}
              />
              <input
                type="text"
                placeholder="GM note revealed at this tier"
                aria-label={`threshold ${idx + 1} note`}
                value={row.note}
                onChange={(e) => tier.update(idx, { note: e.target.value })}
              />
              <button
                type="button"
                className="sc-remove-btn"
                onClick={() => tier.remove(idx)}
                disabled={tiers.length === 1}
                aria-label={`Remove threshold ${idx + 1}`}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="sc-add-btn"
            onClick={tier.add}
            aria-label="Add threshold"
          >
            + Add threshold
          </button>
        </div>

        <div className="sc-row">
          <label htmlFor="inf-resist">Resistances / Weaknesses</label>
          <textarea
            id="inf-resist"
            rows={2}
            placeholder="e.g. +2 all DCs on failed Sandpoint mention (+4 crit); −4 after censuring Tobyn"
            aria-label="resistances note"
            value={resistNote}
            onChange={(e) => setResistNote(e.target.value)}
          />
        </div>

        <div className="sc-inline">
          <div className="sc-row sc-row--inline">
            <label htmlFor="inf-rounds">Rounds</label>
            <input
              id="inf-rounds"
              type="number"
              min="1"
              placeholder="e.g. 10"
              aria-label="total rounds"
              value={roundsTotal}
              onChange={(e) => setRoundsTotal(e.target.value)}
            />
          </div>
          <div className="sc-row sc-row--inline">
            <label htmlFor="inf-cost">Action Cost</label>
            <select
              id="inf-cost"
              value={actionCost}
              onChange={(e) => setActionCost(e.target.value)}
              aria-label="action cost"
            >
              <option value="0">Free</option>
              <option value="1">1 action</option>
              <option value="2">2 actions</option>
              <option value="3">3 actions</option>
            </select>
          </div>
          <div className="sc-row sc-row--inline">
            <label htmlFor="inf-target">Send To</label>
            <select
              id="inf-target"
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
        </div>

        <button
          type="button"
          className="btn-primary sc-send-btn"
          onClick={handleSend}
          disabled={!canSend}
          aria-label="Start influence encounter"
        >
          Start Influence Encounter
        </button>
      </div>
    </Modal>
  );
};

export default InfluenceSetupModal;
