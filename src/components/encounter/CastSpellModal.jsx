import React from 'react';
import UseAbilityModal from './UseAbilityModal';
import LingeringCompositionModal from './LingeringCompositionModal';

// Thin wrapper: translates the legacy `spell` prop into the unified `ability`/`verb`
// API. Lingering Composition (#226-B) is a spellshape with its own Performance-roll
// resolver, so it routes to a dedicated modal instead of the generic cast flow.
// Both cast hosts (encounter MagicModal, sheet SpellsList) funnel through here.
const CastSpellModal = ({ spell, ...rest }) =>
  spell?.id === 'lingering-composition'
    ? <LingeringCompositionModal spell={spell} {...rest} />
    : <UseAbilityModal ability={spell} verb="Cast" {...rest} />;

export default CastSpellModal;
