import { UseActionChip } from 'chaotic-neutral-milk-hotel';

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
    {children}
  </div>
);

const Row = ({ label, children }: { label: string; children?: any }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '10px' }}>
    <span style={{ width: '150px', color: 'var(--shell-text-secondary)', fontSize: '0.85rem' }}>
      {label}
    </span>
    {children}
  </div>
);

// Standard action costs — ember-orange action chips with the PF2e cost symbol.
export const ActionCosts = () => (
  <Shell>
    <Row label="1 action"><UseActionChip cost={1} name="Raise a Shield" /></Row>
    <Row label="2 actions"><UseActionChip cost={2} name="Sudden Charge" /></Row>
    <Row label="3 actions"><UseActionChip cost={3} name="Whirlwind Strike" /></Row>
  </Shell>
);

// Auto-resolved color variants — reaction (arcane purple) and free (verdant green).
export const ReactionAndFree = () => (
  <Shell>
    <Row label="Reaction"><UseActionChip cost="reaction" name="Shield Block" /></Row>
    <Row label="Free action"><UseActionChip cost="free" name="Quick Draw" /></Row>
  </Shell>
);

// 'Cast' verb — the SpellCard flavor of the same chip.
export const CastVerb = () => (
  <Shell>
    <Row label="Cast 2 actions"><UseActionChip cost={2} verb="Cast" name="Fireball" /></Row>
    <Row label="Cast reaction"><UseActionChip cost="reaction" verb="Cast" name="Counter Performance" /></Row>
  </Shell>
);

// Variable cost — gold chip with the pip dropdown (Heal, 1–3 actions).
export const VariableCost = () => (
  <Shell>
    <Row label="Heal 1–3 actions">
      <UseActionChip verb="Cast" variableRange={{ min: 1, max: 3 }} name="Heal" />
    </Row>
    <Row label="Magic Missile 1–3">
      <UseActionChip verb="Cast" variableRange={{ min: 1, max: 3 }} name="Magic Missile" />
    </Row>
  </Shell>
);

// Inactive 'Hold' state — the held-item gate (weapon not in hand).
export const HoldState = () => (
  <Shell>
    <Row label="Item not in hand"><UseActionChip cost={1} inactive name="Strike — Warhammer" /></Row>
    <Row label="Held reaction"><UseActionChip cost="reaction" inactive name="Shield Block" /></Row>
  </Shell>
);
