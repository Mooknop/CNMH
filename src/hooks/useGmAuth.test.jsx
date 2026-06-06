import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { useGmAuth } from './useGmAuth';

const Probe = () => {
  const { loading, isGm, email } = useGmAuth();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="isGm">{String(isGm)}</span>
      <span data-testid="email">{email || ''}</span>
    </div>
  );
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGmAuth', () => {
  it('reports GM when whoami returns an email', async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: true, json: () => Promise.resolve({ email: 'gm@example.com' }) })
    );
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('isGm').textContent).toBe('true');
    expect(screen.getByTestId('email').textContent).toBe('gm@example.com');
  });

  it('reports not-GM on a 401', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, status: 401 }));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('isGm').textContent).toBe('false');
  });

  it('reports not-GM when the probe throws', async () => {
    global.fetch = vi.fn(() => Promise.reject(new Error('network')));
    render(<Probe />);
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('false'));
    expect(screen.getByTestId('isGm').textContent).toBe('false');
  });
});
