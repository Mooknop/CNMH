import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
import { useContent } from '../../contexts/ContentContext';
import TraitsField from './TraitsField';

const defs = [
  { id: 'fire', name: 'Fire' },
  { id: 'cold', name: 'Cold' },
  { id: 'finesse', name: 'Finesse' },
];

// Controlled host so the field round-trips its CSV through real state, the same
// way the GM editors drive it.
const Harness = ({ initial = '' }) => {
  const [v, setV] = React.useState(initial);
  return (
    <>
      <TraitsField ariaLabel="traits" value={v} onChange={setV} />
      <output data-testid="val">{v}</output>
    </>
  );
};

const chipOf = (name) => screen.getByText(name).closest('.traits-field__chip');

beforeEach(() => useContent.mockReturnValue({ traits: defs }));
afterEach(() => vi.restoreAllMocks());

describe('TraitsField', () => {
  it('renders a chip per CSV entry', () => {
    render(<Harness initial="Fire, Cold" />);
    expect(chipOf('Fire')).toBeInTheDocument();
    expect(chipOf('Cold')).toBeInTheDocument();
  });

  it('flags a chip with no matching definition as an orphan', () => {
    render(<Harness initial="Fire, Frobnicate" />);
    expect(chipOf('Fire')).not.toHaveClass('traits-field__chip--orphan');
    expect(chipOf('Frobnicate')).toHaveClass('traits-field__chip--orphan');
  });

  it('adds a trait on Enter', () => {
    render(<Harness />);
    const input = screen.getByLabelText('traits');
    fireEvent.change(input, { target: { value: 'Cold' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('val')).toHaveTextContent('Cold');
  });

  it('commits complete tokens when a comma is typed or pasted', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('traits'), { target: { value: 'Fire, Cold' } });
    expect(screen.getByTestId('val')).toHaveTextContent('Fire, Cold');
  });

  it('commits pending text on blur', () => {
    render(<Harness />);
    const input = screen.getByLabelText('traits');
    fireEvent.change(input, { target: { value: 'Cold' } });
    fireEvent.blur(input);
    expect(screen.getByTestId('val')).toHaveTextContent('Cold');
  });

  it('adds a definition by picking a suggestion', () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText('traits'), { target: { value: 'fi' } });
    // 'Fire' and 'Finesse' both match 'fi'
    fireEvent.mouseDown(screen.getByRole('button', { name: 'Finesse' }));
    expect(screen.getByTestId('val')).toHaveTextContent('Finesse');
  });

  it('excludes already-chosen traits from suggestions', () => {
    render(<Harness initial="Fire" />);
    fireEvent.change(screen.getByLabelText('traits'), { target: { value: 'fi' } });
    expect(screen.queryByRole('button', { name: 'Fire' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Finesse' })).toBeInTheDocument();
  });

  it('removes a chip via its remove button', () => {
    render(<Harness initial="Fire, Cold" />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove Fire' }));
    expect(screen.getByTestId('val')).toHaveTextContent('Cold');
    expect(screen.queryByText('Fire')).not.toBeInTheDocument();
  });

  it('dedupes case-insensitively, keeping the first spelling', () => {
    const { container } = render(<Harness initial="Fire" />);
    const input = screen.getByLabelText('traits');
    fireEvent.change(input, { target: { value: 'fire' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByTestId('val')).toHaveTextContent('Fire');
    expect(container.querySelectorAll('.traits-field__chip')).toHaveLength(1);
  });
});
