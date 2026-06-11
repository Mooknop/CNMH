import { useEffectExpirySweep } from '../../hooks/useEffectExpirySweep';

// Null-rendering: clears effects whose absolute game-seconds expiry
// (expireAtSecs) has passed — immunity timers and Treat Wounds immunity.
// Mounted once at app root alongside EncounterClockSync so it runs regardless
// of which page is open; GM-only writer (gated inside the hook).
const EffectExpirySync = () => {
  useEffectExpirySweep();
  return null;
};

export default EffectExpirySync;
