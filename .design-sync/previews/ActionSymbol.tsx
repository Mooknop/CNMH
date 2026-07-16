import { ActionSymbol } from 'chaotic-neutral-milk-hotel';

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
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
    <span style={{ width: '110px', color: 'var(--shell-text-secondary)', fontSize: '0.85rem' }}>{label}</span>
    {children}
  </div>
);

// Bare-glyph API (`cost`) — the genuine PF2e action font characters.
export const ActionCosts = () => (
  <Shell>
    <Row label="1 action"><ActionSymbol cost={1} /></Row>
    <Row label="2 actions"><ActionSymbol cost={2} /></Row>
    <Row label="3 actions"><ActionSymbol cost={3} /></Row>
    <Row label="Reaction"><ActionSymbol cost="reaction" /></Row>
    <Row label="Free action"><ActionSymbol cost="free" /></Row>
  </Shell>
);

// Costs with no font glyph fall back to their text.
export const TextFallbacks = () => (
  <Shell>
    <Row label="Duration"><ActionSymbol cost="1 Minute" /></Row>
    <Row label="Passive"><ActionSymbol cost="passive" /></Row>
  </Shell>
);

// Wrapper API (`actionText`) — sized wrapper markup with hover tooltip.
export const WrapperSizes = () => (
  <Shell>
    <Row label="Small"><ActionSymbol actionText="Two Actions" size="small" /></Row>
    <Row label="Medium"><ActionSymbol actionText="Two Actions" size="medium" /></Row>
    <Row label="Large"><ActionSymbol actionText="Two Actions" size="large" /></Row>
  </Shell>
);

export const VariableRange = () => (
  <Shell>
    <Row label="1–3 actions"><ActionSymbol actionText="One to Three Actions" /></Row>
    <Row label="Reaction"><ActionSymbol actionText="Reaction" /></Row>
  </Shell>
);
