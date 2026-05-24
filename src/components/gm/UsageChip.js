import React, { useEffect, useState } from 'react';
import { fetchUsage } from '../../utils/gmApi';

const POLL_MS = 30_000;

const UsageChip = () => {
  const [usage, setUsage] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetchUsage()
        .then((data) => { if (!cancelled) setUsage(data); })
        .catch(() => {});
    load();
    const id = setInterval(load, POLL_MS);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!usage) return null;

  const { writesSinceRestart, limit } = usage;
  const pct = writesSinceRestart / limit;
  const tier = pct >= 0.85 ? 'danger' : pct >= 0.6 ? 'warning' : '';

  return (
    <span
      className={`gm-usage-chip${tier ? ` ${tier}` : ''}`}
      title="Writes since the worker last restarted. Resets when the DO migrates (CF behavior). For exact account totals, check the Cloudflare dashboard."
    >
      {writesSinceRestart.toLocaleString()} / 100k writes
    </span>
  );
};

export default UsageChip;
