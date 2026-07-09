import React, { useState } from 'react';
import { useSession } from '../../contexts/SessionContext';
import { useSessionLog } from '../../hooks/useSessionLog';
import { useContent } from '../../contexts/ContentContext';
import { getReactions } from '../../utils/actionUtils';
import { TRIGGER_EVENTS, matchingReactions } from '../../utils/reactionTriggers';
import { APP } from '../../sync/keys';

let _reqCounter = 0;

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
  const [note,    setNote]    = useState('');

  if (pcEntries.length === 0) return null;

  const event = TRIGGER_EVENTS.find((e) => e.id === eventId) || TRIGGER_EVENTS[0];

  // Which in-encounter PCs hold a reaction that this event would wake.
  const eligible = pcEntries
    .map((entry) => {
      const char = (characters || []).find((c) => c.id === entry.charId);
      if (!char) return null;
      const matched = matchingReactions(getReactions(char), event.id);
      return matched.length ? { name: entry.name, reactions: matched } : null;
    })
    .filter(Boolean);

  const handleFire = () => {
    const reqIdBase = `react-${Date.now()}-${++_reqCounter}`;
    const targets = target === 'all'
      ? pcEntries
      : pcEntries.filter((e) => e.charId === target);

    for (const entry of targets) {
      sendUpdate(entry.charId, APP.REACTPROMPT, {
        reqId: `${reqIdBase}-${entry.charId}`,
        eventId: event.id,
        label: event.label,
        note: note.trim() || undefined,
        round,
        ts: Date.now(),
      });
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

      <p className="gm-help" aria-label="eligible PCs">
        {eligible.length > 0
          ? `Holds a matching reaction: ${eligible
              .map((e) => `${e.name} (${e.reactions.map((r) => r.name).join(', ')})`)
              .join(' · ')}`
          : 'No PCs in the encounter have a matching reaction for this event.'}
      </p>

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
