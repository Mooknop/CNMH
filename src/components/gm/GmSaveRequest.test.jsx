import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSendUpdate = vi.fn();
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({ sendUpdate: mockSendUpdate }),
}));

import GmSaveRequest from './GmSaveRequest';

const pcs = [
  { charId: 'Pellias', name: 'Pellias', kind: 'pc' },
  { charId: 'Ashka',   name: 'Ashka',   kind: 'pc' },
];

beforeEach(() => mockSendUpdate.mockClear());

describe('GmSaveRequest', () => {
  it('renders nothing when there are no PC entries', () => {
    const { container } = render(<GmSaveRequest pcEntries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('Request Save button is disabled until a DC is entered', () => {
    render(<GmSaveRequest pcEntries={pcs} />);
    expect(screen.getByLabelText('Request save')).toBeDisabled();
    fireEvent.change(screen.getByLabelText('save DC'), { target: { value: '18' } });
    expect(screen.getByLabelText('Request save')).not.toBeDisabled();
  });

  it('sends saveprompt to all PCs when target is All', () => {
    render(<GmSaveRequest pcEntries={pcs} />);
    fireEvent.change(screen.getByLabelText('save DC'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('save type'), { target: { value: 'reflex' } });
    fireEvent.change(screen.getByLabelText('effect name'), { target: { value: 'Fireball' } });
    fireEvent.click(screen.getByLabelText('Request save'));

    const calls = mockSendUpdate.mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls.find((c) => c[0] === 'Pellias')).toBeTruthy();
    expect(calls.find((c) => c[0] === 'Ashka')).toBeTruthy();
    calls.forEach((c) => {
      expect(c[1]).toBe('saveprompt');
      expect(c[2]).toMatchObject({ save: 'reflex', dc: 18, effectName: 'Fireball' });
      expect(c[2].reqId).toBeTruthy();
    });
  });

  it('sends saveprompt only to the selected PC when a specific target is chosen', () => {
    render(<GmSaveRequest pcEntries={pcs} />);
    fireEvent.change(screen.getByLabelText('save DC'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('save target'), { target: { value: 'Ashka' } });
    fireEvent.click(screen.getByLabelText('Request save'));

    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    expect(mockSendUpdate.mock.calls[0][0]).toBe('Ashka');
  });

  it('each request gets a distinct reqId', () => {
    render(<GmSaveRequest pcEntries={[pcs[0]]} />);
    fireEvent.change(screen.getByLabelText('save DC'), { target: { value: '15' } });
    fireEvent.click(screen.getByLabelText('Request save'));
    const req1 = mockSendUpdate.mock.calls[0][2].reqId;
    fireEvent.click(screen.getByLabelText('Request save'));
    const req2 = mockSendUpdate.mock.calls[1][2].reqId;
    expect(req1).not.toBe(req2);
  });

  it('clears effect name after sending', () => {
    render(<GmSaveRequest pcEntries={pcs} />);
    fireEvent.change(screen.getByLabelText('save DC'), { target: { value: '18' } });
    fireEvent.change(screen.getByLabelText('effect name'), { target: { value: 'Fireball' } });
    fireEvent.click(screen.getByLabelText('Request save'));
    expect(screen.getByLabelText('effect name')).toHaveValue('');
  });
});
