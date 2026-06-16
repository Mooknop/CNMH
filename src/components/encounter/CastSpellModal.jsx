import React from 'react';
import UseAbilityModal from './UseAbilityModal';
import LingeringCompositionModal from './LingeringCompositionModal';
import HymnOfHealingModal from './HymnOfHealingModal';

// Thin wrapper: translates the legacy `spell` prop into the unified `ability`/`verb`
// API. A few compositions have their own resolvers, so they route to dedicated
// modals instead of the generic cast flow: Lingering Composition (#226-B,
// Performance roll) and Hymn of Healing (#226, sustained fast-healing/temp-HP).
// Both cast hosts (encounter MagicModal, sheet SpellsList) funnel through here.
const CastSpellModal = ({ spell, ...rest }) => {
  if (spell?.id === 'lingering-composition') return <LingeringCompositionModal spell={spell} {...rest} />;
  if (spell?.id === 'hymn-of-healing') return <HymnOfHealingModal spell={spell} {...rest} />;
  return <UseAbilityModal ability={spell} verb="Cast" {...rest} />;
};

export default CastSpellModal;
