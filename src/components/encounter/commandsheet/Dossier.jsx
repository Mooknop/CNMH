// src/components/encounter/commandsheet/Dossier.jsx
// Focus Dossier (#1502 S1) — FocusBanner promoted into the visual lead of the
// encounter tab. The focused combatant renders as a full card under the
// initiative strip:
// - a **revealed foe** leads with its recall-knowledge stat block (AC / Perc DC /
//   RK DC / saves as a grid), IWR chips, and the active Exploit banner;
// - an **unidentified foe** shows the same grid redacted to `??` per cell —
//   Recall Knowledge / Exploit Vulnerability / damage reveals fill it in live;
// - a **focused ally** flips to the support view: vitals + conditions + reach.
// Self focus (state 2c) and the contextual action list are later slices.
import React from 'react';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useRecallKnowledge } from '../../../hooks/useRecallKnowledge';
import { useExploitVulnerability } from '../../../hooks/useExploitVulnerability';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useAdjacency } from '../../../hooks/useAdjacency';
import { useEnemyEffects } from '../../../hooks/useEnemyEffects';
import { useContent } from '../../../contexts/ContentContext';
import { defenseDC } from '../../../utils/defense';
import { hydrateConditions, getCondition } from '../../../data/pf2eConditions';
import {
  rkKeyFor,
  recallKnowledgeDC,
  isFieldRevealed,
  isSaveRevealed,
  isIwrRevealed,
} from '../../../utils/recallKnowledge';
import './Dossier.css';
import { RELAY, globalKey, syncKey } from '../../../sync/keys';

const SAVE_KEYS = ['fortitude', 'reflex', 'will'];
const SAVE_LABEL = { fortitude: 'Fort', reflex: 'Ref', will: 'Will' };

// Monogram fallback: initials of the first two words, or the first two letters
// of a single-word name ("Sinspawn" → "Si").
const monogram = (name = '') => {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return words[0] ? words[0].slice(0, 2) : '?';
};

const capitalize = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

// One RK-progress chip: done ✓ · part(ial) · pending ?.
const RkChip = ({ label, state }) => (
  <span className={`dossier-rk-chip dossier-rk-chip--${state}`}>
    {label} {state === 'done' ? '✓' : state === 'part' ? 'partial' : '?'}
  </span>
);

