import { RankRing } from 'chaotic-neutral-milk-hotel';

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

/** All five proficiency ranks — ring color is the rank signal. */
export const RankSweep = () => (
  <Shell>
    <div className="snode-wrap" style={{ marginBottom: 0 }}>
      <RankRing rank={0} value="+1" name="Occultism" caption="Untrained" />
      <RankRing rank={1} value="+7" name="Stealth" caption="Trained" />
      <RankRing rank={2} value="+11" name="Athletics" caption="Expert" />
      <RankRing rank={3} value="+15" name="Arcana" caption="Master" />
      <RankRing rank={4} value="+19" name="Religion" caption="Legendary" />
    </div>
  </Shell>
);

/** Clickable skill snodes; the selected one glows with the character accent. */
export const SelectedSkill = () => (
  <Shell>
    <div className="snode-wrap" style={{ marginBottom: 0 }}>
      <RankRing rank={2} value="+11" name="Acrobatics" onClick={() => {}} />
      <RankRing rank={2} value="+11" name="Athletics" selected onClick={() => {}} />
      <RankRing rank={1} value="+6" name="Medicine" onClick={() => {}} />
      <RankRing rank={1} value="+6" name="Survival" onClick={() => {}} />
    </div>
  </Shell>
);

/** Static proficiency cluster with captions — attack proficiencies. */
export const AttackCluster = () => (
  <Shell>
    <div className="snode-wrap" style={{ marginBottom: 0 }}>
      <RankRing rank={2} value="+13" name="Simple Weapons" caption="Ranged +11" />
      <RankRing rank={2} value="+13" name="Martial Weapons" caption="+1 item" />
      <RankRing rank={1} value="+9" name="Unarmed" />
      <RankRing rank={0} value="+4" name="Advanced" caption="Untrained" />
    </div>
  </Shell>
);
