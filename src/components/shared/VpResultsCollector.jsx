import { useEffect } from 'react';
import { useSyncedState } from '../../hooks/useSyncedState';
import { APP, syncKey } from '../../sync/keys';

// Hooks must be called at component top level — one subscriber per character
// so each can watch its own cnmh_vpresult key (same pattern as PartyMemberRow).
const CharVpResult = ({ charId, onResult }) => {
  const [result] = useSyncedState(syncKey(APP.VPRESULT, charId), null);

  useEffect(() => {
    onResult(charId, result);
  }, [charId, result, onResult]);

  return null;
};

/**
 * Invisible fan-in for VP challenge results (#1470/#1471): subscribes to
 * every roster character's cnmh_vpresult_<charId> key and reports values up
 * via onResult(charId, value). Used by the GM SkillChallengePanel and the
 * player ChallengePrompts pool display so both compute pools from the same
 * per-character single-writer keys.
 */
const VpResultsCollector = ({ characters, onResult }) => (
  <>
    {(Array.isArray(characters) ? characters : []).map((c) => (
      <CharVpResult key={c.id} charId={c.id} onResult={onResult} />
    ))}
  </>
);

export default VpResultsCollector;