const Dossier = ({ charId }) => {
  const { focusEnemy, focusAlly } = useFocusTarget(charId);
  const { recordFor } = useRecallKnowledge();
  const { exploitFor } = useExploitVulnerability();
  const { effectsFor } = useEnemyEffects();
  const { effects: effectCatalog } = useContent();
  const { hasData: hasReachData, inReach } = useAdjacency(charId);
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});
  // Ally state (read unconditionally to keep hook order stable; keys are inert
  // when no ally is focused).
  const allyId = focusAlly?.charId || 'none';
  const [allyHp] = useSyncedState(syncKey(RELAY.HP, allyId), null);
  const [allyConditionsRaw] = useSyncedState(syncKey(RELAY.CONDITIONS, allyId), []);

  // ── Focused ally (#429) — support view ────────────────────────────────────
  if (focusAlly) {
    const conditions = hydrateConditions(allyConditionsRaw || []);
    const allyInReach = inReach(focusAlly.entryId);
    return (
      <section
        className="dossier dossier--ally"
        role="region"
        aria-label={`Focused ally: ${focusAlly.name}`}
      >
        <header className="dossier-head">
          <span className="dossier-portrait dossier-portrait--ally" aria-hidden="true">
            {monogram(focusAlly.name)}
          </span>
          <div className="dossier-id">
            <span className="dossier-name dossier-name--ally">
              {focusAlly.name}
              <span className="dossier-marker" aria-hidden="true">🎯</span>
            </span>
            <span className="dossier-sub">Ally</span>
          </div>
        </header>
        {typeof allyHp === 'number' && (
          <div className="dossier-hp" data-testid="dossier-ally-hp">
            <span className="dossier-hp-label">Hit Points</span>
            <span className="dossier-hp-value">{allyHp}</span>
          </div>
        )}
        {conditions.length > 0 && (
          <div className="dossier-chips dossier-chips--pad">
            {conditions.map((c) => (
              <span key={c.id} className="dossier-chip dossier-chip--peril">
                {c.name}{c.value ? ` ${c.value}` : ''}
              </span>
            ))}
          </div>
        )}
        {hasReachData && (
          <div
            className={`dossier-reach dossier-reach--${allyInReach ? 'in' : 'out'}`}
            data-testid="dossier-reach"
          >
            <span className="dossier-reach-dot" aria-hidden="true" />
            {allyInReach ? (
              <><b>In reach</b><span>— melee support available</span></>
            ) : (
              <><b>Move closer</b><span>— out of melee reach</span></>
            )}
          </div>
        )}
      </section>
    );
  }

  if (!focusEnemy) return null;

  const { defenses, bestiary, name, entryId } = focusEnemy;
  const rec = recordFor(rkKeyFor(focusEnemy));

  // Condition chips: flanked (relay) + conditions applied by player actions.
  const enemyConditions = effectsFor(entryId).conditions || [];
  const conditionChips = enemyConditions.map((c) => {
    const cname = getCondition(c.id)?.name
      || (effectCatalog || []).find((e) => e.id === c.id)?.name
      || c.id;
    const base = c.value != null ? `${cname} ${c.value}` : cname;
    return { key: `${c.id}:${c.scopedTo || ''}`, label: c.scopedToName ? `${base} to ${c.scopedToName}` : base };
  });
  const isFlanked = !!flankedMap?.[entryId];

  // Active Exploit Vulnerability (#454) — matches the acting character's
  // exploit to this foe. Renders in every foe state (the exploit itself is the
  // thaumaturge's reveal path).
  const exploit = exploitFor(charId);
  const activeExploit = exploit?.targetEntryId === rkKeyFor(focusEnemy) ? exploit : null;

  // ── Homebrew / un-captured foe — no stat block to redact or reveal ────────
  if (!defenses && !bestiary) {
    return (
      <section className="dossier dossier--unknown" role="region" aria-label={`Focused: ${name}`}>
        <header className="dossier-head">
          <span className="dossier-portrait dossier-portrait--unknown" aria-hidden="true">?</span>
          <div className="dossier-id">
            <span className="dossier-name">{name}</span>
            <span className="dossier-sub dossier-sub--empty">
              No stat block — Recall Knowledge to learn more
            </span>
            {(isFlanked || conditionChips.length > 0) && (
              <div className="dossier-chips">
                {isFlanked && <span className="dossier-chip dossier-chip--peril">⚔ flanked</span>}
                {conditionChips.map((c) => (
                  <span key={c.key} className="dossier-chip dossier-chip--peril">{c.label}</span>
                ))}
              </div>
            )}
          </div>
        </header>
        {activeExploit && <ExploitBanner exploit={activeExploit} />}
      </section>
    );
  }

  // ── Captured foe — identity + per-cell reveal gating ──────────────────────
  const identified = isFieldRevealed(rec, 'identity');
  const displayName = identified ? name : 'Unidentified creature';
  const traits = bestiary?.traits || [];
  const subLine = identified
    ? [...traits.map(capitalize), bestiary?.level != null ? `Level ${bestiary.level}` : null]
        .filter(Boolean)
        .join(' · ')
    : 'Not yet recalled — Recall Knowledge to learn more';

  // Stat grid: each cell independently gated; `??` until its reveal lands.
  const rkDC = bestiary?.level != null ? recallKnowledgeDC(bestiary.level, bestiary.rarity) : null;
  const saveDCs = Object.fromEntries(SAVE_KEYS.map((k) => [k, defenseDC(defenses, k)]));
  const savesRevealed = SAVE_KEYS.map((k) => isSaveRevealed(rec, k));

  // Offense cue: with all three saves revealed, rank them for the attacker —
  // lowest (the opening) peril, highest verdant, the rest ember.
  const saveVals = SAVE_KEYS.map((k) => saveDCs[k]);
  const allSaves = savesRevealed.every(Boolean) && saveVals.every((v) => v != null);
  const minSave = allSaves ? Math.min(...saveVals) : null;
  const maxSave = allSaves ? Math.max(...saveVals) : null;
  const saveTone = (v) => {
    if (!allSaves || minSave === maxSave) return null;
    if (v === minSave) return 'low';
    if (v === maxSave) return 'high';
    return 'mid';
  };

  const cells = [
    { key: 'ac', label: 'AC', value: defenseDC(defenses, 'ac'), revealed: isFieldRevealed(rec, 'ac') },
    { key: 'perception', label: 'Perc DC', value: defenseDC(defenses, 'perception'), revealed: isFieldRevealed(rec, 'perception') },
    { key: 'rk', label: 'RK DC', value: rkDC, revealed: identified },
    ...SAVE_KEYS.map((k, i) => ({
      key: k,
      label: SAVE_LABEL[k],
      value: saveDCs[k],
      revealed: savesRevealed[i],
      tone: savesRevealed[i] ? saveTone(saveDCs[k]) : null,
    })),
  ];

  // RK progress chips: identity / defenses (AC + saves) / IWR.
  const defenseReveals = [isFieldRevealed(rec, 'ac'), ...savesRevealed];
  const defensesState = defenseReveals.every(Boolean) ? 'done' : defenseReveals.some(Boolean) ? 'part' : 'none';
  const iwrFull = ['weaknesses', 'resistances', 'immunities'].map((k) => isIwrRevealed(rec, k));
  const iwrPartial =
    Object.keys(rec.weaknessesRevealed || {}).length > 0 ||
    Object.keys(rec.resistancesRevealed || {}).length > 0 ||
    Object.keys(rec.immunitiesRevealed || {}).length > 0;
  const iwrState = iwrFull.every(Boolean) ? 'done' : (iwrFull.some(Boolean) || iwrPartial) ? 'part' : 'none';

  // IWR lists — full class reveal or per-type partials (Exploit Vuln, damage #1014).
  const weaknessList = isIwrRevealed(rec, 'weaknesses')
    ? (defenses?.weaknesses || [])
    : (defenses?.weaknesses || []).filter((w) => rec.weaknessesRevealed?.[w.type]);
  const resistanceList = isIwrRevealed(rec, 'resistances')
    ? (defenses?.resistances || [])
    : (defenses?.resistances || []).filter((r) => rec.resistancesRevealed?.[r.type]);
  const immunityList = isIwrRevealed(rec, 'immunities')
    ? (defenses?.immunities || [])
    : (defenses?.immunities || []).filter((t) => rec.immunitiesRevealed?.[t]);

  return (
    <section
      className={`dossier ${identified ? 'dossier--foe' : 'dossier--unknown'}`}
      role="region"
      aria-label={`Focused: ${displayName}`}
    >
      <header className="dossier-head">
        <span
          className={`dossier-portrait ${identified ? 'dossier-portrait--foe' : 'dossier-portrait--unknown'}`}
          aria-hidden="true"
        >
          {identified ? monogram(name) : '?'}
        </span>
        <div className="dossier-id">
          <span className={`dossier-name ${identified ? 'dossier-name--foe' : ''}`}>{displayName}</span>
          <span className={`dossier-sub ${identified ? 'dossier-sub--traits' : ''}`}>{subLine}</span>
          {(isFlanked || conditionChips.length > 0) && (
            <div className="dossier-chips">
              {isFlanked && <span className="dossier-chip dossier-chip--peril">⚔ flanked</span>}
              {conditionChips.map((c) => (
                <span key={c.key} className="dossier-chip dossier-chip--peril">{c.label}</span>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className="dossier-rk" data-testid="dossier-rk">
        <span className={`dossier-rk-head${identified ? ' dossier-rk-head--live' : ''}`}>
          Recall Knowledge
        </span>
        <RkChip label="Identity" state={identified ? 'done' : 'none'} />
        <RkChip label="Defenses" state={defensesState} />
        <RkChip label="IWR" state={iwrState} />
      </div>

      <div className="dossier-grid" data-testid="dossier-grid">
        {cells.map((c) => (
          <div key={c.key} className={`dossier-cell${c.tone ? ` dossier-cell--${c.tone}` : ''}`}>
            <span className={`dossier-cell-value${c.revealed ? '' : ' dossier-cell-value--hidden'}`}>
              {c.revealed ? (c.value ?? '—') : '??'}
            </span>
            <span className="dossier-cell-label">
              {c.label}
              {c.tone === 'low' && <span className="dossier-cell-cue"> ◂ low</span>}
            </span>
          </div>
        ))}
      </div>

      {(weaknessList.length > 0 || resistanceList.length > 0 || immunityList.length > 0 || activeExploit) && (
        <div className="dossier-iwr">
          {weaknessList.length > 0 && (
            <div className="dossier-iwr-row" data-testid="dossier-weak">
              <span className="dossier-iwr-label">Weak</span>
              {weaknessList.map((w) => (
                <span key={w.type} className="dossier-chip dossier-chip--verdant">{w.type} {w.value}</span>
              ))}
            </div>
          )}
          {resistanceList.length > 0 && (
            <div className="dossier-iwr-row" data-testid="dossier-resist">
              <span className="dossier-iwr-label">Resist</span>
              {resistanceList.map((r) => (
                <span key={r.type} className="dossier-chip">{r.type} {r.value}</span>
              ))}
            </div>
          )}
          {immunityList.length > 0 && (
            <div className="dossier-iwr-row" data-testid="dossier-immune">
              <span className="dossier-iwr-label">Immune</span>
              {immunityList.map((t) => (
                <span key={t} className="dossier-chip">{t}</span>
              ))}
            </div>
          )}
          {activeExploit && <ExploitBanner exploit={activeExploit} />}
        </div>
      )}
    </section>
  );
};

// The "⚡ Exploited" banner (#454) — the thaumaturge's persistent edge on this foe.
const ExploitBanner = ({ exploit }) => (
  <div className="dossier-exploit" data-testid="dossier-exploit">
    <span className="dossier-exploit-bolt" aria-hidden="true">⚡</span>
    <div className="dossier-exploit-body">
      <span className="dossier-exploit-title">
        Exploited — {exploit.type === 'mortal' ? 'Mortal Weakness' : 'Personal Antithesis'}
      </span>
      <span className="dossier-exploit-sub">
        Your Strikes deal +{exploit.type === 'mortal' ? `${exploit.weaknessType} ` : ''}{exploit.value} to this creature
      </span>
    </div>
  </div>
);

export default Dossier;
