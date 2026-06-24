import { usePartyActivity } from './usePartyActivity';
import { periodState } from '../utils/downtimeUtils';

// Party Ledger + presence view for downtime, layered on the shared
// usePartyActivity reader. Each entry adds the period-scoped allocation fields:
//   { char, color, isYou, plan, status, paired, ledger }
// derived from that PC's cnmh_downtime_<id> for the active period. Readiness is
// the explicit lock-in (status === 'ready'); a prior period reads as 'planning'.
//
// Returns { party, readyCount, total }.
export function usePartyDowntime(startedAt, youId, { youFirst = true } = {}) {
  const { party, readyCount, total } = usePartyActivity('downtime', {
    youId,
    youFirst,
    deriveStatus: (state) => periodState(state, startedAt).status,
  });

  const enriched = party.map((p) => {
    const { plan, status, paired, ledger } = periodState(p.state, startedAt);
    return { char: p.char, color: p.color, isYou: p.isYou, plan, status, paired, ledger };
  });

  return { party: enriched, readyCount, total };
}

export default usePartyDowntime;
