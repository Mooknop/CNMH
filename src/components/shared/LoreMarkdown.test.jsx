import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import LoreMarkdown from './LoreMarkdown';

const ENTRIES = [
  { id: 'sandpoint', title: 'Sandpoint' },
  { id: 'late-unpleasantness', title: 'The Late Unpleasantness (4702)' },
];

const renderMd = (content, onNavigate = vi.fn()) => {
  render(<LoreMarkdown content={content} entries={ENTRIES} onNavigate={onNavigate} />);
  return onNavigate;
};

describe('LoreMarkdown', () => {
  it('renders blank-line-separated text as separate paragraphs', () => {
    const { container } = render(
      <LoreMarkdown content={'First para.\n\nSecond para.'} entries={ENTRIES} onNavigate={vi.fn()} />
    );
    const paras = container.querySelectorAll('p');
    expect(paras).toHaveLength(2);
    expect(paras[0]).toHaveTextContent('First para.');
    expect(paras[1]).toHaveTextContent('Second para.');
  });

  it('renders bold, italic, headings, lists, and blockquotes', () => {
    const { container } = render(
      <LoreMarkdown
        content={'# Title\n\n**bold** and *italic*\n\n- one\n- two\n\n> a quote'}
        entries={ENTRIES}
        onNavigate={vi.fn()}
      />
    );
    expect(container.querySelector('h1')).toHaveTextContent('Title');
    expect(container.querySelector('strong')).toHaveTextContent('bold');
    expect(container.querySelector('em')).toHaveTextContent('italic');
    expect(container.querySelectorAll('li')).toHaveLength(2);
    expect(container.querySelector('blockquote')).toHaveTextContent('a quote');
  });

  it('turns a resolvable wikilink into a navigate button', () => {
    const onNavigate = renderMd('Visit [[Sandpoint]] today.');
    const btn = screen.getByRole('button', { name: 'Sandpoint' });
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith('sandpoint');
  });

  it('shows the alias text for a piped wikilink', () => {
    const onNavigate = renderMd('Visit [[Sandpoint|the town]].');
    const btn = screen.getByRole('button', { name: 'the town' });
    fireEvent.click(btn);
    expect(onNavigate).toHaveBeenCalledWith('sandpoint');
  });

  it('resolves a target containing parentheses', () => {
    const onNavigate = renderMd('See [[The Late Unpleasantness (4702)]].');
    fireEvent.click(screen.getByRole('button', { name: /The Late Unpleasantness/ }));
    expect(onNavigate).toHaveBeenCalledWith('late-unpleasantness');
  });

  it('renders an unresolvable wikilink as plain text with no button', () => {
    renderMd('A rumor about [[The Hidden Vault]].');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.getByText(/The Hidden Vault/)).toBeInTheDocument();
  });

  it('renders a real markdown link as an external anchor', () => {
    const { container } = render(
      <LoreMarkdown content={'[docs](https://example.com)'} entries={ENTRIES} onNavigate={vi.fn()} />
    );
    const a = container.querySelector('a');
    expect(a).toHaveAttribute('href', 'https://example.com');
    expect(a).toHaveAttribute('target', '_blank');
    expect(a).toHaveAttribute('rel', 'noopener noreferrer');
  });

  it('renders nothing meaningful for empty content', () => {
    const { container } = render(<LoreMarkdown content="" entries={ENTRIES} onNavigate={vi.fn()} />);
    expect(container.querySelector('button')).toBeNull();
  });
});
