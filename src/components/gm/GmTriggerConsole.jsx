import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useContent } from '../../contexts/ContentContext';
import { getReactions } from '../../utils/actionUtils';
import { TRIGGER_EVENTS, matchingReactions, reactionCoverageGaps } from '../../utils/reactionTriggers';
import { buildReactionPrompt } from '../../utils/reactionPrompt';
import { useAuraMembers } from '../../hooks/useAuraMembers';
import { filterAllyAuraReactions } from '../../utils/auraSources';
import { APP } from '../../sync/keys';

let _reqCounter = 0;

// Which events name a struck ALLY — the ones whose triggers can care whether
// that ally stood inside the reactor's aura.
const ALLY_EVENT_IDS = ['ally-damaged'];

// One probe per PC so each can hold its own membership subscription (a hook
// can't run in a loop). Renders nothing; it reports the reactions this event
// would wake on that PC — already aura-filtered — up to the console, so the
// GM's eligibility line agrees with what the player's device will actually
// offer, and so the fire loop can skip a PC the aura ruled out.
const EligibilityProbe = ({ entry, character, eventId, allyEntryId, onResolve }) => {
  const members = useAuraMembers(entry.charId);
  const all = matchingReactions(getReactions(character), eventId);
  const kept = filterAllyAuraReactions(all, { members, allyEntryId });
  const names = kept.map((r) => r.name).join(', ');
  // The aura took away everything this PC had for the event — distinct from
  // "never had one", which is why the fire loop can skip the former without
  // changing what the latter has always received.
  const blocked = all.length > 0 && kept.length === 0;

  useEffect(() => {
    onResolve(entry.charId, names, blocked);
  }, [onResolve, entry.charId, names, blocked]);

  return null;
};

/**
 * GM reaction-trigger console (#221). One tap broadcasts a trigger event —
 * "ranged attack incoming at <PC>", "<PC> was damaged", … — to the targeted
 * PC devices over cnmh_reactprompt_<charId>. Matching against each PC's
 * declared reaction triggerType happens on the player device (ReactionPrompt),
 * but the console shows the GM which PCs hold a matching reaction so the
 * trigger can be aimed.
 *
 * @param {Array}  pcEntries - encounter order entries where kind === 'pc' and charId is set
 * @param {number} [round]   - current encounter round; stamped on the prompt so it
 *                             expires when the round ends (reaction windows are immediate)
 */
