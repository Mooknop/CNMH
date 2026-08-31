import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useContent } from '../../../contexts/ContentContext';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useSessionLog } from '../../../hooks/useSessionLog';
import { saveDocument } from '../../../utils/gmApi';
import { APP, globalKey } from '../../../sync/keys';
import { SKILL_ABILITY_MAP } from '../../../utils/CharacterUtils';
import { skillLabel } from '../../../utils/victoryPoints';
import {
  topicProgress,
  totalMaxRp,
  accrueSourceRp,
  adjustRp,
  unlockedTiers,
  newlyCrossedTiers,
} from '../../../utils/research';
import SkillChallengeModal from '../SkillChallengeModal';
import './DowntimeViews.css';

// Downtime dock — Research view (#1841, epic #206 S3; re-laid out into a
// no-scroll list + detail split by #1854). The party's research board: one
// list entry per OPEN GMG Research Topic (`researchTopics`, the capture-only
// `research` collection) over the single shared progress key
// `cnmh_research_global`, with the selected topic's full detail alongside it.
//
// ALL RP MATH LIVES IN utils/research.js (#1839 / S1). This component never
// re-derives it — it hands data to the util and writes back what comes out.
// That keeps the per-source `maxRp` ceiling in exactly one tested place.
//
// ANTI-METAGAMING (parent issue #206 ruling): a topic the GM has not marked
// `available` is never selectable and never shows sources/bar/tier text — it
// only exists as a dashed "not open" chip at the bottom of the list column, so
// future chapters' content isn't sitting open on the dock. Tapping the chip
// reuses the SAME toggle handler as the detail pane's own switch; the chip is
// not a detail-view target in itself. Within an open topic's detail, only
// tiers the party has actually reached show their text; a locked tier
// contributes its tick on the progress bar and NOTHING else. No teaser, no
// "2 more tiers" count — the tick already says "there is more to find"
// without saying what or how much.
//
// SELECTION IS LOCAL AND DERIVED, NEVER STORED. `selectedTopicId` is plain
// component state (it resets when the rail remounts this view — see
// DockDowntimePane's `key={active.id}`); the topic actually shown is derived
// from it each render (falling back to the first open topic, or none), so
// toggling the selected topic closed — or any other progress change — can
// never strand the detail pane on a topic that's no longer valid to show.
//
// TIER-CROSS SIDE EFFECTS FIRE IN THE WRITE HANDLER, NOT AN EFFECT. The
// accrual paths compute `newlyCrossedTiers(topic, prevRp, nextRp)` in the same
// handler that produces the next progress map, then append the session-log line
// and reveal lore from there — never from a `useEffect` watching the synced
// value. `cnmh_research_global` fans out to every connected client over the
// WebSocket, so watching it from an effect would double-fire: each open tab (a
// second GM device, a player's phone) would run the same reveal/log append off
// the same broadcast. The handler runs once, on the device whose GM pressed the
// button. The newly-unlocked tier row's entrance animation (`.dock-dt-tier` in
// DowntimeViews.css) is a plain CSS mount transition, not JS state — an already
// -rendered tier keeps its React key across renders, so only a row that is
// genuinely new to the DOM plays it.
//
// PUSH A CHECK reuses the #204 Victory Point rail rather than growing a second
// roll channel: the per-source button opens the existing SkillChallengeModal
// pre-filled with that source's skills/DCs (its additive `initial` prop) and
// the challenge lands on `cnmh_vpchallenge_global` like any other. v1 does NOT
// auto-bank RP from the result — the GM reads the challenge's outcome and taps
// the source's own +/- steppers, which is also the only path that fires the
// tier-cross effects above.

const SKILL_KEYS = Object.keys(SKILL_ABILITY_MAP);

// The VP challenge form's skill picker only knows the core skill list, so a
// source's Lore checks (very common on GMG research sources) can't ride the
// prefill — they stay visible as DC chips on the card and the GM picks a
// stand-in skill in the modal. Everything rollable is passed straight through.
const challengeSkills = (source) =>
  (source?.checks || []).filter((c) => c && SKILL_KEYS.includes(c.skill));

