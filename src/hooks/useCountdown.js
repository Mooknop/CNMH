import { useEffect, useState } from 'react';

// Seconds remaining until `deadline` (ms epoch), re-rendering once per second
// and stopping the interval at zero. `null`/undefined deadline → null (no
// countdown running). Purely device-local — countdown surfaces on different
// devices each run their own clock (#1575 D4).
export function useCountdown(deadline) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline == null || Date.now() >= deadline) return undefined;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= deadline) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  if (deadline == null) return null;
  return Math.max(0, Math.ceil((deadline - now) / 1000));
}

export default useCountdown;
