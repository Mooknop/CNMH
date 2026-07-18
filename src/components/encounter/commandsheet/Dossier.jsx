// src/components/encounter/commandsheet/Dossier.jsx
// Focus Dossier (#1502 S1/S2) — FocusBanner promoted into the visual lead of
// the encounter tab. The focused combatant renders as a full card under the
// initiative strip:
// - a **revealed foe** leads with its recall-knowledge stat block (AC / Perc DC /
//   RK DC / saves as a grid), IWR chips, and the active Exploit banner;
// - an **unidentified foe** shows the same grid redacted to `??` per cell —
//   Recall Knowledge / Exploit Vulnerability / damage reveals fill it in live;
// - a **focused ally** flips to the support view: vitals + conditions + reach;
// - the viewer's **own entry** (S2) is the personal readout: vitals, effects
//   on you, your defenses, and the hero/focus/speed meta row.
// The contextual action list is a later slice.
import React, { useState } from 'react';
import ActionSymbol from '../../shared/ActionSymbol';
import BestiaryModal from '../BestiaryModal';
import ExploitVulnerabilityModal from '../ExploitVulnerabilityModal';
import { useEncounter } from '../../../hooks/useEncounter';
import { useFocusTarget } from '../../../hooks/useFocusTarget';
import { useRecallKnowledge } from '../../../hooks/useRecallKnowledge';
import { useExploitVulnerability } from '../../../hooks/useExploitVulnerability';
import { useSyncedState } from '../../../hooks/useSyncedState';
import { useAdjacency } from '../../../hooks/useAdjacency';
import { useEnemyEffects } from '../../../hooks/useEnemyEffects';
import { useEffects } from '../../../hooks/useEffects';
import { useContent } from '../../../contexts/ContentContext';
import { defenseDC } from '../../../utils/defense';
import { getFocusInfo } from '../../../utils/SpellUtils';
import { hydrateConditions, getCondition } from '../../../data/pf2eConditions';
import {
  rkKeyFor,
  recallKnowledgeDC,
  isFieldRevealed,
  isSaveRevealed,
  isIwrRevealed,
} from '../../../utils/recallKnowledge';
import './Dossier.css';
import { RELAY, APP, globalKey, syncKey } from '../../../sync/keys';

const SAVE_KEYS = ['fortitude', 'reflex', 'will'];
const SAVE_LABEL = { fortitude: 'Fort', reflex: 'Ref', will: 'Will' };

