import { PenaltyDisplay } from 'chaotic-neutral-milk-hotel';

// The app is dark throughout — every story sits on the shell surface.
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

// A little stat-block context so the number reads like it does in the sheet.
const Stat = ({ label, children }: { label: string; children?: any }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.6rem', fontSize: '1.3rem' }}>
    <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--shell-text-secondary)', minWidth: '7.5rem' }}>
      {label}
    </span>
    {children}
  </div>
);

const noMod = { total: 0, sources: [] };

export const Unmodified = () => (
  <Shell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Stat label="Armor Class">
        <PenaltyDisplay base={18} penalty={noMod} />
      </Stat>
      <Stat label="Athletics">
        <PenaltyDisplay base={11} penalty={noMod} format="modifier" />
      </Stat>
      <Stat label="Will Save">
        <PenaltyDisplay base={-1} penalty={noMod} format="modifier" />
      </Stat>
    </div>
  </Shell>
);

export const NetPenalty = () => (
  <Shell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Stat label="Armor Class">
        <PenaltyDisplay
          base={18}
          penalty={{
            total: -2,
            sources: [{ label: 'Frightened 2', penalty: -2 }],
          }}
        />
      </Stat>
      <Stat label="Athletics">
        <PenaltyDisplay
          base={11}
          format="modifier"
          penalty={{
            total: -3,
            sources: [
              { label: 'Frightened 2', penalty: -2 },
              { label: 'Enfeebled 1', penalty: -1 },
            ],
          }}
        />
      </Stat>
    </div>
  </Shell>
);

export const NetBonus = () => (
  <Shell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <Stat label="Attack">
        <PenaltyDisplay
          base={12}
          format="modifier"
          penalty={{
            total: 2,
            sources: [
              { label: 'Heroism', bonus: 1, isBuff: true },
              { label: 'Courageous Anthem', bonus: 1, isBuff: true },
            ],
          }}
        />
      </Stat>
      <Stat label="Armor Class">
        <PenaltyDisplay
          base={18}
          penalty={{
            total: 2,
            sources: [{ label: 'Raised Shield', bonus: 2, isBuff: true }],
          }}
        />
      </Stat>
    </div>
  </Shell>
);

// The modifier tooltip only shows on hover — force it visible here so the
// breakdown styling can be reviewed statically.
export const ModifierTooltip = () => (
  <Shell>
    <style>{'.pd-force-tooltip .pd-tooltip { display: block; }'}</style>
    <div className="pd-force-tooltip" style={{ paddingTop: '130px', display: 'flex', justifyContent: 'center' }}>
      <Stat label="Speed">
        <PenaltyDisplay
          base={30}
          penalty={{
            total: -10,
            sources: [
              { label: 'Encumbered', penalty: -10 },
              { label: 'Longstrider', bonus: 10, isBuff: true },
              { label: 'Clumsy 1 (terrain)', penalty: -10 },
            ],
          }}
        />
      </Stat>
    </div>
  </Shell>
);
