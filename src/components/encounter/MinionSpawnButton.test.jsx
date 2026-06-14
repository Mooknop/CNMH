import { render, screen, fireEvent } from '@testing-library/react';

const spawn = vi.fn();
const linkFor = vi.fn();

vi.mock('../../hooks/useMinionActors', () => ({
  __esModule: true,
  useMinionActors: () => ({ linkFor, spawn, links: {} }),
}));

import MinionSpawnButton from './MinionSpawnButton';

describe('MinionSpawnButton', () => {
  it('renders nothing when the minion has no Foundry link', () => {
    linkFor.mockReturnValue(null);
    const { container } = render(<MinionSpawnButton ownerId="Ashka" role="companion" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('spawns when linked and not yet on the scene', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: false });
    render(<MinionSpawnButton ownerId="Ashka" role="companion" />);

    const btn = screen.getByRole('button', { name: /spawn zevira/i });
    expect(btn).not.toBeDisabled();
    fireEvent.click(btn);
    expect(spawn).toHaveBeenCalledWith('Ashka', 'companion');
  });

  it('is disabled and labelled "On map" when already placed', () => {
    linkFor.mockReturnValue({ name: 'Zevira', onScene: true });
    render(<MinionSpawnButton ownerId="Ashka" role="companion" />);

    const btn = screen.getByRole('button', { name: /zevira is on the map/i });
    expect(btn).toBeDisabled();
    expect(btn).toHaveTextContent('On map');
  });
});
