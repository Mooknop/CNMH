import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import CollapsibleCard from './CollapsibleCard';

describe('CollapsibleCard', () => {
  it('should render header text', () => {
    render(
      <CollapsibleCard header="Test Header">
        <p>Test Content</p>
      </CollapsibleCard>
    );
    
    expect(screen.getByText('Test Header')).toBeInTheDocument();
  });

  it('should not show content initially when initialExpanded is false', () => {
    render(
      <CollapsibleCard header="Test Header" initialExpanded={false}>
        <p>Test Content</p>
      </CollapsibleCard>
    );
    
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('should show content initially when initialExpanded is true', () => {
    render(
      <CollapsibleCard header="Test Header" initialExpanded={true}>
        <p>Test Content</p>
      </CollapsibleCard>
    );
    
    expect(screen.getByText('Test Content')).toBeInTheDocument();
  });

  it('should toggle content visibility on header click', () => {
    render(
      <CollapsibleCard header="Test Header" initialExpanded={false}>
        <p>Test Content</p>
      </CollapsibleCard>
    );
    
    const header = screen.getByText('Test Header');
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
    
    fireEvent.click(header);
    expect(screen.getByText('Test Content')).toBeInTheDocument();
    
    fireEvent.click(header);
    expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  });

  it('should apply className correctly', () => {
    const { container } = render(
      <CollapsibleCard header="Test" className="custom-class">
        <p>Content</p>
      </CollapsibleCard>
    );
    
    expect(container.querySelector('.collapsible-card.custom-class')).toBeInTheDocument();
  });

  it('should apply inline styles correctly', () => {
    const styles = { backgroundColor: '#f0f0f0', padding: '10px' };
    const { container } = render(
      <CollapsibleCard header="Test" style={styles}>
        <p>Content</p>
      </CollapsibleCard>
    );
    
    const card = container.querySelector('.collapsible-card');
    expect(card).toHaveStyle('background-color: #f0f0f0');
    expect(card).toHaveStyle('padding: 10px');
  });

  it('should display expand icon', () => {
    const { container } = render(
      <CollapsibleCard header="Test Header" initialExpanded={false}>
        <p>Content</p>
      </CollapsibleCard>
    );
    
    const icon = container.querySelector('.expand-icon');
    expect(icon).toBeInTheDocument();
    expect(icon).toHaveTextContent('▶');
  });

  it('should change expand icon when expanded', () => {
    const { container } = render(
      <CollapsibleCard header="Test Header" initialExpanded={false}>
        <p>Content</p>
      </CollapsibleCard>
    );
    
    const icon = container.querySelector('.expand-icon');
    expect(icon).toHaveTextContent('▶');
    
    const header = screen.getByText('Test Header');
    fireEvent.click(header);
    
    expect(icon).toHaveTextContent('▼');
  });

  it('should apply theme color to icon', () => {
    const { container } = render(
      <CollapsibleCard header="Test" themeColor="#ff0000">
        <p>Content</p>
      </CollapsibleCard>
    );

    const icon = container.querySelector('.expand-icon');
    // Color flows through the --collapsible-accent bridge; the CSS class
    // resolves it (jsdom doesn't apply stylesheets, so assert the variable).
    expect(icon).toHaveStyle({ '--collapsible-accent': '#ff0000' });
  });

  it('should render complex header and content', () => {
    render(
      <CollapsibleCard 
        header={<h2>Complex Header</h2>}
        initialExpanded={true}
      >
        <div>
          <p>First paragraph</p>
          <p>Second paragraph</p>
        </div>
      </CollapsibleCard>
    );
    
    expect(screen.getByText('Complex Header')).toBeInTheDocument();
    expect(screen.getByText('First paragraph')).toBeInTheDocument();
    expect(screen.getByText('Second paragraph')).toBeInTheDocument();
  });

  it('should toggle expansion when the toggle area is clicked', () => {
    const { container } = render(
      <CollapsibleCard header="Test">
        <p>Content</p>
      </CollapsibleCard>
    );

    // cursor:pointer now lives on .collapsible-toggle in CollapsibleCard.css
    // (jsdom doesn't apply stylesheets) — assert the behavior instead.
    const toggle = container.querySelector('.collapsible-toggle');
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText('Content')).toBeInTheDocument();
  });
});