const pct = (value, max) => (max > 0 ? Math.min(100, (value / max) * 100) : 0);

// Right column — the selected topic's full detail. Split out of the main
// component body purely for readability; every mutation it triggers is a
// prop callback into the handlers ResearchView owns (see the header note on
// where side effects live).
const TopicDetail = ({ topic, progress, onToggle, onAdjust, onAccrue, onChallenge }) => {
  const { available, rp, perSourceRp } = topicProgress(progress, topic.id);
  const maxRp = totalMaxRp(topic);
  const unlocked = unlockedTiers(topic, rp);
  const allTiersUnlocked =
    (topic.unlocks || []).length > 0 && unlocked.length === topic.unlocks.length;

  return (
    <div
      className="dock-dt-rs-detail"
      data-testid={`dock-dt-topic-${topic.id}`}
    >
      <header className="dock-dt-rs-detail-head">
        <div className="dock-dt-rs-detail-title">
          <h3 className="dock-dt-rs-detail-name">{topic.title}</h3>
          {topic.description && (
            <p className="dock-dt-rs-detail-desc">{topic.description}</p>
          )}
        </div>
        <div className="dock-dt-rs-detail-side">
          {topic.level != null && (
            <span className="dock-dt-level">Level {topic.level}</span>
          )}
          <button
            type="button"
            role="switch"
            aria-checked={available}
            aria-label={`${topic.title} available to the party`}
            className={`dock-dt-switch${available ? ' dock-dt-switch--on' : ''}`}
            onClick={() => onToggle(topic)}
          >
            {/* The pill is a child so the BUTTON carries the 44px tap
                target without the switch looking 44px tall. */}
            <span className="dock-dt-switch-track" aria-hidden="true">
              <span className="dock-dt-switch-knob" />
            </span>
          </button>
        </div>
      </header>

      <div className="dock-dt-rs-total">
        <div
          className="dock-dt-bar dock-dt-bar--total"
          style={{ '--rp-pct': `${pct(rp, maxRp)}%` }}
          role="img"
          aria-label={`${rp} of ${maxRp} research points`}
        >
          <span className="dock-dt-bar-fill" />
          {/* Ticks are the ONLY thing a locked tier contributes — position
              and nothing else (see the header ruling). */}
          {(topic.unlocks || []).map((tier) => (
            <span
              key={tier.rp}
              className="dock-dt-tick"
              data-unlocked={tier.rp <= rp}
              style={{ '--tick-pct': `${pct(tier.rp, maxRp)}%` }}
            />
          ))}
        </div>
        <span className="dock-dt-rp">
          <strong>{rp}</strong> / {maxRp} RP
        </span>
        <button
          type="button"
          className="dock-dt-step"
          aria-label={`Remove a research point from ${topic.title}`}
          disabled={rp <= 0}
          onClick={() => onAdjust(topic, -1)}
        >
          −
        </button>
        <button
          type="button"
          className="dock-dt-step"
          aria-label={`Add a research point to ${topic.title}`}
          disabled={rp >= maxRp}
          onClick={() => onAdjust(topic, 1)}
        >
          +
        </button>
      </div>

      <ul className="dock-dt-sources dock-dt-rs-sources">
        {(topic.sources || []).map((source) => {
          const sourceRp = perSourceRp[source.name] || 0;
          const sourceMax = typeof source.maxRp === 'number' ? source.maxRp : Infinity;
          return (
            <li className="dock-dt-source" key={source.name}>
              <div className="dock-dt-source-head">
                <span className="dock-dt-source-name">{source.name}</span>
                <span className="dock-dt-source-rp">
                  {sourceRp} / {Number.isFinite(sourceMax) ? sourceMax : '∞'} RP
                </span>
              </div>
              {source.note && <p className="dock-dt-source-note">{source.note}</p>}
              <div className="dock-dt-source-meta">
                {(source.checks || []).map((check) => (
                  <span className="dock-dt-dc" key={`${check.skill}-${check.dc}`}>
                    {skillLabel(check.skill)} {check.dc}
                  </span>
                ))}
                {source.costNote && <span className="dock-dt-cost">{source.costNote}</span>}
              </div>
              <div className="dock-dt-source-actions">
                <button
                  type="button"
                  className="dock-dt-step"
                  aria-label={`Remove a research point from ${source.name}`}
                  disabled={sourceRp <= 0}
                  onClick={() => onAccrue(topic, source.name, -1)}
                >
                  −
                </button>
                <button
                  type="button"
                  className="dock-dt-step"
                  aria-label={`Add a research point to ${source.name}`}
                  disabled={sourceRp >= sourceMax}
                  onClick={() => onAccrue(topic, source.name, 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="dock-dt-btn"
                  onClick={() => onChallenge(topic, source)}
                >
                  Push a check
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {unlocked.length > 0 && (
        <ul className="dock-dt-tiers">
          {unlocked.map((tier) => (
            <li className="dock-dt-tier" key={tier.rp}>
              <span className="dock-dt-tier-rp">{tier.rp} RP</span>
              <span className="dock-dt-tier-text">{tier.text}</span>
            </li>
          ))}
        </ul>
      )}

      {allTiersUnlocked && topic.reward && (
        <p className="dock-dt-reward">
          <span className="dock-dt-reward-label">Reward</span>
          {topic.reward}
        </p>
      )}
    </div>
  );
};

const ResearchView = () => {
  const { researchTopics, allLoreEntries } = useContent();
  const { appendEvent } = useSessionLog();
  const [progress, setProgress] = useSyncedState(globalKey(APP.RESEARCH), {});
  // Held in state (not built inline in the click handler's JSX) so its
  // identity is stable across renders — SkillChallengeModal seeds from it on
  // open and must not see a fresh object every render.
  const [challengeSeed, setChallengeSeed] = useState(null);
  // Which open topic the detail column shows. Local/device state, not synced
  // — see the header note on why the actual topic shown is always DERIVED
  // from this id rather than trusted at face value.
  const [selectedTopicId, setSelectedTopicId] = useState(null);

  const topics = useMemo(
    () => (Array.isArray(researchTopics) ? researchTopics : []),
    [researchTopics]
  );

  const openTopics = topics.filter((t) => topicProgress(progress, t.id).available);
  const lockedTopics = topics.filter((t) => !topicProgress(progress, t.id).available);
  const selectedTopic =
    openTopics.find((t) => t.id === selectedTopicId) || openTopics[0] || null;

  // Reveal the lore entry a crossed tier points at. Spreads the FULL live doc
  // and changes only `visibility` (GmLore's contract — the Obsidian vault owns
  // every other field, so a partial write would clobber authored prose).
  // Silent when the entry is missing or already revealed.
  const revealLore = (loreId) => {
    const entry = (allLoreEntries || []).find((e) => e.id === loreId);
    if (!entry || entry.visibility === 'revealed') return;
    saveDocument('lore', entry.id, { ...entry, visibility: 'revealed' }).catch(() => {});
  };

  // The single write path. `next` is whatever utils/research.js produced; the
  // tier-cross effects are computed from the same before/after pair rather
  // than from a later render of the synced value (see the header note).
  const commit = (topic, next) => {
    const prevRp = topicProgress(progress, topic.id).rp;
    const nextRp = topicProgress(next, topic.id).rp;
    setProgress(next);
    for (const tier of newlyCrossedTiers(topic, prevRp, nextRp)) {
      appendEvent({
        type: 'research',
        text: `Research: ${topic.title} reached ${tier.rp} RP`,
      });
      if (tier.loreId) revealLore(tier.loreId);
    }
  };

  const toggleAvailable = (topic) => {
    const cur = topicProgress(progress, topic.id);
    setProgress({
      ...(progress && typeof progress === 'object' ? progress : {}),
      [topic.id]: { ...cur, available: !cur.available },
    });
  };

  const openChallenge = (topic, source) => {
    setChallengeSeed({
      name: `Research: ${topic.title} — ${source.name}`,
      skills: challengeSkills(source),
    });
  };

  return (
    <section className="dock-dt-view" aria-label="Research">
      <header className="dock-dt-head">
        <div className="dock-dt-title">
          <span className="dock-dt-kicker">Downtime</span>
          <h2 className="dock-dt-heading">Research</h2>
        </div>
        {topics.length > 0 && (
          <span className="dock-dt-count">
            {openTopics.length} open · {lockedTopics.length} not yet open
          </span>
        )}
        <Link className="dock-dt-btn" to="/gm/world/research">
          Manage topics
        </Link>
      </header>

      {!topics.length ? (
        <div className="dock-dt-note" role="status">
          <p>No research topics yet.</p>
          <Link className="dock-dt-btn" to="/gm/world/research">
            Author topics in the Research editor
          </Link>
          <p className="dock-dt-note-alt">
            Or bulk-import from the adventure journal dump
            (scripts/importResearchTopicsCli.js).
          </p>
        </div>
      ) : (
        <div className="dock-dt-rs-body">
          <div className="dock-dt-rs-list">
            <div className="dock-dt-rs-open">
              {openTopics.map((topic) => {
                const { rp } = topicProgress(progress, topic.id);
                const maxRp = totalMaxRp(topic);
                const unlocked = unlockedTiers(topic, rp);
                const isActive = topic.id === selectedTopic?.id;
                return (
                  <button
                    type="button"
                    key={topic.id}
                    className={`dock-dt-rs-item${isActive ? ' dock-dt-rs-item--active' : ''}`}
                    aria-pressed={isActive}
                    data-testid={`dock-dt-topic-list-${topic.id}`}
                    onClick={() => setSelectedTopicId(topic.id)}
                  >
                    <span className="dock-dt-rs-item-row">
                      <span className="dock-dt-rs-item-name">{topic.title}</span>
                      <span className="dock-dt-rs-item-rp">
                        {rp} / {maxRp} RP
                      </span>
                    </span>
                    <span
                      className="dock-dt-bar"
                      style={{ '--rp-pct': `${pct(rp, maxRp)}%` }}
                      aria-hidden="true"
                    >
                      <span className="dock-dt-bar-fill" />
                    </span>
                    <span className="dock-dt-rs-item-row">
                      {topic.level != null && (
                        <span className="dock-dt-level">Level {topic.level}</span>
                      )}
                      <span className="dock-dt-rs-item-tiers">
                        {unlocked.length} of {(topic.unlocks || []).length} tiers found
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>

            {lockedTopics.length > 0 && (
              <div className="dock-dt-rs-locked">
                <span className="dock-dt-rs-locked-label">Not open to the party</span>
                <div className="dock-dt-rs-chips">
                  {lockedTopics.map((topic) => (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={false}
                      aria-label={`${topic.title} available to the party`}
                      key={topic.id}
                      className="dock-dt-rs-chip"
                      data-testid={`dock-dt-topic-${topic.id}`}
                      onClick={() => toggleAvailable(topic)}
                    >
                      <span className="dock-dt-rs-chip-dot" aria-hidden="true" />
                      {topic.title}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {selectedTopic ? (
            <TopicDetail
              topic={selectedTopic}
              progress={progress}
              onToggle={toggleAvailable}
              onAdjust={(topic, delta) => commit(topic, adjustRp(progress, topic, delta))}
              onAccrue={(topic, sourceName, delta) =>
                commit(topic, accrueSourceRp(progress, topic, sourceName, delta))
              }
              onChallenge={openChallenge}
            />
          ) : (
            <div className="dock-dt-rs-detail dock-dt-rs-detail--empty">
              <p className="dock-dt-note-alt">
                No topics are open to the party yet. Tap a topic below to open it.
              </p>
            </div>
          )}
        </div>
      )}

      <SkillChallengeModal
        isOpen={!!challengeSeed}
        initial={challengeSeed}
        onClose={() => setChallengeSeed(null)}
      />
    </section>
  );
};

export default ResearchView;
