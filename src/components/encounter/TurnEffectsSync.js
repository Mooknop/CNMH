import { useEncounterTurnEffects } from '../../hooks/useEncounterTurnEffects';

// Null-rendering: drives turn-boundary effect expiry + Hymn fast healing for
// Foundry-linked combats (#443), where the bridge advances turns and the app's
// advanceTurn never runs. Mounted once at app root alongside PersistentSync /
// EffectExpirySync so it runs regardless of which page is open; GM-only writer
// (gated inside the hook).
const TurnEffectsSync = () => {
  useEncounterTurnEffects();
  return null;
};

export default TurnEffectsSync;
