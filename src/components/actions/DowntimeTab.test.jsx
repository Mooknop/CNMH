import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import DowntimeTab from './DowntimeTab';
import { useSyncedState } from '../../hooks/useSyncedState';
import { useCharacter } from '../../hooks/useCharacter';
import { useContent } from '../../contexts/ContentContext';
import { useShops } from '../../hooks/useShops';

vi.mock('../../contexts/GameDateContext', () => ({
  useGameDate: () => ({
    formatGameDate: () => '5 Pharast, 4725 AR',
    formatClockTime: () => '08:00',
    getCurrentWeekday: () => 'Oathday',
  }),
}));

vi.mock('../../hooks/useSyncedState', () => ({
  useSyncedState: vi.fn(() => [null, vi.fn()]),
}));

vi.mock('../../hooks/useCharacter', () => ({ useCharacter: vi.fn() }));
vi.mock('../../contexts/ContentContext', () => ({ useContent: vi.fn() }));
vi.mock('../../hooks/useShops', () => ({ useShops: vi.fn() }));

vi.mock('../shop/ShopStorefront', () => ({
  default: function DummyShopStorefront({ isOpen, shops }) {
    return isOpen ? <div data-testid="shop-modal" data-count={shops.length} /> : null;
  }
}));

vi.mock('./DowntimeAllocator', () => ({
  default: function DummyDowntimeAllocator({ character: c, block }) {
    return <div data-testid="downtime-allocator" data-charid={c?.id} data-days={block?.days} />;
  }
}));

vi.mock('./DowntimePartyLedger', () => ({
  default: function DummyDowntimePartyLedger({ character: c, block }) {
    return <div data-testid="downtime-party-ledger" data-charid={c?.id} data-days={block?.days} />;
  }
}));

vi.mock('./EarnIncomeResolver', () => ({
  default: function DummyEarnIncomeResolver({ character: c }) {
    return <div data-testid="earn-income-resolver" data-charid={c?.id} />;
  }
}));

vi.mock('./DowntimeCompletion', () => ({
  default: function DummyDowntimeCompletion({ activity }) {
    return <div data-testid="downtime-completion" data-activity={activity} />;
  }
}));

vi.mock('../inventory/CraftingModal', () => ({
  default: function DummyCraftingModal({ isOpen }) {
    return isOpen ? <div data-testid="crafting-modal">Crafting Modal</div> : null;
  }
}));

vi.mock('./CraftingProjects', () => ({
  default: function DummyCraftingProjects({ character: c }) {
    return <div data-testid="crafting-projects" data-charid={c?.id} />;
  }
}));

const character = { id: 'char-1', name: 'Pellias' };

// DowntimeTab calls useSyncedState twice: first for the block, then for the
// per-PC downtime state. Helpers set both in order, stamping the block with a
// period id and the downtime state with the matching periodStartedAt so the
// period-scoped reads see live (current-period) data.
const PERIOD = 'P1';
const withBlock = (block, downtime = null) => {
  const stampedBlock = block ? { startedAt: PERIOD, ...block } : block;
  const stampedDowntime = downtime ? { periodStartedAt: PERIOD, ...downtime } : downtime;
  useSyncedState
    .mockReturnValueOnce([stampedBlock, vi.fn()])    // cnmh_downtimeblock_global
    .mockReturnValueOnce([stampedDowntime, vi.fn()]); // cnmh_downtime_<charId>
};

// Put the party in a location with one shop child and stock that shop, so the
// real getShopsForLocation resolves a non-empty list. Keyed by state name so it
// stays stable across the re-render the Shop click triggers.
const withShopLocation = () => {
  useSyncedState.mockImplementation((key) =>
    key === 'cnmh_campaign_global' ? [{ locationLoreId: 'sandpoint' }, vi.fn()] : [null, vi.fn()]
  );
  useContent.mockReturnValue({
    loreEntries: [
      { id: 'bottled-solutions', title: 'Bottled Solutions', category: 'Location', parent: 'sandpoint' },
    ],
  });
  useShops.mockReturnValue({ shops: { 'bottled-solutions': { wares: [{ ref: 'antidote' }] } } });
};

beforeEach(() => {
  vi.clearAllMocks();
  useSyncedState.mockReturnValue([null, vi.fn()]);
  useCharacter.mockReturnValue({ skillProficiencies: { crafting: 0 } });
  useContent.mockReturnValue({ loreEntries: [] });
  useShops.mockReturnValue({ shops: {} });
});

