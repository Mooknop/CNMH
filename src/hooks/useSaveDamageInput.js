import { useState } from 'react';

/**
 * Save-based damage entry (#270, extracted #1317 D3) — the caster's rolled
 * total and rider toggles for a target-save ability, carried into the save
 * request for GM-side per-degree resolution (RequestedSaves).
 *
 * Small state hook only: the DamagePanel render stays inline in the modal's
 * rollSection, and buildTargetSaveRequest (utils/saveRequest.js) snapshots
 * this state at confirm time.
 */
export const useSaveDamageInput = () => {
  const [saveDmgInput, setSaveDmgInput] = useState('');
  const [saveRiderState, setSaveRiderState] = useState({});
  const toggleRider = (id, on) => setSaveRiderState((cur) => ({ ...cur, [id]: on }));
  return { saveDmgInput, setSaveDmgInput, saveRiderState, toggleRider };
};

export default useSaveDamageInput;
