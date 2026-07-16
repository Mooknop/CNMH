import { TraitTag } from 'chaotic-neutral-milk-hotel';

// The app is dark throughout — every story sits on the shell surface so the
// tag tints read the way they do in the real UI.
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

export const Default = () => (
  <Shell>
    <TraitTag trait="evocation" />
  </Shell>
);

export const ElementalTints = () => (
  <Shell>
    <TraitTag trait="fire" className="fire" />
    <TraitTag trait="cold" className="cold" />
    <TraitTag trait="electricity" className="electricity" />
    <TraitTag trait="sonic" className="sonic" />
    <TraitTag trait="poison" className="poison" />
  </Shell>
);

export const RarityTints = () => (
  <Shell>
    <TraitTag trait="uncommon" className="uncommon" />
    <TraitTag trait="rare" className="rare" />
    <TraitTag trait="unique" className="unique" />
  </Shell>
);

export const ItemTraitLine = () => (
  <Shell>
    <div style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Flaming Longsword +1</div>
    <TraitTag trait="magical" className="magical" />
    <TraitTag trait="fire" className="fire" />
    <TraitTag trait="evocation" />
    <TraitTag trait="versatile P" />
  </Shell>
);
