import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

const mockSendUpdate = vi.fn();
// getState/subscribe are here for useAuraMembers' useSyncedState read (#1733 S3):
// no aura membership in these fixtures, so every probe resolves "unknown" and
// the console behaves exactly as it did before aura gating existed.
let mockMembers = {}; // charId -> { inside: [...] }
vi.mock('../../contexts/SessionContext', () => ({
  useSession: () => ({
    sendUpdate: mockSendUpdate,
    getState: (charId, type) => (type === 'auramembers' ? mockMembers[charId] : undefined),
    subscribe: () => () => {},
    connected: false,
    foundryConnected: false,
    hydrations: 0,
  }),
  isSandboxWritable: () => true,
}));
const mockAppendEvent = vi.fn();
vi.mock('../../hooks/useSessionLog', () => ({
  useSessionLog: () => ({ appendEvent: mockAppendEvent, log: [] }),
}));

// Pellias holds a damaged-ally reaction; Blu a ranged-attack one; Ashka none.
const mockCharacters = [
  {
    id: 'Pellias',
    name: 'Pellias',
    reactions: [{ name: 'Retributive Strike', triggerType: 'damaged-ally', requiresAllyInAura: true }],
  },
  {
    id: 'Blu',
    name: 'Blu',
    reactions: [{ name: 'Deflect Projectile', triggerType: 'attack-ranged' }],
  },
  { id: 'Ashka', name: 'Ashka' },
];
vi.mock('../../contexts/ContentContext', () => ({
  useContent: () => ({ characters: mockCharacters }),
}));

import GmTriggerConsole from './GmTriggerConsole';

const pcs = [
  { charId: 'Pellias', name: 'Pellias', kind: 'pc', entryId: 'cbt-pellias' },
  { charId: 'Blu',     name: 'Blu',     kind: 'pc', entryId: 'cbt-blu' },
  { charId: 'Ashka',   name: 'Ashka',   kind: 'pc', entryId: 'cbt-ashka' },
];

beforeEach(() => {
  mockSendUpdate.mockClear();
  mockAppendEvent.mockClear();
  mockMembers = {};
});

