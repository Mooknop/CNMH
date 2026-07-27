import React, { useState } from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useBystander } from '../../hooks/useBystander';
import { useInitiativeRoll } from '../../hooks/useInitiativeRoll';
import { hasFeat } from '../../utils/CharacterUtils';
import RollEntry from '../shared/RollEntry';
import './InitiativeEntry.css';
import { APP, globalKey } from '../../sync/keys';

const fmtMod = (n) => `${n >= 0 ? '+' : ''}${n}`;
const skillLabel = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

// Setup-phase banner shown above the hands strip in the Encounter tab. Each player
// enters their roll into their own sheet — the GM panel waits until every
// entry has a number before enabling "Begin Round 1". Renders nothing
// outside the setup phase or for characters that aren't in the order
// (so e.g. a viewing-only screen stays empty).
//
// Two paths, branched on encounter.foundryCombatId:
//   • App-only encounter — the original flow: the player types a total (or, with
//     Harmless Bystander, a d20 we add Deception to) straight into the shared
//     cnmh_encounter_global order via setInitiative.
//   • Foundry-linked encounter (#494 Slice 2) — the player enters a d20 and picks
//     an initiative skill; the app adds the skill modifier + Scout +1 and writes
//     the result to the per-player cnmh_initroll_<charId> key. Writing into the
//     order is a dead end there — the bridge clobbers it on the next updateCombat —
//     so this survives-the-push channel is the only place player rolls can live
//     until Slice 3 commits them into Foundry.
//
// Harmless Bystander (#226 Slice D): if the character has the feat, a toggle
// switches the entry into "roll a d20, we add your Deception modifier" mode.
const InitiativeEntry = ({ charId: charIdProp, character }) => {
  const charId = character?.id ?? charIdProp;
  const { encounter, setInitiative } = useEncounter();
  const [scoutBonusCharId] = useSyncedState(globalKey(APP.SCOUTBONUS), null);
  const model = useCharacter(character);
  const { active: bystanderActive, declare, clear } = useBystander(charId);
  const { roll, submit } = useInitiativeRoll(charId);
  const [d20, setD20] = useState('');
  const [skill, setSkill] = useState('perception');
  const [editing, setEditing] = useState(false);

  if (!encounter || encounter.phase !== 'setup') return null;
  const entry = (encounter.order || []).find(
    (e) => e && e.kind === 'pc' && e.charId === charId
  );
  if (!entry) return null;

  const hasBystander = !!character && hasFeat(character, 'Harmless Bystander');
  const foundryLinked = !!encounter.foundryCombatId;
  // Scout gives the *entire group* the +1 circumstance bonus — the scout
  // included — so the id on the key marks who is scouting, not who to skip. (#1628)
  const scoutActive = !!scoutBonusCharId;

  const scoutReminder = scoutActive ? (
    <div className="initiative-entry-scout">
      +1 circumstance bonus to initiative — Scout active
    </div>
  ) : null;

  // ── Foundry-linked path: d20 + skill → per-player cnmh_initroll_<charId> ──
  if (foundryLinked) {
    // Bystander forces Deception; otherwise the player's selected skill drives it.
    const effectiveSkill = bystanderActive ? 'deception' : skill;
    const skillMod = model?.skillModifiers?.[effectiveSkill] ?? 0;
    const scoutBonus = scoutActive ? 1 : 0;
    const totalMod = skillMod + scoutBonus;
    const d20Num = d20 === '' ? null : Number(d20);
    const total = d20Num === null ? null : d20Num + totalMod;

    const skillOptions = (() => {
      const keys = Object.keys(model?.skillModifiers || {});
      const others = keys.filter((k) => k !== 'perception').sort();
      return ['perception', ...others];
    })();

    const submitted = !!roll && !editing;

    // RollEntry records the face only — its own onCommit fires on a Foundry
    // ack (roll+commit are one tap there), but committing THIS banner's entry
    // stays gated on the explicit Submit button below, unchanged from before
    // the RollEntry swap (#1686).
    const handleFaceChange = (face) => setD20(face == null ? '' : String(face));

    const handleBystanderToggle = (on) => {
      if (on) declare('deception');
      else clear();
    };

    const handleSubmit = () => {
      if (d20Num === null) return;
      submit({ d20: d20Num, mod: totalMod, total, skill: effectiveSkill });
      setEditing(false);
    };

    const handleReenter = () => {
      setD20(roll?.d20 != null ? String(roll.d20) : '');
      if (roll?.skill && !bystanderActive) setSkill(roll.skill);
      setEditing(true);
    };

    return (
      <div className="initiative-entry" role="region" aria-label="Initiative entry">
        {scoutReminder}
        <div className="initiative-entry-inner">
          <div className="initiative-entry-prompt">
            <strong>Roll for initiative.</strong> Enter your d20 — the app adds your
            modifier and the GM starts the encounter once everyone&apos;s in.
          </div>

          {hasBystander && (
            <label className="initiative-entry-bystander">
              <input
                type="checkbox"
                aria-label="harmless-bystander-toggle"
                checked={bystanderActive}
                onChange={(e) => handleBystanderToggle(e.target.checked)}
              />
              <span>Harmless Bystander — roll Deception ({fmtMod(model?.skillModifiers?.deception ?? 0)}) instead of Perception</span>
            </label>
          )}

          {submitted ? (
            <div className="initiative-entry-submitted">
              <span className="initiative-entry-submitted-flag" aria-label="initiative-submitted">
                Submitted ✓
              </span>
              <span className="initiative-entry-breakdown" aria-label="initiative-breakdown">
                d20 {roll.d20} {skillLabel(roll.skill)} = {roll.total}
              </span>
              <button type="button" className="initiative-entry-reenter" onClick={handleReenter}>
                Re-enter
              </button>
            </div>
          ) : (
            <>
              <label className="initiative-entry-field">
                <span>Initiative skill</span>
                <select
                  aria-label="initiative-skill-select"
                  value={effectiveSkill}
                  disabled={bystanderActive}
                  onChange={(e) => setSkill(e.target.value)}
                >
                  {skillOptions.map((s) => (
                    <option key={s} value={s}>
                      {skillLabel(s)} ({fmtMod(model?.skillModifiers?.[s] ?? 0)})
                    </option>
                  ))}
                </select>
              </label>
              <div className="initiative-entry-rollentry">
                <span className="initiative-entry-rollentry-label">Your d20 roll</span>
                <RollEntry
                  face={d20Num}
                  onFaceChange={handleFaceChange}
                  onCommit={handleFaceChange}
                  bonus={totalMod}
                  bonusLabel={skillLabel(effectiveSkill)}
                  dcLine="tap your die to roll for initiative"
                  charId={charId}
                  flavor={`Initiative: ${skillLabel(effectiveSkill)}`}
                />
              </div>
              <div className="initiative-entry-breakdown" aria-label="initiative-breakdown">
                {d20 === ''
                  ? `${skillLabel(effectiveSkill)} ${fmtMod(skillMod)}${scoutBonus ? ' + Scout +1' : ''}`
                  : `d20 ${d20} + ${skillLabel(effectiveSkill)} ${fmtMod(skillMod)}${scoutBonus ? ' + Scout +1' : ''} = ${total}`}
              </div>
              <button
                type="button"
                className="initiative-entry-submit"
                aria-label="submit-initiative"
                disabled={d20 === ''}
                onClick={handleSubmit}
              >
                Submit
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  // ── App-only path (unchanged): writes the total into the encounter order ──
  const deceptionMod = model?.skillModifiers?.deception ?? 0;
  const total = d20 === '' ? null : Number(d20) + deceptionMod;

  const handleToggle = (on) => {
    if (on) {
      declare('deception');
      setInitiative(entry.entryId, d20 === '' ? null : Number(d20) + deceptionMod);
    } else {
      clear();
      setD20('');
      setInitiative(entry.entryId, null); // back to manual total entry
    }
  };

  const handleD20 = (value) => {
    setD20(value);
    setInitiative(entry.entryId, value === '' ? null : Number(value) + deceptionMod);
  };

  // No separate commit stage on this app-only path (unlike the Foundry-linked
  // banner above) — a d20 value, typed or rolled, has always written straight
  // into the order via handleD20, so RollEntry's onFaceChange/onCommit both
  // just forward here, matching FoundryDiceInput's prior onValue behavior.
  const handleD20Face = (face) => handleD20(face == null ? '' : String(face));

  return (
    <div className="initiative-entry" role="region" aria-label="Initiative entry">
      {scoutReminder}
      <div className="initiative-entry-inner">
        <div className="initiative-entry-prompt">
          <strong>Roll for initiative.</strong> Enter your roll below — the GM
          will start Round 1 once everyone has theirs in.
        </div>

        {hasBystander && (
          <label className="initiative-entry-bystander">
            <input
              type="checkbox"
              aria-label="harmless-bystander-toggle"
              checked={bystanderActive}
              onChange={(e) => handleToggle(e.target.checked)}
            />
            <span>Harmless Bystander — roll Deception ({fmtMod(deceptionMod)}) instead of Perception</span>
          </label>
        )}

        {bystanderActive ? (
          <>
            <div className="initiative-entry-rollentry">
              <span className="initiative-entry-rollentry-label">Your d20 roll</span>
              <RollEntry
                face={d20 === '' ? null : Number(d20)}
                onFaceChange={handleD20Face}
                onCommit={handleD20Face}
                bonus={deceptionMod}
                bonusLabel="Deception"
                dcLine="tap your die to roll for initiative"
                charId={charId}
                flavor="Initiative: Deception (Bystander)"
              />
            </div>
            <div className="initiative-entry-breakdown" aria-label="initiative-breakdown">
              {d20 === ''
                ? `Deception ${fmtMod(deceptionMod)}`
                : `d20 ${d20} + Deception ${fmtMod(deceptionMod)} = ${total}`}
            </div>
          </>
        ) : (
          <label className="initiative-entry-field">
            <span>Your initiative</span>
            <input
              aria-label="initiative-input"
              type="number"
              value={entry.initiative ?? ''}
              onChange={(e) => setInitiative(entry.entryId, e.target.value)}
            />
          </label>
        )}
      </div>
    </div>
  );
};

export default InitiativeEntry;
