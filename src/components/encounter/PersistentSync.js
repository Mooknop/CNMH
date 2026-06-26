import { usePersistentReminders } from '../../hooks/usePersistentReminders';
import { useAuraReminders } from '../../hooks/useAuraReminders';

// Null-rendering: persistent-damage end-of-turn reminders, orphan pruning,
// and end-of-encounter cleanup (#272), plus magic-armor aura save reminders
// (#728 E2). Mounted once at app root alongside EncounterClockSync so it runs
// regardless of which page is open; GM-only writers (gated inside the hooks).
const PersistentSync = () => {
  usePersistentReminders();
  useAuraReminders();
  return null;
};

export default PersistentSync;
