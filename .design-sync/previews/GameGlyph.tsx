import { GameGlyph } from 'chaotic-neutral-milk-hotel';

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

const Cell = ({ label, color, size = '28px', children }: any) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', width: '92px' }}>
    <span style={{ fontSize: size, color, lineHeight: 1 }}>{children}</span>
    <span style={{ fontSize: '0.7rem', color: 'var(--shell-text-tertiary)', textAlign: 'center' }}>{label}</span>
  </div>
);

const Grid = ({ children }: { children?: any }) => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '14px 4px' }}>{children}</div>
);

// Full registry sweep — every key in GAME_GLYPHS, painted with currentColor.
export const Registry = () => (
  <Shell>
    <Grid>
      <Cell label="attachment"><GameGlyph name="attachment" title="Attachment" /></Cell>
      <Cell label="spellSlot"><GameGlyph name="spellSlot" title="Spell slot" /></Cell>
      <Cell label="focusBard"><GameGlyph name="focusBard" title="Bard focus" /></Cell>
      <Cell label="focusSorcerer"><GameGlyph name="focusSorcerer" title="Sorcerer focus" /></Cell>
      <Cell label="focusMonk"><GameGlyph name="focusMonk" title="Monk focus" /></Cell>
      <Cell label="focusChampion"><GameGlyph name="focusChampion" title="Champion focus" /></Cell>
      <Cell label="profOffense"><GameGlyph name="profOffense" title="Offense proficiency" /></Cell>
      <Cell label="profDefense"><GameGlyph name="profDefense" title="Defense proficiency" /></Cell>
      <Cell label="profArmor"><GameGlyph name="profArmor" title="Armor proficiency" /></Cell>
      <Cell label="augmentation"><GameGlyph name="augmentation" title="Augmentation slot" /></Cell>
    </Grid>
  </Shell>
);

// currentColor tinting — the same knobs the tile/pip tints use (color via span).
export const Tinting = () => (
  <Shell>
    <Grid>
      <Cell label="spell slot — gold" color="var(--gold-light, #e0bc5a)"><GameGlyph name="spellSlot" /></Cell>
      <Cell label="bard — arcane" color="var(--arcane-light, #a98fd8)"><GameGlyph name="focusBard" /></Cell>
      <Cell label="champion — ember" color="var(--ember-light, #e8794a)"><GameGlyph name="focusChampion" /></Cell>
      <Cell label="monk — verdant" color="var(--verdant-light, #6fca8f)"><GameGlyph name="focusMonk" /></Cell>
      <Cell label="attachment — muted" color="var(--shell-text-tertiary)"><GameGlyph name="attachment" /></Cell>
    </Grid>
  </Shell>
);

// Sizes track font-size (glyph is 1em square) — pip, inline, tile medallion.
export const Sizing = () => (
  <Shell>
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '20px' }}>
      <Cell label="14px pip" size="14px" color="var(--gold-light, #e0bc5a)"><GameGlyph name="focusSorcerer" /></Cell>
      <Cell label="20px inline" size="20px" color="var(--gold-light, #e0bc5a)"><GameGlyph name="focusSorcerer" /></Cell>
      <Cell label="32px chip" size="32px" color="var(--gold-light, #e0bc5a)"><GameGlyph name="focusSorcerer" /></Cell>
      <Cell label="48px medallion" size="48px" color="var(--gold-light, #e0bc5a)"><GameGlyph name="focusSorcerer" /></Cell>
    </div>
  </Shell>
);