describe('GmTriggerConsole', () => {
  it('renders nothing when there are no PC entries', () => {
    const { container } = render(<GmTriggerConsole pcEntries={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it('broadcasts a round-stamped reactprompt to all PCs when target is All', () => {
    render(<GmTriggerConsole pcEntries={pcs} round={3} />);
    fireEvent.change(screen.getByLabelText('trigger event'), { target: { value: 'damaged' } });
    fireEvent.change(screen.getByLabelText('trigger note'), { target: { value: 'ogre smash' } });
    fireEvent.click(screen.getByLabelText('Fire trigger'));

    const calls = mockSendUpdate.mock.calls;
    expect(calls).toHaveLength(3);
    calls.forEach((c) => {
      expect(c[1]).toBe('reactprompt');
      expect(c[2]).toMatchObject({ eventId: 'damaged', label: 'PC was damaged', note: 'ogre smash', round: 3 });
      expect(c[2].reqId).toBeTruthy();
    });
  });

  it('sends only to the selected PC when a specific target is chosen', () => {
    render(<GmTriggerConsole pcEntries={pcs} />);
    fireEvent.change(screen.getByLabelText('trigger target'), { target: { value: 'Blu' } });
    fireEvent.click(screen.getByLabelText('Fire trigger'));

    expect(mockSendUpdate).toHaveBeenCalledTimes(1);
    expect(mockSendUpdate.mock.calls[0][0]).toBe('Blu');
  });

  it('each fire gets a distinct reqId and logs a session event', () => {
    render(<GmTriggerConsole pcEntries={[pcs[0]]} />);
    fireEvent.click(screen.getByLabelText('Fire trigger'));
    const req1 = mockSendUpdate.mock.calls[0][2].reqId;
    fireEvent.click(screen.getByLabelText('Fire trigger'));
    const req2 = mockSendUpdate.mock.calls[1][2].reqId;
    expect(req1).not.toBe(req2);
    expect(mockAppendEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'trigger' })
    );
  });

  it('shows which PCs hold a matching reaction for the chosen event', () => {
    render(<GmTriggerConsole pcEntries={pcs} />);
    // Default event is ranged-attack → Blu's Deflect Projectile matches.
    expect(screen.getByLabelText('eligible PCs')).toHaveTextContent('Blu (Deflect Projectile)');

    fireEvent.change(screen.getByLabelText('trigger event'), { target: { value: 'ally-damaged' } });
    expect(screen.getByLabelText('eligible PCs')).toHaveTextContent('Pellias (Retributive Strike)');

    fireEvent.change(screen.getByLabelText('trigger event'), { target: { value: 'enemy-skill-check' } });
    expect(screen.getByLabelText('eligible PCs')).toHaveTextContent(/No PCs/);
  });

  it('clears the note after firing', () => {
    render(<GmTriggerConsole pcEntries={pcs} />);
    fireEvent.change(screen.getByLabelText('trigger note'), { target: { value: 'archer' } });
    fireEvent.click(screen.getByLabelText('Fire trigger'));
    expect(screen.getByLabelText('trigger note')).toHaveValue('');
  });

  // ── Champion aura gating (#1733 S3) ───────────────────────────────────────
  describe('ally-in-aura gating', () => {
    const pickAllyEvent = () =>
      fireEvent.change(screen.getByLabelText('trigger event'), { target: { value: 'ally-damaged' } });

    it('offers the struck-ally picker only for ally events', () => {
      render(<GmTriggerConsole pcEntries={pcs} />);
      expect(screen.queryByLabelText('struck ally')).toBeNull();
      pickAllyEvent();
      expect(screen.getByLabelText('struck ally')).toBeInTheDocument();
    });

    it('keeps current behaviour when membership is unknown, even with an ally named', () => {
      render(<GmTriggerConsole pcEntries={pcs} />);
      pickAllyEvent();
      fireEvent.change(screen.getByLabelText('struck ally'), { target: { value: 'cbt-blu' } });

      expect(screen.getByLabelText('eligible PCs')).toHaveTextContent('Pellias (Retributive Strike)');
      fireEvent.click(screen.getByLabelText('Fire trigger'));
      expect(mockSendUpdate.mock.calls.map((c) => c[0])).toContain('Pellias');
    });

    it('drops the aura-scoped reaction when the bridge says the ally is outside', () => {
      mockMembers = { Pellias: { inside: [{ entryId: 'cbt-ashka' }], ts: 1 } };
      render(<GmTriggerConsole pcEntries={pcs} />);
      pickAllyEvent();
      fireEvent.change(screen.getByLabelText('struck ally'), { target: { value: 'cbt-blu' } });

      expect(screen.getByLabelText('eligible PCs')).toHaveTextContent(/No PCs/);
      fireEvent.click(screen.getByLabelText('Fire trigger'));
      expect(mockSendUpdate.mock.calls.map((c) => c[0])).not.toContain('Pellias');
    });

    it('keeps it — and stamps the ally on the payload — when the ally is inside', () => {
      mockMembers = { Pellias: { inside: [{ entryId: 'cbt-blu' }], ts: 1 } };
      render(<GmTriggerConsole pcEntries={pcs} />);
      pickAllyEvent();
      fireEvent.change(screen.getByLabelText('struck ally'), { target: { value: 'cbt-blu' } });

      expect(screen.getByLabelText('eligible PCs')).toHaveTextContent('Pellias (Retributive Strike)');
      fireEvent.click(screen.getByLabelText('Fire trigger'));
      const toPellias = mockSendUpdate.mock.calls.find((c) => c[0] === 'Pellias');
      expect(toPellias[2]).toMatchObject({ allyEntryId: 'cbt-blu' });
    });

    it('never suppresses when the GM left the ally unspecified', () => {
      mockMembers = { Pellias: { inside: [], ts: 1 } };
      render(<GmTriggerConsole pcEntries={pcs} />);
      pickAllyEvent();

      expect(screen.getByLabelText('eligible PCs')).toHaveTextContent('Pellias (Retributive Strike)');
      fireEvent.click(screen.getByLabelText('Fire trigger'));
      expect(mockSendUpdate.mock.calls.map((c) => c[0])).toContain('Pellias');
    });
  });
});
