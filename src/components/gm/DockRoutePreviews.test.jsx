import React from 'react';
import { screen, act } from '@testing-library/react';
import { renderWithProviders } from '../../test/renderWithProviders';
import { pushRelayFixture } from '../../test/relayFixtures';
import { RELAY } from '../../sync/keys';
import DockRoutePreviews from './DockRoutePreviews';

beforeEach(() => window.localStorage.clear());

const setProtocol = (session, protocol = 16) => {
  act(() => { session.push('global', RELAY.BRIDGEHELLO, { protocol, module: '0.0.0-test' }); });
};

describe('DockRoutePreviews (#1744 S3/WS-4)', () => {
  it('renders nothing with no live preview', () => {
    const { session } = renderWithProviders(<DockRoutePreviews />);
    setProtocol(session);
    expect(screen.queryByTestId('dock-route-previews')).not.toBeInTheDocument();
  });

  it('lists a mover from the UNFILTERED GM channel, including a hostile the player channel would drop', () => {
    const { session } = renderWithProviders(<DockRoutePreviews />);
    setProtocol(session);
    act(() => { pushRelayFixture(session, RELAY.PATHPREVIEWGM, { ts: Date.now() }); });

    const row = screen.getByTestId('dock-route-row');
    expect(row).toHaveTextContent('Ambusher'); // the recorded fixture's GM-only name
    expect(row).toHaveTextContent('moving');
  });

  it('never reads the filtered player channel', () => {
    const { session } = renderWithProviders(<DockRoutePreviews />);
    setProtocol(session);
    act(() => { pushRelayFixture(session, RELAY.PATHPREVIEW, { ts: Date.now() }); });

    expect(screen.queryByTestId('dock-route-previews')).not.toBeInTheDocument();
  });

  it('shows nothing below the map-move protocol floor', () => {
    const { session } = renderWithProviders(<DockRoutePreviews />);
    setProtocol(session, 15);
    act(() => { pushRelayFixture(session, RELAY.PATHPREVIEWGM, { ts: Date.now() }); });

    expect(screen.queryByTestId('dock-route-previews')).not.toBeInTheDocument();
  });
});
