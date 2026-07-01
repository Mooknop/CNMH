import { usePersistentReminders } from '../../hooks/usePersistentReminders';
import { useAuraReminders } from '../../hooks/useAuraReminders';
import { useBladeCleanup } from '../../hooks/useBladeCleanup';
import { useDamageRelayAck } from '../../hooks/useDamageRelayAck';

// Null-rendering: persistent-damage end-of-turn reminders, orphan pruning,
// and end-of-encounter cleanup (#272), magic-armor aura save reminders (#728
// E2), the Blade Byrnie end-of-turn dagger return (#728 E4), and the Foundry
// damage-relay ack mirror (#1016). Mounted once at app root alongside
// EncounterClockSync so it runs regardless of which page is open; GM-only
// writers (gated inside the hooks).
const PersistentSync = () => {
  usePersistentReminders();
  useAuraReminders();
  useBladeCleanup();
  useDamageRelayAck();
  return null;
};

export default PersistentSync;
