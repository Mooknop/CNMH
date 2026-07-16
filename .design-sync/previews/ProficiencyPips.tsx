import { ProficiencyPips } from 'chaotic-neutral-milk-hotel';

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

/** All five ranks with their labels — Legendary pips render in gold. */
export const RankSweep = () => (
  <Shell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <ProficiencyPips rank={0} showLabel />
      <ProficiencyPips rank={1} showLabel />
      <ProficiencyPips rank={2} showLabel />
      <ProficiencyPips rank={3} showLabel />
      <ProficiencyPips rank={4} showLabel />
    </div>
  </Shell>
);

/** Pips inline beside skill entries, no label. */
export const SkillList = () => (
  <Shell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem', maxWidth: '320px' }}>
      {[
        ['Athletics', '+11', 2],
        ['Stealth', '+7', 1],
        ['Religion', '+19', 4],
        ['Occultism', '+1', 0],
      ].map(([name, mod, rank]: any) => (
        <div
          key={name}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.8rem' }}
        >
          <span style={{ color: 'var(--shell-text-primary)' }}>{name}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <span style={{ color: 'var(--shell-text-secondary, #cbc4ba)' }}>{mod}</span>
            <ProficiencyPips rank={rank} />
          </span>
        </div>
      ))}
    </div>
  </Shell>
);

/** Weapon proficiency rows with labels. */
export const WeaponProficiencies = () => (
  <Shell>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem', maxWidth: '360px' }}>
      {[
        ['Martial Weapons', 2],
        ['Simple Weapons', 2],
        ['Advanced Weapons', 0],
      ].map(([name, rank]: any) => (
        <div key={name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>{name}</span>
          <ProficiencyPips rank={rank} showLabel />
        </div>
      ))}
    </div>
  </Shell>
);