describe('DowntimeTab', () => {
  it('shows the Downtime label and the current date/time', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Downtime')).toBeInTheDocument();
    expect(screen.getByText(/Oathday.*Pharast/)).toBeInTheDocument();
    expect(screen.getByText('08:00')).toBeInTheDocument();
  });

  it('shows "Not started" and a hint when no block is active', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
    expect(screen.getByText(/hasn.t started a downtime period/i)).toBeInTheDocument();
  });

  it('shows the granted day budget when a block is active', () => {
    withBlock({ days: 7, active: true });
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('7 days available')).toBeInTheDocument();
    expect(screen.queryByText(/hasn.t started a downtime period/i)).not.toBeInTheDocument();
  });

  it('singularises a one-day budget', () => {
    withBlock({ days: 1, active: true });
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('1 day available')).toBeInTheDocument();
  });

  it('treats an inactive block as not started', () => {
    withBlock({ days: 7, active: false });
    render(<DowntimeTab character={character} />);
    expect(screen.getByText('Not started')).toBeInTheDocument();
  });

  it('renders the DowntimeAllocator for the character when the block is active', () => {
    withBlock({ days: 7, active: true });
    render(<DowntimeTab character={character} />);
    const allocator = screen.getByTestId('downtime-allocator');
    expect(allocator).toHaveAttribute('data-charid', 'char-1');
    expect(allocator).toHaveAttribute('data-days', '7');
  });

  it('hides the DowntimeAllocator when no block is active', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.queryByTestId('downtime-allocator')).not.toBeInTheDocument();
  });

  describe('lock-gated resolution', () => {
    it('hides the Earn Income resolver while the plan is still being planned', () => {
      withBlock({ days: 7, active: true }, { plan: { 'Earn Income': 2 }, status: 'planning' });
      render(<DowntimeTab character={character} />);
      expect(screen.queryByTestId('earn-income-resolver')).not.toBeInTheDocument();
    });

    it('shows the Earn Income resolver once the plan is locked in', () => {
      withBlock({ days: 7, active: true }, { plan: { 'Earn Income': 2 }, status: 'ready' });
      render(<DowntimeTab character={character} />);
      expect(screen.getByTestId('earn-income-resolver')).toHaveAttribute('data-charid', 'char-1');
    });

    it('hides Retrain/Research completion while the plan is still being planned', () => {
      withBlock({ days: 7, active: true }, { plan: { Research: 2 }, status: 'planning' });
      render(<DowntimeTab character={character} />);
      expect(screen.queryByTestId('downtime-completion')).not.toBeInTheDocument();
    });

    it('shows Research completion once the plan is locked in', () => {
      withBlock({ days: 7, active: true }, { plan: { Research: 2 }, status: 'ready' });
      render(<DowntimeTab character={character} />);
      const completion = screen.getByTestId('downtime-completion');
      expect(completion).toHaveAttribute('data-activity', 'Research');
    });
  });

  describe('Shop launcher', () => {
    it('is hidden when the current location has no shops', () => {
      render(<DowntimeTab character={character} />);
      expect(screen.queryByText('Shop')).not.toBeInTheDocument();
    });

    it('shows a Shop button (with shop count) and opens the modal when the location has shops', () => {
      withShopLocation();
      render(<DowntimeTab character={character} />);
      const btn = screen.getByText('Shop');
      expect(btn).toBeInTheDocument();
      fireEvent.click(btn);
      const modal = screen.getByTestId('shop-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveAttribute('data-count', '1');
    });
  });

  it('hides the Crafting button and projects panel when untrained in Crafting', () => {
    render(<DowntimeTab character={character} />);
    expect(screen.queryByText('Crafting Recipes')).not.toBeInTheDocument();
    expect(screen.queryByTestId('crafting-projects')).not.toBeInTheDocument();
  });

  it('shows the Crafting button, projects panel, and opens the modal when trained in Crafting', () => {
    useCharacter.mockReturnValue({ skillProficiencies: { crafting: 1 } });
    render(<DowntimeTab character={character} />);
    expect(screen.getByTestId('crafting-projects')).toBeInTheDocument();
    const btn = screen.getByText('Crafting Recipes');
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(screen.getByTestId('crafting-modal')).toBeInTheDocument();
  });
});
