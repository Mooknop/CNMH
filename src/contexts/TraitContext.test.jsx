import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { TraitProvider, useTrait, TraitContext } from './TraitContext';

vi.mock('./ContentContext', () => ({
  useContent: () => ({
    traits: [
      { id: 'fire', name: 'Fire', description: 'Associated with fire.' },
      { id: 'cold', name: 'Cold', description: 'Associated with cold.' },
    ],
  }),
}));

vi.mock('../components/shared/TraitModal', () => ({ default: ({ isOpen, trait, onClose }) =>
  isOpen ? <div data-testid="trait-modal">{trait?.name}</div> : null
}));

const TestConsumer = () => {
  const { traits, openTraitModal, closeTraitModal } = useTrait();
  return (
    <div>
      <span data-testid="trait-count">{traits.length}</span>
      <button onClick={() => openTraitModal('Fire')}>Open Fire</button>
      <button onClick={() => openTraitModal('Unknown')}>Open Unknown</button>
      <button onClick={closeTraitModal}>Close</button>
    </div>
  );
};

describe('TraitContext', () => {
  it('provides traits data from JSON', async () => {
    render(
      <TraitProvider>
        <TestConsumer />
      </TraitProvider>
    );
    // useEffect sets traits after mount
    await act(async () => {});
    expect(screen.getByTestId('trait-count').textContent).toBe('2');
  });

  it('openTraitModal opens the modal with the matching trait', async () => {
    render(
      <TraitProvider>
        <TestConsumer />
      </TraitProvider>
    );
    await act(async () => {});

    act(() => {
      screen.getByText('Open Fire').click();
    });
    expect(screen.getByTestId('trait-modal')).toHaveTextContent('Fire');
  });

  it('closeTraitModal closes the modal', async () => {
    render(
      <TraitProvider>
        <TestConsumer />
      </TraitProvider>
    );
    await act(async () => {});

    act(() => { screen.getByText('Open Fire').click(); });
    expect(screen.getByTestId('trait-modal')).toBeInTheDocument();

    act(() => { screen.getByText('Close').click(); });
    expect(screen.queryByTestId('trait-modal')).not.toBeInTheDocument();
  });

  it('does not open modal for unknown trait', async () => {
    render(
      <TraitProvider>
        <TestConsumer />
      </TraitProvider>
    );
    await act(async () => {});

    act(() => { screen.getByText('Open Unknown').click(); });
    expect(screen.queryByTestId('trait-modal')).not.toBeInTheDocument();
  });

  it('useTrait returns context value', () => {
    const TestHook = () => {
      const ctx = useTrait();
      return <span>{ctx ? 'has-context' : 'no-context'}</span>;
    };
    render(<TraitProvider><TestHook /></TraitProvider>);
    expect(screen.getByText('has-context')).toBeInTheDocument();
  });
});
