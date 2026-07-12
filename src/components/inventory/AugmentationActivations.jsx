import React, { useMemo } from 'react';
import ActionSymbol from '../shared/ActionSymbol';
import TraitTag from '../shared/TraitTag';
import { useItemActivation } from '../../hooks/useItemActivation';
import { itemUidOf } from '../../utils/affix';

// A bound augmentation's `actuated` block as an INTERACTIVE activation card
// (#1411 Bucket B) — replacing the U1 static card. An item holds at most one
// augmentation (single slot), so at most one card. Frequency-gated via
// useItemActivation on a SYNTHETIC item (uid `${hostUid}:aug`, a distinct
// `${uid}:actuated` frequency-ledger key). Every augmentation activation is
// cost:'none' (a free action / reaction — no slot sacrifice / overload / repair),
// so firing just spends the gate and logs via `onActivate`.
//
// Enemy-side activations (Twining Chains' Thorns, Burnished Plating's Sunshine!)
// still fire the log line — "the GM resolves" lives in the description — so nothing
// is left as a bare, unusable card (#1411 bar).

const AugmentationActivationCard = ({ character, hostItem, aug, nowSecs, onActivate }) => {
  const a = aug.actuated;
  const synthItem = useMemo(
    () => ({ uid: `${itemUidOf(hostItem)}:aug`, actuated: a }),
    [hostItem, a],
  );
  const act = useItemActivation(character, synthItem, { nowSecs });

  const fire = () => {
    const r = act.activation.activate();
    if (r.ok) onActivate(aug);
  };

  return (
    <div className="item-action actuated-card" data-testid="augmentation-actuated">
      <div className="action-header">
        <span className="action-name">{a.name}</span>
        <div className="action-count">{a.actionCount && <ActionSymbol cost={a.actionCount} />}</div>
      </div>
      {a.traits && a.traits.length > 0 && (
        <div className="action-traits">
          {a.traits.map((t, i) => <TraitTag key={i} trait={t} />)}
        </div>
      )}
      {a.description && <p className="action-description">{a.description}</p>}
      <p className="actuated-cost">Frequency: {a.frequency || 'once per day'}</p>
      {act.activation.canActivate ? (
        <div className="actuated-controls">
          <button
            type="button"
            className="btn-small btn-primary"
            data-testid="augmentation-activate"
            onClick={fire}
          >
            Activate
          </button>
        </div>
      ) : (
        <p className="actuated-hint" data-testid="augmentation-unavailable">
          {act.gate?.available ? 'Unavailable' : 'Used — the clock frees it up.'}
        </p>
      )}
    </div>
  );
};

// Gate on the host actually carrying an actuated augmentation so the card always
// receives a real block (no null-item into useItemActivation).
const AugmentationActivations = ({ character, item, nowSecs, onActivate }) => {
  const aug = item?.augmentation;
  if (!aug?.actuated) return null;
  return (
    <AugmentationActivationCard
      character={character}
      hostItem={item}
      aug={aug}
      nowSecs={nowSecs}
      onActivate={onActivate}
    />
  );
};

export default AugmentationActivations;
