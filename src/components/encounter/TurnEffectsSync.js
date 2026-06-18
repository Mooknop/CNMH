import { useEncounterTurnEffects } from '../../hooks/useEncounterTurnEffects';
import { useReactorTurnClear } from '../../hooks/useReactorTurnClear';

// Null-rendering: drives turn-boundary effect expiry + Hymn fast healing for
// Foundry-linked combats (#443), where the bridge advances turns and the app's
// advanceTurn never runs, plus the off-turn reactor-presence sweep (#477).
// Mounted once at app root alongside PersistentSync / EffectExpirySync so it
// runs regardless of which page is open; GM-only writers (gated inside the hooks).
const TurnEffectsSync = () => {
  useEncounterTurnEffects();
  useReactorTurnClear();
  return null;
};

export default TurnEffectsSync;
