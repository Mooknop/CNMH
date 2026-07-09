import { useCallback } from 'react';
import { useSyncedState } from './useSyncedState';
import { APP, globalKey } from '../sync/keys';

const LOG_CAP = 50;
let _counter = 0;

const makeEntry = (entry) => ({
  id:  `slog-${Date.now()}-${_counter++}`,
  ts:  Date.now(),
  ...entry,
});

export function useSessionLog() {
  const [log, setLog] = useSyncedState(globalKey(APP.SESSIONLOG), []);

  const appendEvent = useCallback(
    (entry) =>
      setLog((cur) => {
        const next = [makeEntry(entry), ...(cur || [])];
        return next.length > LOG_CAP ? next.slice(0, LOG_CAP) : next;
      }),
    [setLog],
  );

  return { log: log || [], appendEvent };
}
