import React from 'react';
import { render, screen, act } from '@testing-library/react';

vi.mock('../../hooks/useSessionLog', () => {
  const ReactLib = require('react');
  let _log = [];
  let _listeners = new Set();
  const useSessionLog = () => {
    const [, rerender] = ReactLib.useReducer((x) => x + 1, 0);
    ReactLib.useEffect(() => {
      _listeners.add(rerender);
      return () => _listeners.delete(rerender);
    }, []);
    const appendEvent = (entry) => {
      _log = [{ id: `e-${_log.length}`, ts: 1700000000000, ...entry }, ..._log];
      _listeners.forEach((fn) => fn());
    };
    return { log: _log, appendEvent };
  };
  return {
    __esModule: true,
    useSessionLog,
    __setLog: (l) => { _log = l; _listeners.forEach((fn) => fn()); },
    __reset:  () => { _log = []; _listeners.forEach((fn) => fn()); },
  };
});

import { __setLog, __reset } from '../../hooks/useSessionLog';
import SessionLogPanel from './SessionLogPanel';

beforeEach(() => __reset());

describe('SessionLogPanel', () => {
  it('shows empty state when log is empty', () => {
    render(<SessionLogPanel />);
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('renders log entries newest-first', () => {
    act(() => __setLog([
      { id: 'a', ts: 1700000060000, type: 'mode',   text: 'Mode → Exploration' },
      { id: 'b', ts: 1700000000000, type: 'save',   text: 'Reflex DC 18 → all PCs' },
    ]));
    render(<SessionLogPanel />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Mode → Exploration');
    expect(items[1]).toHaveTextContent('Reflex DC 18 → all PCs');
  });

  it('displays the correct badge label for each event type', () => {
    act(() => __setLog([
      { id: 'a', ts: 1700000000000, type: 'mode',   text: 'Mode → Downtime' },
      { id: 'b', ts: 1700000000000, type: 'save',   text: 'Fort DC 20' },
      { id: 'c', ts: 1700000000000, type: 'recall', text: 'Arcana DC 22' },
    ]));
    render(<SessionLogPanel />);
    expect(screen.getByText('Mode')).toBeInTheDocument();
    expect(screen.getByText('Save')).toBeInTheDocument();
    expect(screen.getByText('RK')).toBeInTheDocument();
  });

  it('displays formatted HH:MM time for each entry', () => {
    // ts 1700000000000 = 2023-11-14T22:13:20Z; local time depends on TZ,
    // but the component always renders HH:MM so we just assert the pattern.
    act(() => __setLog([{ id: 'a', ts: 1700000000000, type: 'mode', text: 'Mode → Exploration' }]));
    render(<SessionLogPanel />);
    expect(screen.getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument();
  });

  it('updates when new entries are appended', () => {
    render(<SessionLogPanel />);
    expect(screen.getByText(/No events yet/)).toBeInTheDocument();
    act(() => __setLog([{ id: 'x', ts: Date.now(), type: 'save', text: 'Fort DC 20 → all PCs' }]));
    expect(screen.queryByText(/No events yet/)).not.toBeInTheDocument();
    expect(screen.getByText('Fort DC 20 → all PCs')).toBeInTheDocument();
  });
});
