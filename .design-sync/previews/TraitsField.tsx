import { TraitsField } from 'chaotic-neutral-milk-hotel';

// The app is dark throughout — the field sits on the shell surface.
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

const Field = ({ label, children }: { label: string; children?: any }) => (
  <div style={{ maxWidth: '360px' }}>
    <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--shell-text-secondary)', marginBottom: '0.35rem' }}>
      {label}
    </div>
    {children}
  </div>
);

const noop = () => {};

// NOTE: the preview harness has no ContentProvider catalog, so useContent()
// falls back to an empty trait catalog — every chip carries the "no matching
// definition" orphan styling. That is the honest render in this context.
export const WeaponTraits = () => (
  <Shell>
    <Field label="Traits">
      <TraitsField
        value="agile, finesse, magical"
        onChange={noop}
        ariaLabel="Weapon traits"
      />
    </Field>
  </Shell>
);

export const LongTraitLine = () => (
  <Shell>
    <Field label="Traits">
      <TraitsField
        value="uncommon, evocation, fire, magical, thrown 10 ft., versatile P"
        onChange={noop}
        ariaLabel="Item traits"
      />
    </Field>
  </Shell>
);

export const EmptyField = () => (
  <Shell>
    <Field label="Traits">
      <TraitsField value="" onChange={noop} ariaLabel="Item traits" />
    </Field>
  </Shell>
);
