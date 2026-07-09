// renderWithProviders (#1311) — render a component under the app's REAL
// provider stack with seeded data, instead of vi.mock-ing the context hooks.
//
//   const { session } = renderWithProviders(<ItemModal item={...} />, {
//     content: { item: [makeItem({ id: 'dagger', name: 'Dagger' })] },
//     session: { state: { 'char-1': { hp: { current: 10 } } } },
//   });
//   ...
//   expect(session.sent).toContainEqual(...)   // writes the code issued
//   act(() => session.push('char-1', 'hp', { current: 5 }));  // remote update
//
// `content` seeds ContentProvider (partial — unlisted collections fall back to
// the bundled seed, exactly like the live app). `session` is makeSessionBus
// options, or a bus you built yourself. Everything downstream (Character,
// Trait, GameDate, Lore, PlayModeOverride) is the real provider deriving from
// that seeded data, so normalization, catalog resolution, and useSyncedState
// all run for real.
import React from 'react';
import { render, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ContentProvider } from '../contexts/ContentContext';
import { SessionContext } from '../contexts/SessionContext';
import { CharacterProvider } from '../contexts/CharacterContext';
import { TraitProvider } from '../contexts/TraitContext';
import { GameDateProvider } from '../contexts/GameDateContext';
import { LoreProvider } from '../contexts/LoreContext';
import { PlayModeOverrideProvider } from '../contexts/PlayModeOverrideContext';
import { makeContent } from './factories';
import { makeSessionBus } from './sessionBus';

function buildWrapper({ content, session, route = '/' } = {}) {
  const bus = session && typeof session.subscribe === 'function'
    ? session
    : makeSessionBus(session);
  const initialContent = makeContent(content);

  const Wrapper = ({ children }) => (
    <MemoryRouter initialEntries={[route]}>
      <SessionContext.Provider value={bus}>
        <ContentProvider initialContent={initialContent}>
          <CharacterProvider>
            <TraitProvider>
              <GameDateProvider>
                <LoreProvider>
                  <PlayModeOverrideProvider>
                    {children}
                  </PlayModeOverrideProvider>
                </LoreProvider>
              </GameDateProvider>
            </TraitProvider>
          </CharacterProvider>
        </ContentProvider>
      </SessionContext.Provider>
    </MemoryRouter>
  );

  return { Wrapper, bus };
}

export function renderWithProviders(ui, { content, session, route, ...renderOptions } = {}) {
  const { Wrapper, bus } = buildWrapper({ content, session, route });
  return { ...render(ui, { wrapper: Wrapper, ...renderOptions }), session: bus };
}

// renderHook counterpart — same provider stack, for testing hooks directly:
//   const { result, session } = renderHookWithProviders(() => useTokenMovement('pc-1'));
export function renderHookWithProviders(callback, { content, session, route, ...renderOptions } = {}) {
  const { Wrapper, bus } = buildWrapper({ content, session, route });
  return { ...renderHook(callback, { wrapper: Wrapper, ...renderOptions }), session: bus };
}

export { makeSessionBus } from './sessionBus';
export * from './factories';
