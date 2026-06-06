import { useEncounterClock } from '../../hooks/useEncounterClock';

// Null-rendering: keeps cnmh_combatsecs_global accurate by watching the
// encounter state and accruing / committing time. Mounted once at app root
// (alongside ActorMapSync) so it runs regardless of which page is open.
const EncounterClockSync = () => {
  useEncounterClock();
  return null;
};

export default EncounterClockSync;
