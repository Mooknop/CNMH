import { Modal } from 'chaotic-neutral-milk-hotel';

const Shell = ({ children }: { children?: any }) => (
  <div
    style={{
      background: 'var(--shell-bg)',
      color: 'var(--shell-text-primary)',
      fontFamily: 'var(--font-ui)',
      padding: '20px',
      borderRadius: '10px',
      minHeight: '520px',
    }}
  >
    {children}
  </div>
);

const row: any = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '0.35rem 0',
  borderBottom: '1px solid rgba(255,255,255,0.06)',
};

/** Canonical open modal — item detail with a themed header. */
export const ItemDetail = () => (
  <Shell>
    <Modal
      isOpen
      onClose={() => {}}
      title="Flaming Longsword +1"
      themeColor="var(--theme-arcane, #7b4fb3)"
    >
      <div style={row}>
        <span>Attack</span>
        <strong>+11 melee</strong>
      </div>
      <div style={row}>
        <span>Damage</span>
        <strong>1d8+4 slashing, 1d6 fire</strong>
      </div>
      <div style={row}>
        <span>Bulk</span>
        <strong>1</strong>
      </div>
      <div style={row}>
        <span>Price</span>
        <strong>110 gp</strong>
      </div>
      <p style={{ marginTop: '0.9rem' }}>
        This blade is wreathed in flickering flame while wielded. On a critical
        hit, the target also takes 1d10 persistent fire damage.
      </p>
    </Modal>
  </Shell>
);

/** Plain header + footer actions — a confirm flow. */
export const ConfirmSell = () => (
  <Shell>
    <Modal isOpen onClose={() => {}} title="Sell Item" maxWidth="440px">
      <p style={{ marginTop: 0 }}>
        Sell <strong>Healing Potion (Lesser)</strong> to Savah&rsquo;s Armory
        for <strong>6 gp</strong>? Vendors pay half the listed price.
      </p>
      <div style={{ display: 'flex', gap: '0.6rem', justifyContent: 'flex-end', marginTop: '1.2rem' }}>
        <button
          type="button"
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            border: '1px solid rgba(255,255,255,0.18)',
            background: 'transparent',
            color: 'var(--shell-text-secondary, #cbc4ba)',
            fontFamily: 'var(--font-ui)',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          style={{
            padding: '0.45rem 1rem',
            borderRadius: '8px',
            border: 'none',
            background: 'var(--color-primary, #c0440e)',
            color: '#fff',
            fontFamily: 'var(--font-ui)',
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Sell for 6 gp
        </button>
      </div>
    </Modal>
  </Shell>
);

/** Bottom slide-up sheet variant (Command Sheet resolvers). */
export const BottomSheet = () => (
  <Shell>
    <Modal isOpen onClose={() => {}} title="Resolve Strike" placement="bottom">
      <div style={row}>
        <span>Roll</span>
        <strong>d20 (14) + 11 = 25 vs AC 21</strong>
      </div>
      <div style={row}>
        <span>Result</span>
        <strong>Hit — roll damage</strong>
      </div>
      <p style={{ marginTop: '0.9rem' }}>
        Apply 1d8+4 slashing and 1d6 fire to the Skeletal Champion.
      </p>
    </Modal>
  </Shell>
);
