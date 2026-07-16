import { ActionRow } from 'chaotic-neutral-milk-hotel';

const Shell = ({ children }: { children?: any }) => (
  <div
    style={{
      background: 'var(--shell-bg)',
      color: 'var(--shell-text-primary)',
      fontFamily: 'var(--font-ui)',
      padding: '20px',
      borderRadius: '10px',
    }}
  >
    <div style={{ maxWidth: '420px' }}>{children}</div>
  </div>
);

// Encounter action list — PF2e action-cost glyphs rendered in the genuine
// action font ('1' | '2' | '3' | 'R' | 'F' via getActionGlyph).
export const EncounterActions = () => (
  <Shell>
    <ActionRow glyph="1" actionFont name="Strike" rightLabel="attack" />
    <ActionRow glyph="2" actionFont name="Sudden Charge" rightLabel="flourish" />
    <ActionRow glyph="3" actionFont name="Vengeful Oath" rightLabel="champion" />
    <ActionRow glyph="R" actionFont name="Reactive Shield" rightLabel="AC +2" />
    <ActionRow glyph="F" actionFont name="Quick Draw" rightLabel="rogue" />
  </Shell>
);

// Row states — pinned/selected (accent tint + left bar) and greyed-out
// (item not in hand), plus the gold glyph tint used for reactions.
export const States = () => (
  <Shell>
    <ActionRow glyph="1" actionFont name="Raise a Shield" rightLabel="AC +2" active />
    <ActionRow glyph="1" actionFont name="Strike — Longbow" rightLabel="volley 30 ft." inactive />
    <ActionRow glyph="R" actionFont glyphColor="gold" name="Shield Block" rightLabel="reaction" />
  </Shell>
);

// Exploration activities — the arrow glyph + skill right-labels, exactly as
// ExplorationList renders them.
export const ExplorationActivities = () => (
  <Shell>
    <ActionRow glyph="→" name="Avoid Notice" rightLabel="Stealth" />
    <ActionRow glyph="→" name="Treat Wounds" rightLabel="Medicine" active />
    <ActionRow glyph="→" name="Detect Magic" rightLabel="✦ every 60 ft." />
    <ActionRow glyph="→" name="Follow the Expert" />
  </Shell>
);
