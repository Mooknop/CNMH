import { useState } from 'react';
import {
  requiredFlatChecks,
  flatCheckPasses,
  concealmentFlatCheck,
  CONCEALMENT_LEVELS,
} from '../utils/flatChecks';

/**
 * Condition flat checks + target concealment (#262, extracted #1317 D2):
 * stupefied on a spell cast, grabbed/restrained on a Manipulate action. The
 * player rolls a raw d20 per required check before the action resolves; a
 * failed check loses the action (the cost is still spent). Attacking a
 * concealed/hidden target imposes its own flat check (DC 5 / 11) — a manual
 * flag on attack abilities only; it flows through the same gate.
 *
 * Section-hook shape (adapted from the D1 gate pattern): { flatChecks,
 * allFlatChecksRolled, failedFlatCheck, section }. The confirmEnabled fold and
 * the failed-flat-check early-return sequencing stay in the orchestrator —
 * this hook owns the state, derivations and BOTH JSX sections ("Target
 * Concealment" then "Flat Check", rendered as one fragment in the same
 * position the two blocks always sat).
 */
export const useFlatCheckSection = ({ ability, activeConditions, isAttack, effectiveVerb }) => {
  // Condition flat checks (#262): raw d20 per required check (keyed by condition id).
  const [flatCheckRolls, setFlatCheckRolls] = useState({});
  // Manually-flagged target concealment (#262) — 'none' | 'concealed' | 'hidden'.
  const [concealment, setConcealment] = useState('none');

  const concealmentCheck = isAttack ? concealmentFlatCheck(concealment) : null;
  const flatChecks = [
    ...requiredFlatChecks(ability, activeConditions || [], { isCast: effectiveVerb === 'cast' }),
    ...(concealmentCheck ? [concealmentCheck] : []),
  ];
  const flatCheckResults = flatChecks.map((fc) => {
    const raw = flatCheckRolls[fc.id];
    const d20 = /^\d+$/.test(raw || '') ? parseInt(raw, 10) : null;
    return { ...fc, d20, passed: d20 != null && flatCheckPasses(d20, fc.dc) };
  });
  const allFlatChecksRolled = flatCheckResults.every((r) => r.d20 != null);
  const failedFlatCheck = flatCheckResults.find((r) => r.d20 != null && !r.passed) || null;

  const section = (
    <>
      {/* Target concealment (#262) — manual flag on attacks. Picking Concealed
          (DC 5) or Hidden (DC 11) injects a flat check below; concealment isn't
          in the targeting payload, so the attacker sets it here. */}
      {isAttack && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Target Concealment</h3>
            <div className="uam-conceal-row" role="radiogroup" aria-label="Target concealment">
              {CONCEALMENT_LEVELS.map((lvl) => (
                <button
                  key={lvl.id}
                  type="button"
                  className={`uam-conceal-btn${concealment === lvl.id ? ' uam-conceal-btn--active' : ''}`}
                  aria-pressed={concealment === lvl.id}
                  onClick={() => {
                    setConcealment(lvl.id);
                    setFlatCheckRolls((cur) => { const next = { ...cur }; delete next.concealed; delete next.hidden; return next; });
                  }}
                >
                  {lvl.label}{lvl.dc != null ? ` (DC ${lvl.dc})` : ''}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* Condition flat checks (#262) — stupefied cast / grabbed-manipulate, plus
          a flagged concealed/hidden target. The player rolls a raw d20 per check;
          a failed check loses the action (cost still spent). Confirm stays
          disabled until each is entered. */}
      {flatChecks.length > 0 && (
        <>
          <hr className="ct-divider" />
          <section className="ct-section">
            <h3 className="ct-section-title">Flat Check</h3>
            {flatCheckResults.map((fc) => (
              <div key={fc.id} className="uam-flatcheck-row">
                <div className="uam-flatcheck-head">
                  <span className="uam-flatcheck-label">{fc.label} — DC {fc.dc}</span>
                  <input
                    type="number"
                    min="1"
                    max="20"
                    className="uam-flatcheck-input"
                    aria-label={`${fc.label} flat check d20`}
                    value={flatCheckRolls[fc.id] ?? ''}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || (/^\d+$/.test(v) && +v >= 1 && +v <= 20)) {
                        setFlatCheckRolls((cur) => ({ ...cur, [fc.id]: v }));
                      }
                    }}
                  />
                  {fc.d20 != null && (
                    <span className={`uam-flatcheck-result uam-flatcheck-result--${fc.passed ? 'pass' : 'fail'}`}>
                      {fc.passed ? 'Pass' : `Fail — ${fc.fail}`}
                    </span>
                  )}
                </div>
                <p className="uam-flatcheck-hint">{fc.reason}</p>
              </div>
            ))}
          </section>
        </>
      )}
    </>
  );

  return { flatChecks, allFlatChecksRolled, failedFlatCheck, section };
};

export default useFlatCheckSection;
