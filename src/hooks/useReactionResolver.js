// useReactionResolver — the shared "press a reaction → resolve it" flow for the
// off-turn stage (#472c). Both the armed-reaction footer (#474) and the inline
// feed cue cards drive the same UX: pressing declares this PC onto every device's
// stage (#476), opens UseAbilityModal at reaction cost, and closing (confirm or
// cancel) clears the declaration. Keeping it in one hook means the footer and the
// cue can never resolve differently.
import { useState, useCallback } from 'react';
import { useReactors } from './useReactors';

export const useReactionResolver = (character) => {
  const charId = character?.id;
  const { declare, clear } = useReactors();
  const [using, setUsing] = useState(null); // { ability, castSource }

  const open = useCallback(
    (ability, castSource) => {
      setUsing({ ability, castSource });
      if (charId) declare(charId, ability.name);
    },
    [charId, declare]
  );

  const close = useCallback(() => {
    setUsing(null);
    if (charId) clear(charId);
  }, [charId, clear]);

  return { using, open, close };
};

export default useReactionResolver;
