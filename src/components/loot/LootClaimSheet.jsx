import React, { useMemo } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { useLootDrop } from '../../hooks/useLootDrop';
import { lineRemaining, charClaimQty, lineClaimedQty } from '../../utils/lootDrop';
import './LootClaimSheet.css';

// Party treasure claim sheet (#1091, epic #1085 T5). The fly-up that appears on
// every player's sheet while a loot drop is open — same party-wide-prompt idiom
// as Take 10. Each player claims lines for their own character; a stack (qty > 1)
// can be split, with the remainder left claimable. Claims write straight to the
// shared drop (last-writer-wins is fine at 5 players); the GM finalizes.
const LootClaimSheet = ({ character, characterColor }) => {
  const charId = character?.id;
  const { drop, isOpen, offline, shares, claimLine } = useLootDrop();
  const { characters = [] } = useContent();

  const nameById = useMemo(
    () => Object.fromEntries((characters || []).map((c) => [c.id, c.name])),
    [characters],
  );

  if (!isOpen || !charId) return null;

  const themeColor = characterColor || 'var(--color-theme)';
  const myGold = Math.max(0, Math.floor(Number(shares[charId]) || 0));

  const othersOn = (line) =>
    (line.claims || [])
      .filter((c) => c.charId !== charId && c.qty > 0)
      .map((c) => `${nameById[c.charId] || 'A player'}${c.qty > 1 ? ` ×${c.qty}` : ''}`)
      .join(', ');

  return (
    <div
      className="loot-claim"
      style={{ '--loot-theme': themeColor }}
      role="region"
      aria-label="Treasure to claim"
    >
      <div className="loot-claim-head">
        <span className="loot-claim-eyebrow">Treasure</span>
        <span className="loot-claim-room">{drop.roomName}</span>
      </div>

      {offline && (
        <p className="loot-claim-offline">Claiming is paused while the game is offline.</p>
      )}

      {drop.items.length > 0 && (
        <ul className="loot-claim-lines">
          {drop.items.map((line) => {
            const mine = charClaimQty(line, charId);
            const remaining = lineRemaining(line);
            const others = othersOn(line);
            const stack = line.qty > 1;
            return (
              <li key={line.lineId} className={`loot-claim-line${mine > 0 ? ' is-mine' : ''}`}>
                <div className="loot-claim-line-main">
                  <span className="loot-claim-name">
                    {line.name}{line.variant ? ` (${line.variant})` : ''}
                    {stack && <span className="loot-claim-qty">×{line.qty}</span>}
                  </span>
                  {others && <span className="loot-claim-others">also: {others}</span>}
                </div>

                {stack ? (
                  <div className="loot-claim-stepper" role="group" aria-label={`Claim ${line.name}`}>
                    <button
                      type="button"
                      className="loot-claim-step"
                      disabled={offline || mine === 0}
                      aria-label={`Release one ${line.name}`}
                      onClick={() => claimLine(line.lineId, charId, mine - 1)}
                    >
                      −
                    </button>
                    <span className="loot-claim-mine" aria-label={`You claim ${mine} of ${line.qty}`}>
                      {mine}
                    </span>
                    <button
                      type="button"
                      className="loot-claim-step"
                      disabled={offline || remaining === 0}
                      aria-label={`Claim one ${line.name}`}
                      onClick={() => claimLine(line.lineId, charId, mine + 1)}
                    >
                      +
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`loot-claim-toggle${mine > 0 ? ' is-mine' : ''}`}
                    disabled={offline || (mine === 0 && lineClaimedQty(line) > 0)}
                    aria-pressed={mine > 0}
                    onClick={() => claimLine(line.lineId, charId, mine > 0 ? 0 : 1)}
                  >
                    {mine > 0 ? '✓ Yours' : lineClaimedQty(line) > 0 ? 'Claimed' : 'Claim'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {drop.gold > 0 && (
        <p className="loot-claim-gold">
          Your gold share: <strong>{myGold} gp</strong>
          <span className="loot-claim-gold-note"> (even split — GM can adjust)</span>
        </p>
      )}

      <p className="loot-claim-foot">Claim what's yours — the GM hands it out on finalize.</p>
    </div>
  );
};

export default LootClaimSheet;
