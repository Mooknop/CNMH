import React, { useState } from 'react';
import { useContent } from '../../contexts/ContentContext';
import { toList, findTraitDef, normalizeTraitName } from '../../utils/traitRefs';
import './TraitsField.css';

// Definition-backed chip input for the comma-separated `traits` reference fields
// (#376). A drop-in for the old free-text input: it takes a CSV `value` and
// calls `onChange` with a normalized CSV string, so the surrounding codecs are
// untouched. Suggestions come from the trait-definition catalog
// (`useContent().traits`); ad-hoc entries are still allowed so content stays
// lossless, and a chip whose name has no matching definition is flagged.
const MAX_SUGGESTIONS = 8;

const TraitsField = ({ value, onChange, ariaLabel, placeholder = 'Add a trait…' }) => {
  const { traits } = useContent();
  const defs = Array.isArray(traits) ? traits : [];
  const [text, setText] = useState('');

  const chips = toList(value);

  // Emit a deduped (case-insensitive), de-blanked CSV string upstream.
  const emit = (names) => {
    const seen = new Set();
    const out = [];
    names.forEach((n) => {
      const t = String(n).trim();
      if (!t) return;
      const k = normalizeTraitName(t);
      if (seen.has(k)) return;
      seen.add(k);
      out.push(t);
    });
    onChange(out.join(', '));
  };

  const addNames = (names) => emit([...chips, ...names]);
  const removeAt = (idx) => emit(chips.filter((_, i) => i !== idx));

  const handleTextChange = (e) => {
    const v = e.target.value;
    // A typed or pasted comma commits every complete token as a chip; whatever
    // follows the comma (if any) stays as the pending text.
    if (v.includes(',')) {
      addNames(v.split(','));
      setText('');
    } else {
      setText(v);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (text.trim()) {
        addNames([text]);
        setText('');
      }
    } else if (e.key === 'Backspace' && !text && chips.length) {
      removeAt(chips.length - 1);
    }
  };

  const handleBlur = () => {
    if (text.trim()) {
      addNames(text.split(','));
      setText('');
    }
  };

  const chosen = new Set(chips.map(normalizeTraitName));
  const q = normalizeTraitName(text);
  const suggestions = q
    ? defs
        .filter((d) => {
          const k = normalizeTraitName(d && d.name);
          return k && !chosen.has(k) && k.includes(q);
        })
        .slice(0, MAX_SUGGESTIONS)
    : [];

  return (
    <div className="traits-field">
      <div className="traits-field__chips">
        {chips.map((name, idx) => {
          const orphan = !findTraitDef(name, defs);
          return (
            <span
              key={`${normalizeTraitName(name)}-${idx}`}
              className={`traits-field__chip${orphan ? ' traits-field__chip--orphan' : ''}`}
              title={orphan ? `"${name}" has no trait definition` : name}
            >
              {name}
              <button
                type="button"
                className="traits-field__chip-remove"
                aria-label={`Remove ${name}`}
                onClick={() => removeAt(idx)}
              >
                ×
              </button>
            </span>
          );
        })}
      </div>
      <div className="traits-field__entry">
        <input
          aria-label={ariaLabel}
          className="traits-field__input"
          value={text}
          placeholder={placeholder}
          onChange={handleTextChange}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="traits-field__suggestions" role="listbox">
            {suggestions.map((d) => (
              <li key={d.id || d.name} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="traits-field__suggestion"
                  // mouse-down fires before the input's blur, so the pick is not
                  // swallowed by the blur-commit.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addNames([d.name]);
                    setText('');
                  }}
                >
                  {d.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default TraitsField;
