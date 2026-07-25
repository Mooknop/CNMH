import React from 'react';
import { useEncounter } from '../../hooks/useEncounter';
import { isCharTurn, activeEntry } from '../../utils/encounterUtils';
import './OutOfTurnNotice.css';

// Out-of-turn soft warning (#1575 D1) — warn, don't hide. The deck and the
// resolvers stay usable off-turn (real tables resolve out of order all the
// time); this banner makes the state visible at the intent step instead of
// hiding the controls. Reaction-cost uses are exempt — reacting on someone
// else's turn is the normal case, not a warning. Renders nothing outside a
// live encounter or on the character's own turn.
const OutOfTurnNotice = ({ charId, cost }) => {
  const { encounter } = useEncounter();
  const live = !!(encounter?.active && encounter.phase === 'in-progress');
  if (!live || cost === 'reaction' || isCharTurn(encounter, charId)) return null;
  const acting = activeEntry(encounter)?.name;
  return (
    <p className="oot-notice" role="status" data-testid="out-of-turn-notice">
      <span className="oot-notice-glyph" aria-hidden="true">⧗</span>
      {' '}Not your turn{acting ? <> — <b>{acting}</b> is acting</> : null}.
      Confirming resolves out of turn.
    </p>
  );
};

export default OutOfTurnNotice;
