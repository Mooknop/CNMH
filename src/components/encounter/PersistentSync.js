import { usePersistentReminders } from '../../hooks/usePersistentReminders';

// Null-rendering: persistent-damage end-of-turn reminders, orphan pruning,
// and end-of-encounter cleanup (#272). Mounted once at app root alongside
// EncounterClockSync so it runs regardless of which page is open; GM-only
// writer (gated inside the hook).
const PersistentSync = () => {
  usePersistentReminders();
  return null;
};

export default PersistentSync;
