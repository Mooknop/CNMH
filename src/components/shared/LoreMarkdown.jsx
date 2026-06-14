import React, { useMemo } from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import { buildTitleToIdMap, resolveWikilink } from '../../utils/loreUtils';

// Custom link protocol used to smuggle `[[wikilinks]]` through react-markdown's
// standard link pipeline. The target title is encoded into the URL; WikiLink
// decodes and resolves it against the scoped entry list.
const WIKILINK_PREFIX = 'wikilink:';

// Encode a wikilink target into a markdown-link-safe URL segment. encodeURIComponent
// leaves `()` untouched, which would prematurely terminate `(...)` link syntax, so
// escape them too. Decoded back with decodeURIComponent.
function encodeTarget(target) {
  return encodeURIComponent(target).replace(/\(/g, '%28').replace(/\)/g, '%29');
}

// Rewrite `[[Target]]` / `[[Target|alias]]` into a standard markdown link with the
// wikilink: protocol: `[display](wikilink:Target)`. Brackets in the display text
// are escaped so they don't break link-text parsing.
function preprocessWikilinks(content) {
  return String(content || '').replace(/\[\[([^\]]+)\]\]/g, (_match, inner) => {
    const [rawTarget, rawAlias] = inner.split('|');
    const target = rawTarget.trim();
    const display = (rawAlias != null ? rawAlias : rawTarget).trim().replace(/([[\]])/g, '\\$1');
    return `[${display}](${WIKILINK_PREFIX}${encodeTarget(target)})`;
  });
}

// Let the wikilink: protocol pass through; everything else goes through the
// default (which strips dangerous protocols like javascript:).
const urlTransform = (url) => (url.startsWith(WIKILINK_PREFIX) ? url : defaultUrlTransform(url));

/**
 * Renders lore `content` as markdown and turns wikilinks into in-drawer
 * navigation. A wikilink that resolves to an entry in `entries` (already scoped
 * to revealed-only on player surfaces) becomes a navigate button; an unresolvable
 * one renders as plain text with no hint of hidden content.
 */
const LoreMarkdown = ({ content, entries, onNavigate }) => {
  const titleMap = useMemo(() => buildTitleToIdMap(entries), [entries]);
  const processed = useMemo(() => preprocessWikilinks(content), [content]);

  const components = useMemo(
    () => ({
      a({ href, children, ...props }) {
        if (href && href.startsWith(WIKILINK_PREFIX)) {
          const target = decodeURIComponent(href.slice(WIKILINK_PREFIX.length));
          const id = resolveWikilink(target, titleMap);
          if (id) {
            return (
              <button type="button" className="lore-link" onClick={() => onNavigate(id)}>
                {children}
              </button>
            );
          }
          return <span>{children}</span>;
        }
        return (
          <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
            {children}
          </a>
        );
      },
    }),
    [titleMap, onNavigate]
  );

  return (
    <ReactMarkdown urlTransform={urlTransform} components={components}>
      {processed}
    </ReactMarkdown>
  );
};

export default LoreMarkdown;
