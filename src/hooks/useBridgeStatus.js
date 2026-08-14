import { useSyncedState } from './useSyncedState';
import { useSession } from '../contexts/SessionContext';
import { RELAY, globalKey } from '../sync/keys';

// The oldest bridge wire protocol this app still fully supports. Bridges
// announce theirs on cnmh_bridgehello_global (#1310); raise this when the app
// starts depending on a payload shape older modules don't send. Pre-handshake
// modules (no hello at all) resolve to protocol 0 — always outdated.
//
// Raised 1 → 14 for #1736 S5: PC Stride's destination-tap confirm-gate flow
// (findMovementPath/constrainMovementPath/measureMovementPath + the
// moveplan/moveplanned relay pair, FULL_MOVE_PROTOCOL in utils/movement.js) is
// now the ONLY way to Stride in the encounter dock — the D-pad fallback for
// Stride was retired, so a pre-14 bridge genuinely can't drive that surface
// anymore. This is exactly the "app starts depending on a payload shape older
// modules don't send" trigger above. It's a warning, not a hard gate: Step and
// the exploration/minion/foe stepper fallbacks still work below this floor —
// SyncStatus's "Bridge outdated" badge is what surfaces it to the table.
export const MIN_BRIDGE_PROTOCOL = 14;

// Bridge protocol handshake read-out (#1310). `outdated` is true only while
// Foundry is actually connected AND its announced protocol predates the app's
// minimum — a stale module degrading silently is exactly what this surfaces
// (SyncStatus renders it as the "Bridge outdated" badge).
//
// Known limit: the hello is persisted session state, so a bridge DOWNGRADE
// (newer hello on record than the module now connecting) can read as ok until
// the old module reconnects and overwrites it — acceptable; downgrades are not
// a real workflow.
export function useBridgeStatus() {
  const { connected, foundryConnected } = useSession();
  const [hello] = useSyncedState(globalKey(RELAY.BRIDGEHELLO), null);
  const protocol = typeof hello?.protocol === 'number' ? hello.protocol : 0;
  return {
    outdated: !!connected && !!foundryConnected && protocol < MIN_BRIDGE_PROTOCOL,
    protocol: hello?.protocol ?? null,
    moduleVersion: hello?.module ?? null,
  };
}

export default useBridgeStatus;
