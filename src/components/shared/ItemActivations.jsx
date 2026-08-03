import React from 'react';
import TraitTag from './TraitTag';
import ActionSymbol from './ActionSymbol';
import { useFrequency } from '../../hooks/useFrequency';
import { parseFrequency, freqKeyFor, lockMessage } from '../../utils/frequency';
import { itemUidOf } from '../../utils/affix';

// Shared render of an item's activations — Actions, Reactions and Free Actions —
// used by both the inventory ItemModal and the shop item preview (#882) so the
// two views stay in sync. The caller themes the
// `.item-action`/`.item-reaction`/`.item-free-action` cards within its own scope
// (`.loot-scroll` for the modal, `.ps-preview` for the shop).
//
// Use tracking (#916): when the caller passes a `character` (and optionally
// `nowSecs`), any activation carrying an explicit frequency — a structured
// `frequencyRule` or a parseable `frequency` string — grows a Use affordance
// that records against the shared per-character frequency ledger
// (cnmh_freq_<charId>), so daily/hourly item powers gate when spent and reset
// exactly like ability frequencies. Keys are per item UID
// (`<uid>:<action-slug>`, mirroring the accessory-rune `<uid>:actuated` keys)
// so two copies of the same item track separately. Without a character — the
// shop preview, rune mechanics — the render stays display-only, and activations
// without an authored frequency render exactly as before.

/**
 * Synthetic ability for the frequency engine, or null when the activation
 * declares no explicit frequency. Traits are deliberately NOT forwarded:
 * parseFrequency's Flourish branch would turn every Flourish-trait item action
 * (e.g. Power Ring's Veracious Spell) into a once-per-turn gate, changing
 * catalog items that author no frequency at all.
 */
const freqAbilityFor = (item, entry) => {
  const bare = {
    name: entry.name,
    frequencyRule: entry.frequencyRule,
    frequency: entry.frequency,
  };
  if (!parseFrequency(bare)) return null;
  const uid = itemUidOf(item);
  return { ...bare, id: uid != null ? `${uid}:${freqKeyFor({ name: entry.name })}` : null };
};

const ruleText = (rule) =>
  rule.uses > 1 ? `${rule.uses} times per ${rule.per}` : `Once per ${rule.per}`;

// The Use affordance for one frequency-bearing activation. Rendered only with a
// character in scope, so the hook always has a real charId.
const ActivationUse = ({ charId, ability, nowSecs, onActivate }) => {
  const { gateFor, record } = useFrequency(charId);
  const rule = parseFrequency(ability);
  const gate = gateFor(ability, { nowSecs });

  if (!gate.available) {
    return (
      <p className="actuated-hint" data-testid="item-activation-locked">
        {lockMessage(gate, rule, nowSecs)}
      </p>
    );
  }
  return (
    <div className="item-activation-use">
      <span className="actuated-cost" data-testid="item-activation-freq">
        {ruleText(rule)}
      </span>
      <button
        type="button"
        className="btn-small btn-primary"
        data-testid="item-activation-use"
        onClick={() => {
          record(ability, { nowSecs });
          if (onActivate) onActivate(ability);
        }}
      >
        Use
      </button>
    </div>
  );
};

const ItemActivations = ({ item, character, nowSecs, onActivate }) => {
  const actions = item && Array.isArray(item.actions) ? item.actions : [];
  const reactions = item && Array.isArray(item.reactions) ? item.reactions : [];
  const freeActions = item && Array.isArray(item.freeActions) ? item.freeActions : [];
  if (!actions.length && !reactions.length && !freeActions.length) return null;

  const charId = character?.id || null;
  const freqControlFor = (entry) => {
    if (!charId) return null;
    const ability = freqAbilityFor(item, entry);
    if (!ability) return null;
    return (
      <ActivationUse charId={charId} ability={ability} nowSecs={nowSecs} onActivate={onActivate} />
    );
  };

  return (
    <>
      {actions.length > 0 && (
        <div className="item-actions">
          <h3>Actions</h3>
          <div className="item-actions-list">
            {actions.map((action, index) => (
              <div key={index} className="item-action">
                <div className="action-header">
                  <span className="action-name">{action.name}</span>
                  <div className="action-count">
                    {action.actionCount && <ActionSymbol cost={action.actionCount} />}
                  </div>
                </div>
                {action.traits && action.traits.length > 0 && (
                  <div className="action-traits">
                    {action.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                <p className="action-description">{action.description}</p>
                {freqControlFor(action)}
              </div>
            ))}
          </div>
        </div>
      )}

      {reactions.length > 0 && (
        <div className="item-reactions">
          <h3>Reactions</h3>
          <div className="item-reactions-list">
            {reactions.map((reaction, index) => (
              <div key={index} className="item-reaction">
                <div className="reaction-header">
                  <span className="reaction-name">{reaction.name}</span>
                  <div className="reaction-icon"><ActionSymbol cost="reaction" /></div>
                </div>
                {reaction.traits && reaction.traits.length > 0 && (
                  <div className="reaction-traits">
                    {reaction.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                {reaction.trigger && (
                  <div className="reaction-trigger">
                    <span className="trigger-label">Trigger</span>
                    <span className="trigger-text">{reaction.trigger}</span>
                  </div>
                )}
                <p className="reaction-description">{reaction.description}</p>
                {freqControlFor(reaction)}
              </div>
            ))}
          </div>
        </div>
      )}

      {freeActions.length > 0 && (
        <div className="item-free-actions">
          <h3>Free Actions</h3>
          <div className="item-free-actions-list">
            {freeActions.map((freeAction, index) => (
              <div key={index} className="item-free-action">
                <div className="free-action-header">
                  <span className="free-action-name">{freeAction.name}</span>
                  <div className="free-action-icon"><ActionSymbol cost="free" /></div>
                </div>
                {freeAction.traits && freeAction.traits.length > 0 && (
                  <div className="free-action-traits">
                    {freeAction.traits.map((trait, i) => (
                      <TraitTag key={i} trait={trait} />
                    ))}
                  </div>
                )}
                {freeAction.trigger && (
                  <div className="free-action-trigger">
                    <span className="trigger-label">Trigger</span>
                    <span className="trigger-text">{freeAction.trigger}</span>
                  </div>
                )}
                <p className="free-action-description">{freeAction.description}</p>
                {freqControlFor(freeAction)}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default ItemActivations;
