import React from 'react';
import UseAbilityModal from './UseAbilityModal';

// Thin wrapper: translates the legacy `spell` prop into the unified `ability`/`verb` API.
const CastSpellModal = ({ spell, ...rest }) => (
  <UseAbilityModal ability={spell} verb="Cast" {...rest} />
);

export default CastSpellModal;
