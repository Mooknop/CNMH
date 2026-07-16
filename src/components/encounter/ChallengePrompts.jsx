import React, { useState, useEffect, useCallback } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useEncounter } from '../../hooks/useEncounter';
import { useTurnState } from '../../hooks/useTurnState';
import { computeSaveDegree } from '../../utils/saveDegree';
import { degreeLabel, degreeClass } from '../../utils/degreeDisplay';
import {
  vpForDegree,
  skillLabel,
  normalizeChallenges,
  normalizeResults,
  entriesFor,
  poolFor,
  isFailing,
  isInfluence,
  roundFor,
  effectiveDc,
  CHALLENGE_MODES,
} from '../../utils/victoryPoints';
import ActionSymbol from '../shared/ActionSymbol';
import VpResultsCollector from '../shared/VpResultsCollector';
import './SavePrompt.css';
import './ChallengePrompts.css';
import { APP, syncKey, globalKey } from '../../sync/keys';

/**
 * One card per active VP challenge targeting this character (#1470).
 * Challenges derive from cnmh_vpchallenge_global (no per-PC prompt push);
 * results append to this character's cnmh_vpresult_<charId> entry lists —
 * only the owning client writes that key, so submissions never race.
 *
 * mode 'once':     one locked attempt for the challenge's lifetime.
 * mode 'perRound': DURING COMBAT the action cost is the only limiter — a PC
 *                  may spend all three actions on the same track in one turn
 *                  (#1469: fight, Bolster, or talk, freely). The
 *                  once-per-round lock applies only to GM-paced scene rounds
 *                  outside combat (GMG cadence), where no action economy
 *                  exists to do the limiting.
 * actionCost > 0:  submitting during an active encounter spends the cost
 *                  from the character's turn state (3-action economy).
 */