// Monogram fallback: initials of the first two words, or the first two letters
// of a single-word name ("Sinspawn" → "Si"). Shared with SelfStatusBar.
export const monogram = (name = '') => {
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

// The relay HP key holds a plain number (bridge writes) or a {current, max}
// object (app writes) — normalize both, preferring an explicit max and falling
// back to the caller's (own maxHp from the character model, null for allies).
// Shared with SelfStatusBar.
export const readHp = (raw, fallbackMax = null) => {
  if (typeof raw === 'number') return { current: raw, max: fallbackMax };
  if (raw && typeof raw === 'object') {
    return { current: raw.current ?? null, max: raw.max ?? fallbackMax };
  }
  return { current: null, max: fallbackMax };
};

// Shared vitals block: HIT POINTS label + current(/max) + bar when max known.
const HpBlock = ({ hp, testid }) => (
  <div className="dossier-hp" data-testid={testid}>
    <div className="dossier-hp-row">
      <span className="dossier-hp-label">Hit Points</span>
      <span className="dossier-hp-value">
        {hp.current}
        {hp.max > 0 && <span className="dossier-hp-max">/{hp.max}</span>}
      </span>
    </div>
    {hp.max > 0 && hp.current != null && (
      <div className="dossier-hp-bar" aria-hidden="true">
        {/* --hp-pct: fill width as a CSS custom property (avoids inline width) */}
        <div
          className="dossier-hp-fill"
          style={{ '--hp-pct': `${Math.max(0, Math.min(100, (hp.current / hp.max) * 100))}%` }}
        />
      </div>
    )}
  </div>
);

const Dossier = ({ charId, character, model }) => {
  const { focusEnemy, focusAlly, focusSelf } = useFocusTarget(charId);
  const { encounter } = useEncounter();
  const { recordFor } = useRecallKnowledge();
  // Discover CTAs (#1502 S4) — the unidentified state's two reveal paths.
  const [rkOpen, setRkOpen] = useState(false);
  const [evOpen, setEvOpen] = useState(false);
  const { exploitFor } = useExploitVulnerability();
  const { effectsFor } = useEnemyEffects();
  const { effects: effectCatalog } = useContent();
  const { hasData: hasReachData, inReach } = useAdjacency(charId);
  const [flankedMap] = useSyncedState(globalKey(RELAY.FLANKED), {});
  // Focused-PC state — ally or self (read unconditionally to keep hook order
  // stable; keys are inert when no PC is focused).
  const pcId = (focusAlly || focusSelf)?.charId || 'none';
  const [pcHpRaw] = useSyncedState(syncKey(RELAY.HP, pcId), null);
  const [pcConditionsRaw] = useSyncedState(syncKey(RELAY.CONDITIONS, pcId), []);
  // Self-only meta (own hero points, focus-points spent, effects on you).
  const [heroPoints] = useSyncedState(syncKey(RELAY.HEROPOINTS, charId || 'none'), 0);
  const [focusSpentRaw] = useSyncedState(syncKey(APP.FOCUS, charId || 'none'), 0);
  const { effects: selfEffects } = useEffects(charId || 'none');

  // ── Self focus (#1502 S2) — personal status readout ───────────────────────
  if (focusSelf) {
    const conditions = hydrateConditions(pcConditionsRaw || []);
    const hp = readHp(pcHpRaw, model?.maxHp || null);
    const saves = model?.saves || {};
    // Effective AC (#746: armor-derived when worn gear owns it) and the Speed
    // spine's derived total (#1219: `speed` is {base, total, …}, not a number).
    const acValue = model?.armorClass?.value ?? model?.ac ?? null;
    const speedValue = typeof model?.speed === 'number' ? model.speed : model?.speed?.total ?? null;
    const focusInfo = getFocusInfo(character);
    const focusMax = focusInfo?.max ?? 0;
    const focusLeft = Math.max(0, focusMax - (Number(focusSpentRaw) || 0));
    const subLine = [character?.ancestry, character?.class, character?.level != null ? `Level ${character.level}` : null]
      .filter(Boolean)
      .join(' · ');
    const fmtMod = (v) => (v >= 0 ? `+${v}` : `${v}`);
    return (
      <section
        key={focusSelf.entryId}
        className="dossier dossier--self"
        role="region"
        aria-label={`Focused: ${focusSelf.name} (you)`}
      >
        <header className="dossier-head">
          <span className="dossier-portrait dossier-portrait--self" aria-hidden="true">
            {monogram(focusSelf.name)}
          </span>
          <div className="dossier-id">
            <span className="dossier-name dossier-name--self">
              {focusSelf.name}
              <span className="dossier-you-badge">YOU</span>
            </span>
            {subLine && <span className="dossier-sub dossier-sub--traits">{subLine}</span>}
            {(selfEffects.length > 0 || conditions.length > 0) && (
              <div className="dossier-chips">
                {selfEffects.map((e) => (
                  <span key={e.id} className="dossier-chip dossier-chip--gold">{e.name}</span>
                ))}
                {conditions.map((c) => (
                  <span key={c.id} className="dossier-chip dossier-chip--peril">
                    {c.name}{c.value ? ` ${c.value}` : ''}
                  </span>
                ))}
              </div>
            )}
          </div>
        </header>
        {hp.current != null && <HpBlock hp={hp} testid="dossier-self-hp" />}
        <div className="dossier-grid dossier-grid--defense" data-testid="dossier-self-defenses">
          {[
            { key: 'ac', label: 'AC', value: acValue },
            { key: 'fortitude', label: 'Fort', value: saves.fortitude != null ? fmtMod(saves.fortitude) : null },
            { key: 'reflex', label: 'Ref', value: saves.reflex != null ? fmtMod(saves.reflex) : null },
            { key: 'will', label: 'Will', value: saves.will != null ? fmtMod(saves.will) : null },
          ].map((c) => (
            <div key={c.key} className="dossier-cell">
              <span className="dossier-cell-value">{c.value ?? '—'}</span>
              <span className="dossier-cell-label">{c.label}</span>
            </div>
          ))}
        </div>
        <div className="dossier-meta" data-testid="dossier-self-meta">
          <span className="dossier-meta-item">
            Hero
            <span
              className="dossier-meta-pips"
              aria-label={`${heroPoints || 0} of 3 hero points`}
            >
              {[1, 2, 3].map((n) => (
                <span
                  key={n}
                  className={`dossier-meta-pip${n <= (heroPoints || 0) ? ' dossier-meta-pip--full' : ''}`}
                  aria-hidden="true"
                />
              ))}
            </span>
          </span>
          {focusMax > 0 && (
            <span className="dossier-meta-item">Focus <b>{focusLeft}/{focusMax}</b></span>
          )}
          {speedValue != null && <span className="dossier-meta-item">Speed {speedValue} ft</span>}
        </div>
      </section>
    );
  }

  // ── Focused ally (#429) — support view ────────────────────────────────────
  if (focusAlly) {
    const conditions = hydrateConditions(pcConditionsRaw || []);
    const hp = readHp(pcHpRaw);
    const allyInReach = inReach(focusAlly.entryId);
    return (
      <section
        key={focusAlly.entryId}
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
        {hp.current != null && <HpBlock hp={hp} testid="dossier-ally-hp" />}
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
      <section key={entryId} className="dossier dossier--unknown" role="region" aria-label={`Focused: ${name}`}>
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
    <>
    <section
      key={entryId}
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

      {/* Discover CTAs (#1502 S4) — while unidentified, the dossier is the
          discovery surface: Recall Knowledge (the bestiary's roll flow) and,
          for a thaumaturge, Exploit Vulnerability. */}
      {!identified && (
        <div className="dossier-discover" data-testid="dossier-discover">
          <button
            type="button"
            className="dossier-cta dossier-cta--arcane"
            onClick={() => setRkOpen(true)}
          >
            <span className="dossier-cta-head">
              <ActionSymbol cost={1} />
              <b>Recall Knowledge</b>
            </span>
            <span className="dossier-cta-sub">
              Identify it and reveal defenses — better degrees reveal more.
            </span>
          </button>
          {character?.class === 'Thaumaturge' && !!character?.thaumaturge && (
            <button
              type="button"
              className="dossier-cta dossier-cta--ember"
              onClick={() => setEvOpen(true)}
            >
              <span className="dossier-cta-head">
                <ActionSymbol cost={1} />
                <b>Exploit Vulnerability</b>
              </span>
              <span className="dossier-cta-sub">
                Discover its Mortal Weakness — or improvise a Personal Antithesis.
              </span>
            </button>
          )}
        </div>
      )}

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

    {rkOpen && (
      <BestiaryModal
        isOpen
        onClose={() => setRkOpen(false)}
        enemies={(encounter?.order || []).filter((e) => e.kind === 'enemy')}
        actingCharId={charId}
        actingCharName={character?.name}
      />
    )}
    {evOpen && (
      <ExploitVulnerabilityModal
        isOpen
        onClose={() => setEvOpen(false)}
        character={character}
      />
    )}
    </>
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
