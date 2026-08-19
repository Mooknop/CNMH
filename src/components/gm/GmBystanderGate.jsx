import React from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { useContent } from '../../contexts/ContentContext';
import { useCharacter } from '../../hooks/useCharacter';
import { useBystander } from '../../hooks/useBystander';
import { rkKeyFor } from '../../utils/recallKnowledge';
import { armedSenseMotiveHint, isNonAllyEntry } from '../../utils/bystander';
import { expiryLabelSecs } from '../../utils/expiry';
import './GmBystanderGate.css';

// GM-facing reaction gate for Harmless Bystander (#465). Rendered on the foe's
// turn pane, where the GM decides what this creature does: it answers "may this
// enemy react against that PC, and if not, why not" without the GM having to
// remember who declared what.
//
// One line per declaring PC, in the creature's own terms:
//   • suppressed — this foe cannot use reactions against her at all (plus the
//     +4 Sense Motive hint when she's visibly armed, so the GM's manual Sense
//     Motive roll gets the modifier the feat calls for);
//   • immune — it watched her turn hostile within the last day, so the trick
//     simply doesn't work on it and it acts normally;
//   • recognized — she already acted hostile this fight; reactions are live.
//
// The Sense Motive roll itself stays a GM call; this only surfaces the state.

// One PC's status against this creature. Its own component so each holds its
// own useBystander/useCharacter subscription (the GmInitiativePanel row
// pattern) — hooks can't run in a loop.
const GateLine = ({ pcEntry, character, creatureKey, foeName }) => {
  const { active, revealed, immune, nowSecs, isImmune, suppressedAgainst } =
    useBystander(pcEntry.charId);
  const model = useCharacter(character);

  if (!active) return null;

  const pcName = pcEntry.name || character?.name || 'That PC';
  const immuneHere = isImmune(creatureKey);

  if (revealed) {
    return (
      <p className="gm-bystander-gate-line gm-bystander-gate-line--off" role="note">
        <span aria-hidden="true">🎭</span> {pcName} was recognized as hostile — reactions
        against them are live again.
      </p>
    );
  }

  if (immuneHere) {
    const until = expiryLabelSecs(immune?.[creatureKey]?.expireAtSecs, nowSecs);
    return (
      <p className="gm-bystander-gate-line gm-bystander-gate-line--off" role="note">
        <span aria-hidden="true">🎭</span> {pcName}&apos;s Harmless Bystander does not work
        on {foeName} — it saw them fight{until ? ` today (immune until ${until})` : ' recently'}.
        It reacts normally.
      </p>
    );
  }

  if (!suppressedAgainst(creatureKey)) return null;

  const armed = armedSenseMotiveHint(model?.inventory);
  return (
    <p className="gm-bystander-gate-line gm-bystander-gate-line--block" role="note">
      <span aria-hidden="true">🎭</span> <strong>Harmless Bystander — no reactions vs {pcName}.</strong>{' '}
      {foeName} must Sense Motive to read them as hostile
      {armed.armed
        ? `, with a +${armed.bonus} circumstance bonus (${pcName} is wielding ${armed.weapons.join(' and ')})`
        : ''}
      .
    </p>
  );
};

/**
 * @param {Object} entry - the enemy/ally order entry whose turn pane this is
 */
const GmBystanderGate = ({ entry }) => {
  const { encounter } = useEncounter();
  const { characters } = useContent();
  const creatureKey = rkKeyFor(entry);
  const pcEntries = (encounter?.order || []).filter((e) => e?.kind === 'pc' && e.charId);

  // Only a NON-ALLY is fooled — a friendly-disposition NPC on the same pane
  // (#1537 S6) is an ally and reacts freely.
  if (!isNonAllyEntry(entry) || !creatureKey || pcEntries.length === 0) return null;

  return (
    // :empty hides the box when no PC is hiding — the lines decide for
    // themselves, so the parent can't know before they render.
    <div className="gm-bystander-gate" data-testid="gm-bystander-gate">
      {pcEntries.map((e) => (
        <GateLine
          key={e.entryId}
          pcEntry={e}
          character={(characters || []).find((c) => c.id === e.charId) || null}
          creatureKey={creatureKey}
          foeName={entry?.name || 'This creature'}
        />
      ))}
    </div>
  );
};

export default GmBystanderGate;
