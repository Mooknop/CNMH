import { CollapsibleCard } from 'chaotic-neutral-milk-hotel';

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

export const Collapsed = () => (
  <Shell>
    <CollapsibleCard header={<strong>Consumables</strong>}>
      <p>Hidden until expanded.</p>
    </CollapsibleCard>
  </Shell>
);

export const Expanded = () => (
  <Shell>
    <CollapsibleCard header={<strong>Attacks</strong>} initialExpanded>
      <div style={{ padding: '0.25rem 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
          <span>Flaming Longsword +1</span>
          <span style={{ color: 'var(--shell-text-secondary)' }}>+11 · 1d8+4 S, 1d6 fire</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0' }}>
          <span>Shortbow</span>
          <span style={{ color: 'var(--shell-text-secondary)' }}>+9 · 1d6 P, range 60 ft.</span>
        </div>
      </div>
    </CollapsibleCard>
  </Shell>
);

export const WithHeaderRight = () => (
  <Shell>
    <CollapsibleCard
      header={<strong>Party Ledger</strong>}
      headerRight={<span style={{ color: 'var(--gold-light, #c49a2e)' }}>124 gp</span>}
      initialExpanded
    >
      <p style={{ margin: 0 }}>Shared party funds and pending shares.</p>
    </CollapsibleCard>
  </Shell>
);

export const AccentColor = () => (
  <Shell>
    <CollapsibleCard
      header={<strong>Spells</strong>}
      themeColor="var(--theme-arcane)"
      initialExpanded
    >
      <p style={{ margin: 0 }}>Prepared spells and focus points.</p>
    </CollapsibleCard>
  </Shell>
);