const ChallengeCard = ({ challenge, entries, round, combatActive, skillModifiers, onSubmit, pool, failing }) => {
  const [d20Input, setD20Input] = useState('');
  const [chosenSkill, setChosenSkill] = useState(null);

  const perRound = challenge.mode === CHALLENGE_MODES.PER_ROUND;
  const roundEntries = entries.filter((e) => e.round === round);
  const latest = roundEntries[roundEntries.length - 1];
  const locked = perRound ? (!combatActive && !!latest) : entries.length > 0;
  const shown = perRound ? latest : entries[entries.length - 1];
  const myTotal = entries.reduce((sum, e) => sum + (e.vp ?? 0), 0);

  // A new round reopens a per-round card — clear the previous round's entry UI.
  useEffect(() => {
    setD20Input('');
    setChosenSkill(null);
  }, [round, challenge.id]);

  const options = Array.isArray(challenge.skills) ? challenge.skills : [];
  const selected = locked
    ? options.find((o) => o.skill === shown?.skill) || null
    : options.length === 1
      ? options[0]
      : options.find((o) => o.skill === chosenSkill) || null;

  const handleSubmit = () => {
    if (!selected || locked) return;
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const modifier = skillModifiers[selected.skill] ?? 0;
    const total = d20 + modifier;
    const degree = computeSaveDegree({ d20, total, dc: selected.dc });
    onSubmit(challenge, selected, { d20, total, degree, vp: vpForDegree(degree) });
    // In combat the card stays open for further action-costed attempts.
    setD20Input('');
    setChosenSkill(null);
  };

  const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);
  const showChooser = !locked && options.length > 1;
  const degreeInfo = shown
    ? { label: degreeLabel(shown.degree), cls: degreeClass(shown.degree) }
    : null;

  return (
    <div
      className="save-prompt challenge-card"
      role="region"
      aria-label={`${challenge.name} challenge prompt`}
    >
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">⚔️</span>
        <span className="save-prompt-title">{challenge.name}</span>
        <span className="challenge-badges">
          {perRound && <span className="challenge-mode-chip">each round</span>}
          {challenge.actionCost > 0 && (
            <span className="challenge-cost" aria-label={`costs ${challenge.actionCost} action${challenge.actionCost === 1 ? '' : 's'}`}>
              <ActionSymbol cost={challenge.actionCost} />
            </span>
          )}
        </span>
      </div>

      {showChooser && (
        <div className="skill-choices" role="radiogroup" aria-label="Choose a skill">
          {options.map((o) => (
            <button
              key={o.skill}
              type="button"
              role="radio"
              aria-checked={chosenSkill === o.skill}
              className={`skill-choice${chosenSkill === o.skill ? ' skill-choice--selected' : ''}`}
              onClick={() => setChosenSkill(o.skill)}
            >
              <span className="skill-choice-name">{skillLabel(o.skill)}</span>
              <span className="skill-choice-dc">DC {o.dc}</span>
              <span className="skill-choice-mod">{fmtMod(skillModifiers[o.skill] ?? 0)}</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="save-prompt-details">
          <span className="save-prompt-type">{skillLabel(selected.skill)}</span>
          <span className="save-prompt-dc">DC {selected.dc}</span>
          <span className="save-prompt-mod">Your modifier: {fmtMod(skillModifiers[selected.skill] ?? 0)}</span>
        </div>
      )}

      {!locked && (
        <div className="save-prompt-entry">
          <input
            type="number"
            min="1"
            max="20"
            className="save-prompt-input"
            placeholder="d20"
            aria-label={`${challenge.name} d20 roll`}
            value={d20Input}
            onChange={(e) => setD20Input(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={!selected || d20Input === '' || parseInt(d20Input, 10) < 1 || parseInt(d20Input, 10) > 20}
            aria-label={selected ? `Submit ${skillLabel(selected.skill)} check` : 'Submit check'}
          >
            Submit
          </button>
        </div>
      )}

      {shown && degreeInfo && (
        <div className={`save-result ${degreeInfo.cls}`} role="status" aria-label="Skill check result">
          <span className="save-result-total">{shown.total}</span>
          <span className="save-result-degree">{degreeInfo.label}</span>
          <span className="save-result-vp">
            {shown.vp >= 0 ? '+' : ''}{shown.vp} VP
          </span>
        </div>
      )}

      {(perRound && (locked || entries.length > 0)) && (
        <div className="challenge-footer">
          {locked && <span className="challenge-next-round">Locked — again next round</span>}
          <span className="challenge-my-total" aria-label="your total contribution">
            Your total: {myTotal >= 0 ? '+' : ''}{myTotal} VP
          </span>
        </div>
      )}

      <div className="challenge-pool" data-failing={failing || undefined}>
        <span aria-label={`${challenge.name} party pool`}>
          Party: {pool}{challenge.threshold > 0 ? ` / ${challenge.threshold}` : ''} VP
        </span>
        {failing && <span className="challenge-failing">FAILING</span>}
      </div>
    </div>
  );
};

/**
 * Influence-track card (#205): the conversation with an NPC. Two check
 * groups — Discovery (learn which skills sway the NPC) and Influence.
 * DURING COMBAT neither group locks: every attempt costs actions, so a PC
 * can stand there and talk for all three actions if they choose (#1469).
 * In GM-paced scenes outside combat, each group locks once per scene round
 * (GMG cadence). Influence DCs stay masked ("DC ?") until the GM reveals
 * the skill; the GM's global dcModifier (resistances/weaknesses) silently
 * shifts every DC at submit time. No party pool or VP chips here — the AP
 * keeps influence totals GM-paced.
 */
const InfluenceCard = ({ challenge, entries, round, combatActive, skillModifiers, onSubmit }) => {
  const [d20Input, setD20Input] = useState('');
  const [chosen, setChosen] = useState(null);  // { kind: 'discovery'|'influence', skill }

  const discoveries = Array.isArray(challenge.discoveries) ? challenge.discoveries : [];
  const influences = Array.isArray(challenge.skills) ? challenge.skills : [];
  const revealed = new Set(challenge.revealed || []);

  const roundEntries = entries.filter((e) => e.round === round);
  const lockedDiscovery = !combatActive && roundEntries.some((e) => e.discovery);
  const lockedInfluence = !combatActive && roundEntries.some((e) => !e.discovery);

  useEffect(() => {
    setD20Input('');
    setChosen(null);
  }, [round, challenge.id]);

  const selected = (() => {
    if (!chosen) return null;
    const list = chosen.kind === 'discovery' ? discoveries : influences;
    const opt = list.find((o) => o.skill === chosen.skill);
    return opt ? { ...opt, discovery: chosen.kind === 'discovery' } : null;
  })();
  const selectedLocked = selected
    ? (selected.discovery ? lockedDiscovery : lockedInfluence)
    : false;

  const handleSubmit = () => {
    if (!selected || selectedLocked) return;
    const d20 = parseInt(d20Input, 10);
    if (isNaN(d20) || d20 < 1 || d20 > 20) return;
    const modifier = skillModifiers[selected.skill] ?? 0;
    const total = d20 + modifier;
    const dc = effectiveDc(challenge, selected.dc);
    const degree = computeSaveDegree({ d20, total, dc });
    onSubmit(challenge, { ...selected, dc }, {
      d20,
      total,
      degree,
      vp: selected.discovery ? 0 : vpForDegree(degree),
      discovery: selected.discovery,
    });
    setD20Input('');
    setChosen(null);
  };

  const fmtMod = (m) => (m >= 0 ? `+${m}` : `${m}`);
  const isChosen = (kind, skill) => chosen?.kind === kind && chosen?.skill === skill;

  const renderGroup = (kind, list, groupLocked, dcFor) => {
    if (!list.length) return null;
    const label = kind === 'discovery' ? 'Discover' : 'Influence';
    return (
      <div className="influence-group">
        <span className="influence-group-label">
          {label}
          {groupLocked && <span className="challenge-next-round"> — again next round</span>}
        </span>
        <div className="skill-choices" role="radiogroup" aria-label={`${label} skills`}>
          {list.map((o) => (
            <button
              key={o.skill}
              type="button"
              role="radio"
              aria-checked={isChosen(kind, o.skill)}
              disabled={groupLocked}
              className={`skill-choice${isChosen(kind, o.skill) ? ' skill-choice--selected' : ''}`}
              onClick={() => setChosen({ kind, skill: o.skill })}
            >
              <span className="skill-choice-name">
                {skillLabel(o.skill)}
                {kind === 'influence' && revealed.has(o.skill) && <span aria-label="revealed"> ★</span>}
              </span>
              <span className="skill-choice-dc">{dcFor(o)}</span>
              <span className="skill-choice-mod">{fmtMod(skillModifiers[o.skill] ?? 0)}</span>
            </button>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div
      className="save-prompt challenge-card influence-card"
      role="region"
      aria-label={`${challenge.name} influence prompt`}
    >
      <div className="save-prompt-header">
        <span className="save-prompt-icon" aria-hidden="true">💬</span>
        <span className="save-prompt-title">{challenge.name}</span>
        <span className="challenge-badges">
          <span className="challenge-mode-chip">
            Round {round}{challenge.roundsTotal > 0 ? ` / ${challenge.roundsTotal}` : ''}
          </span>
          {challenge.actionCost > 0 && (
            <span className="challenge-cost" aria-label={`costs ${challenge.actionCost} action${challenge.actionCost === 1 ? '' : 's'}`}>
              <ActionSymbol cost={challenge.actionCost} />
            </span>
          )}
        </span>
      </div>

      {renderGroup('discovery', discoveries, lockedDiscovery,
        (o) => `DC ${effectiveDc(challenge, o.dc)}`)}
      {renderGroup('influence', influences, lockedInfluence,
        (o) => (revealed.has(o.skill) ? `DC ${effectiveDc(challenge, o.dc)}` : 'DC ?'))}

      {selected && !selectedLocked && (
        <div className="save-prompt-entry">
          <input
            type="number"
            min="1"
            max="20"
            className="save-prompt-input"
            placeholder="d20"
            aria-label={`${challenge.name} d20 roll`}
            value={d20Input}
            onChange={(e) => setD20Input(e.target.value)}
          />
          <button
            className="btn-primary"
            onClick={handleSubmit}
            disabled={d20Input === '' || parseInt(d20Input, 10) < 1 || parseInt(d20Input, 10) > 20}
            aria-label={`Submit ${skillLabel(selected.skill)} check`}
          >
            Submit
          </button>
        </div>
      )}

      {roundEntries.length > 0 && (
        <ul className="influence-results" aria-label="this round's checks">
          {roundEntries.map((e, i) => (
            <li key={i} className={`save-result ${degreeClass(e.degree)}`}>
              {e.discovery && <span className="influence-disc-tag">Discovery</span>}
              <span className="save-result-skill">{skillLabel(e.skill)}</span>
              <span className="save-result-total">{e.total}</span>
              <span className="save-result-degree">{degreeLabel(e.degree)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const ChallengePrompts = ({ charId, characterName, skillModifiers = {} }) => {
  const { characters } = useContent();
  const [challengesRaw] = useSyncedState(globalKey(APP.VPCHALLENGE), null);
  const [resultsRaw, setResults] = useSyncedState(syncKey(APP.VPRESULT, charId), null);
  const { encounter, appendLog } = useEncounter();
  const { spendActions } = useTurnState(charId);

  // Party-wide result values feed the live pool display (#1471) — the pool
  // sums every character's checks plus GM meter adjustments.
  const [partyResults, setPartyResults] = useState({});
  const onPartyResult = useCallback((id, res) => {
    setPartyResults((prev) => (prev[id] === res ? prev : { ...prev, [id]: res }));
  }, []);

  const challenges = normalizeChallenges(challengesRaw);

  // Self-clean: drop result entries for challenges the GM has ended. Only this
  // client writes its own vpresult key, so the rewrite cannot race the GM.
  // Strictly a no-op when nothing is stale — never write an unchanged value.
  const activeIds = Object.keys(challenges).sort().join('|');
  useEffect(() => {
    if (!activeIds) return;
    const keep = new Set(activeIds.split('|'));
    const map = normalizeResults(resultsRaw);
    const stale = Object.keys(map).filter((id) => !keep.has(id));
    if (!stale.length) return;
    const kept = { ...map };
    for (const id of stale) delete kept[id];
    setResults(kept);
  }, [activeIds, resultsRaw, setResults]);

  const mine = Object.values(challenges)
    .filter((c) => (c.targetIds || []).includes(charId))
    .sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));

  if (!mine.length) return null;

  const handleSubmit = (challenge, selected, { d20, total, degree, vp, discovery }) => {
    const round = roundFor(challenge, encounter);
    const entry = {
      round, skill: selected.skill, d20, total, degree, vp, at: Date.now(),
      ...(discovery ? { discovery: true } : {}),
    };
    setResults((cur) => {
      const map = normalizeResults(cur);
      return { ...map, [challenge.id]: [...(map[challenge.id] ?? []), entry] };
    });
    if (challenge.actionCost > 0 && encounter?.active) {
      spendActions(challenge.actionCost, challenge.name);
    }
    // Influence totals are GM-paced — keep VP deltas out of the shared log.
    const verb = discovery ? 'Discover — ' : '';
    const vpText = discovery || isInfluence(challenge)
      ? ''
      : ` (${vp >= 0 ? '+' : ''}${vp} VP)`;
    appendLog({
      type: 'action',
      charId,
      text: `${characterName} — ${challenge.name}: ${verb}${skillLabel(selected.skill)} (DC ${selected.dc}): ${total} → ${degreeLabel(degree)}${vpText}`,
    });
  };

  const roster = Array.isArray(characters) ? characters : [];

  return (
    <>
      <VpResultsCollector characters={roster} onResult={onPartyResult} />
      {mine.map((c) => {
        const round = roundFor(c, encounter);
        const combatActive = !!encounter?.active;
        if (isInfluence(c)) {
          return (
            <InfluenceCard
              key={c.id}
              challenge={c}
              entries={entriesFor(resultsRaw, c.id)}
              round={round}
              combatActive={combatActive}
              skillModifiers={skillModifiers}
              onSubmit={handleSubmit}
            />
          );
        }
        const targetValues = (c.targetIds || []).map((id) => partyResults[id]);
        const pool = poolFor(c, targetValues);
        return (
          <ChallengeCard
            key={c.id}
            challenge={c}
            entries={entriesFor(resultsRaw, c.id)}
            round={round}
            combatActive={combatActive}
            skillModifiers={skillModifiers}
            onSubmit={handleSubmit}
            pool={pool}
            failing={isFailing(c, pool)}
          />
        );
      })}
    </>
  );
};

export default ChallengePrompts;
