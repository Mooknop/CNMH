import React from 'react';
import { render, screen } from '@testing-library/react';
import ContainersList from './ContainersList';

jest.mock('./ContainerItem', () => ({ container, themeColor, onItemClick }) => (
  <div data-testid="container-item">{container.name}</div>
));

jest.mock('../../utils/InventoryUtils', () => ({
  isContainer: (item) => !!item.container,
}));

describe('ContainersList', () => {
  it('renders null when inventory is undefined', () => {
    const { container } = render(<ContainersList />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when inventory is not an array', () => {
    const { container } = render(<ContainersList inventory="bad" />);
    expect(container.firstChild).toBeNull();
  });

  it('renders null when no containers in inventory', () => {
    const inventory = [{ id: 1, name: 'Sword' }, { id: 2, name: 'Shield' }];
    const { container } = render(<ContainersList inventory={inventory} />);
    expect(container.firstChild).toBeNull();
  });

  it('renders containers section when containers exist', () => {
    const inventory = [
      { id: 1, name: 'Backpack', container: { ignored: 2 } },
      { id: 2, name: 'Sword' },
    ];
    render(<ContainersList inventory={inventory} themeColor="#ff0000" />);
    expect(screen.getByText('Containers')).toBeInTheDocument();
    expect(screen.getByText('Backpack')).toBeInTheDocument();
  });

  it('renders multiple containers', () => {
    const inventory = [
      { id: 1, name: 'Backpack', container: { ignored: 2 } },
      { id: 2, name: 'Satchel', container: { ignored: 1 } },
    ];
    render(<ContainersList inventory={inventory} themeColor="#ff0000" />);
    expect(screen.getAllByTestId('container-item')).toHaveLength(2);
  });

  it('renders the container info paragraph', () => {
    const inventory = [{ id: 1, name: 'Backpack', container: { ignored: 2 } }];
    render(<ContainersList inventory={inventory} />);
    expect(screen.getByText(/reduce the effective Bulk/)).toBeInTheDocument();
  });
});
