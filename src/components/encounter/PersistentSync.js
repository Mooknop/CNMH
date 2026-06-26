import { usePersistentReminders } from '../../hooks/usePersistentReminders';
import { useAuraReminders } from '../../hooks/useAuraReminders';
import { useBladeCleanup } from '../../hooks/useBladeCleanup';

// Null-rendering: persistent-damage end-of-turn reminders, orphan pruning,
// and end-of-encounter cleanup (#272), magic-armor aura save reminders (#728
// E2), and the Blade Byrnie end-of-turn dagger return (#728 E4). Mounted once
// at app root alongside EncounterClockSync so it runs regardless of which page
// is open; GM-only writers (gated inside the hooks).
const PersistentSync = () => {
  usePersistentReminders();
  useAuraReminders();
  useBladeCleanup();
  return null;
};

export default PersistentSync;
