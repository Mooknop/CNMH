import { usePartyActivity } from './usePartyActivity';
import { periodState } from '../utils/downtimeUtils';

// Party Ledger + presence view for downtime, layered on the shared
// usePartyActivity reader. Each entry adds the period-scoped allocation fields:
//   { char, color, isYou, plan, status, paired, ledger }
// derived from that PC's cnmh_downtime_<id> for the active period. Readiness is
// the explicit lock-in (status === 'ready'); a prior period reads as 'planning',
// and so does a plan the block's day `budget` no longer fits (#1624) — pass it
// so the ledger shows the same trimmed week the allocator does.
//
// Returns { party, readyCount, total }.
export function usePartyDowntime(startedAt, youId, { youFirst = true, budget } = {}) {
  const { party, readyCount, total } = usePartyActivity('downtime', {
    youId,
    youFirst,
    deriveStatus: (state) => periodState(state, startedAt, budget).status,
  });

  const enriched = party.map((p) => {
    const { plan, status, paired, ledger } = periodState(p.state, startedAt, budget);
    return { char: p.char, color: p.color, isYou: p.isYou, plan, status, paired, ledger };
  });

  return { party: enriched, readyCount, total };
}

export default usePartyDowntime;
