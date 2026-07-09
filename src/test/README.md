# Test infrastructure (#1311)

Shared helpers so component/hook tests run against the **real provider stack**
with seeded data instead of `vi.mock`-ing the context hooks.

## renderWithProviders

```jsx
import { renderWithProviders, makeCharacter, makeItem, invRef } from '../../test/renderWithProviders';

const { session } = renderWithProviders(<ItemModal item={item} />, {
  content: { character: [makeCharacter({ id: 'pc-1' })], item: [makeItem({ id: 'dagger' })] },
  session: { state: { 'pc-1': { gold: 42 } }, connected: true, foundryConnected: true },
  route: '/character/pc-1',
});

expect(session.sent).toContainEqual(expect.objectContaining({ stateType: 'gold' }));
act(() => session.push('pc-1', 'hp', { current: 5 }));  // simulate a remote peer
```

- `content` seeds `ContentProvider` (via its `initialContent` test seam); the
  **real** normalization + catalog-resolution pipeline runs on it. Unlisted
  collections fall back to the bundled seed, same as the live app.
- `session` builds an in-memory bus (`makeSessionBus`) implementing the exact
  SessionContext surface — including the offline-sandbox write freeze — so the
  real `useSyncedState` runs unmodified. `bus.sent` logs writes; `bus.push()`
  simulates a remote UPDATE.
- The wrapper mounts the real Character/Trait/GameDate/Lore/PlayModeOverride
  providers and a `MemoryRouter` (`route` sets the initial entry).

## Factories

`makeCharacter`, `makeItem`, `makeSpell`, `makeEffect`, `invRef`, `makeContent`
(in `factories.js`) return minimal **authored** docs in the CampaignContent
collection shapes. Overrides shallow-merge — pass whole nested objects when a
nested field matters. Modelled on the bridge's `foundry-bridge/test/foundryMock.js`.

## Mocking convention

Prefer this helper over mocking `useContent`/`useCharacter`/`useSession`. When
a context mock is genuinely needed (isolating a unit from a heavy tree), you
MUST spread the real module so new exports don't break your factory:

```js
vi.mock('../../contexts/ContentContext', async (importOriginal) => ({
  ...(await importOriginal()),
  useContent: vi.fn(),
}));
```

Full-replacement factories (`vi.mock('...', () => ({ useContent: vi.fn() }))`)
are the reason adding one export to a shared module has historically broken
dozens of suites — don't write new ones.

Test files may keep literal `cnmh_*` key strings (they guard the sync-key
registry's builder output); production code must use `src/sync/keys.js`.

## Relay fixtures (#1308)

`relayFixtures.js` loads the bridge-emission payloads RECORDED by
`foundry-bridge/relayContract.test.js` (one JSON per channel under
`foundry-bridge/__fixtures__/relay/`). Use `pushRelayFixture(session, RELAY.X,
{ charId, ...overrides })` to feed a consumer the real wire shape instead of a
hand-rolled payload — `relayConsumers.test.jsx` does this for the movement
chain, encounter, adjacency, hp/conditions, minions, and doors. Never hand-edit
a fixture; re-record from the bridge suite (`RELAY_FIXTURES=record`).

## localStorage isolation

`useSyncedState` persists every write (and every incoming update) to
localStorage and reads it back as the initial value on the next mount. Suites
that exercise synced state through this helper should start with

```js
beforeEach(() => window.localStorage.clear());
```

or a stale value from a previous test becomes the next test's initial state.