const GmTriggerConsole = ({ pcEntries = [], round }) => {
  const { sendUpdate } = useSession();
  const { appendEvent } = useSessionLog();
  const { characters } = useContent();
  const [eventId, setEventId] = useState(TRIGGER_EVENTS[0].id);
  const [target,  setTarget]  = useState('all');
  const [ally,    setAlly]    = useState('');
  const [note,    setNote]    = useState('');
  // charId → { names, blocked } as resolved by the probes (aura-filtered).
  const [eligibility, setEligibility] = useState({});
  const noteEligibility = useCallback((charId, names, blocked) => {
    setEligibility((cur) => (
      cur[charId]?.names === names && cur[charId]?.blocked === blocked
        ? cur
        : { ...cur, [charId]: { names, blocked } }
    ));
  }, []);

  const event = TRIGGER_EVENTS.find((e) => e.id === eventId) || TRIGGER_EVENTS[0];

  // Naming the struck ally is what lets an aura-scoped trigger ("an enemy
  // damages an ally within 15 feet of you") be answered rather than guessed
  // (#1733 S3). Optional by design: leave it unset and every reaction surfaces,
  // exactly as before.
  const allyRelevant = ALLY_EVENT_IDS.includes(event.id);
  const allyEntry = allyRelevant ? pcEntries.find((e) => e.entryId === ally) : null;
  const allyEntryId = allyEntry?.entryId || undefined;

  const eligible = pcEntries
    .map((entry) => ({ entry, names: eligibility[entry.charId]?.names }))
    .filter((row) => !!row.names);

  // Coverage audit (#278): reaction-cost abilities that will never wake for
  // ANY event fired here — no triggerType authored, or one the engine no
  // longer recognises. Computed per-PC so the GM can spot a dead reaction
  // before relying on it mid-fight, not just after this event comes up empty.
  const coverage = pcEntries
    .map((entry) => {
      const char = (characters || []).find((c) => c.id === entry.charId);
      const { missing, unknown } = reactionCoverageGaps(char);
      return { entry, missing, unknown };
    })
    .filter((row) => row.missing.length > 0 || row.unknown.length > 0);

  if (pcEntries.length === 0) return null;

  const handleFire = () => {
    const reqIdBase = `react-${Date.now()}-${++_reqCounter}`;
    const targets = target === 'all'
      ? pcEntries
      : pcEntries.filter((e) => e.charId === target);

    for (const entry of targets) {
      // Aura ruled this PC's whole matching set out (#1733 S3) — don't send.
      // Only ever true when a struck ally was named AND the bridge pushed a
      // membership snapshot; a PC who simply holds no matching reaction still
      // gets the prompt their device has always quietly discarded.
      if (eligibility[entry.charId]?.blocked) continue;
      sendUpdate(entry.charId, APP.REACTPROMPT, buildReactionPrompt({
        reqId: `${reqIdBase}-${entry.charId}`,
        eventId: event.id,
        label: event.label,
        note: note.trim() || undefined,
        allyEntryId,
        round,
      }));
    }
    const targetLabel = target === 'all' ? 'all PCs' : (targets[0]?.name ?? target);
    const noteStr = note.trim() ? ` — ${note.trim()}` : '';
    appendEvent({ type: 'trigger', text: `Trigger: ${event.label}${noteStr} → ${targetLabel}` });
    setNote('');
  };

  return (
    <div className="gm-save-request gm-trigger-console">
      <h3>Fire Trigger</h3>

      <div className="gm-save-row">
        <label>
          Event
          <select value={eventId} onChange={(e) => setEventId(e.target.value)} aria-label="trigger event">
            {TRIGGER_EVENTS.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </label>

        <label>
          Target
          <select value={target} onChange={(e) => setTarget(e.target.value)} aria-label="trigger target">
            <option value="all">All PCs</option>
            {pcEntries.map((e) => (
              <option key={e.charId} value={e.charId}>{e.name}</option>
            ))}
          </select>
        </label>

        {allyRelevant && (
          <label>
            Struck ally (optional)
            <select value={ally} onChange={(e) => setAlly(e.target.value)} aria-label="struck ally">
              <option value="">Unspecified</option>
              {pcEntries.map((e) => (
                <option key={e.entryId} value={e.entryId}>{e.name}</option>
              ))}
            </select>
          </label>
        )}

        <label>
          Note (optional)
          <input
            type="text"
            className="gm-save-effect"
            placeholder="e.g. archer on the ledge"
            aria-label="trigger note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
      </div>

      {pcEntries.map((entry) => {
        const char = (characters || []).find((c) => c.id === entry.charId);
        return char ? (
          <EligibilityProbe
            key={entry.charId}
            entry={entry}
            character={char}
            eventId={event.id}
            allyEntryId={allyEntryId}
            onResolve={noteEligibility}
          />
        ) : null;
      })}

      <p className="gm-help" aria-label="eligible PCs">
        {eligible.length > 0
          ? `Holds a matching reaction: ${eligible
              .map((e) => `${e.entry.name} (${e.names})`)
              .join(' · ')}`
          : 'No PCs in the encounter have a matching reaction for this event.'}
      </p>

      {coverage.length > 0 && (
        <p className="gm-field-hint gm-field-hint--warning" aria-label="reaction coverage gaps" role="alert">
          Reactions that will never prompt: {coverage
            .map(({ entry, missing, unknown }) => {
              const gaps = [
                ...missing.map((r) => `${r.name} (no trigger type)`),
                ...unknown.map((r) => `${r.name} (unknown: "${r.triggerType}")`),
              ];
              return `${entry.name} — ${gaps.join(', ')}`;
            })
            .join(' · ')}
        </p>
      )}

      <button
        className="btn-primary"
        onClick={handleFire}
        aria-label="Fire trigger"
      >
        Fire Trigger
      </button>
    </div>
  );
};

export default GmTriggerConsole;
