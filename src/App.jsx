import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { SessionProvider } from './contexts/SessionContext';
import { PlayModeOverrideProvider } from './contexts/PlayModeOverrideContext';
import { ContentProvider } from './contexts/ContentContext';
import { CharacterProvider } from './contexts/CharacterContext';
import { TraitProvider } from './contexts/TraitContext';
import { GameDateProvider } from './contexts/GameDateContext';
import { LoreProvider } from './contexts/LoreContext';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import CharacterSheet from './pages/CharacterSheet';
import QuestTracker from './pages/QuestTracker';
import PartyWealth from './pages/PartyWealth';
import GolarionCalendar from './pages/GolarionCalendar';
import HistoryTimeline from './pages/HistoryTimeline';
import PartySummary from './components/party/PartySummary';
import BestiaryBrowser from './pages/BestiaryBrowser';
import LoreDrawer from './components/shared/LoreDrawer';
import ActorMapSync from './components/encounter/ActorMapSync';
import EncounterClockSync from './components/encounter/EncounterClockSync';
import EffectExpirySync from './components/encounter/EffectExpirySync';
import PersistentSync from './components/encounter/PersistentSync';
import TurnEffectsSync from './components/encounter/TurnEffectsSync';
import BestiaryCaptureSync from './components/encounter/BestiaryCaptureSync';
import AuraKoSync from './components/encounter/AuraKoSync';
import WardSync from './components/encounter/WardSync';
import VocoderConcealSync from './components/encounter/VocoderConcealSync';
import GmLayout from './pages/gm/GmLayout';
import GmDashboard from './pages/gm/GmDashboard';
import GmQuests from './pages/gm/GmQuests';
import GmReputation from './pages/gm/GmReputation';
import GmCalendar from './pages/gm/GmCalendar';
import GmLore from './pages/gm/GmLore';
import GmShops from './pages/gm/GmShops';
import GmCharacters from './pages/gm/GmCharacters';
import GmItems from './pages/gm/GmItems';
import GmSpells from './pages/gm/GmSpells';
import GmEffects from './pages/gm/GmEffects';
import GmRunes from './pages/gm/GmRunes';
import GmArmorRunes from './pages/gm/GmArmorRunes';
import GmEncounter from './pages/gm/GmEncounter';
import GmImages from './pages/gm/GmImages';
import GmTheme from './pages/gm/GmTheme';
import GmMonsters from './pages/gm/GmMonsters';
import GmTraits from './pages/gm/GmTraits';
import './App.css';

const IS_STAGING = import.meta.env.VITE_ENVIRONMENT === 'staging';
const GIT_SHA = import.meta.env.VITE_GIT_SHA || '';
const SHORT_SHA = GIT_SHA.slice(0, 7);
const COMMIT_URL = GIT_SHA ? `https://github.com/Mooknop/CNMH/commit/${GIT_SHA}` : null;

function StagingBanner() {
  if (!IS_STAGING) return null;
  return (
    <div className="staging-banner">
      STAGING — not production
      {COMMIT_URL && (
        <>
          {' · '}
          <a
            href={COMMIT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="staging-banner-link"
          >
            {SHORT_SHA}
          </a>
        </>
      )}
    </div>
  );
}

function App() {
  return (
    <SessionProvider>
      <PlayModeOverrideProvider>
      <ContentProvider>
        <ActorMapSync />
        <GameDateProvider>
          <EncounterClockSync />
          <EffectExpirySync />
          <PersistentSync />
          <TurnEffectsSync />
          <BestiaryCaptureSync />
          <AuraKoSync />
          <WardSync />
          <VocoderConcealSync />
          <CharacterProvider>
            <TraitProvider>
              <LoreProvider>
                <Router>
                  <div className={`app-container${IS_STAGING ? ' app-staging' : ''}`}>
                    <StagingBanner />
                    <Navbar />
                    <main className="main-content">
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/character/:id" element={<CharacterSheet />} />
                        <Route path="/quests" element={<QuestTracker />} />
                        <Route path="/party-wealth" element={<PartyWealth />} />
                        <Route path="/calendar" element={<GolarionCalendar />} />
                        <Route path="/timeline" element={<HistoryTimeline />} />
                        <Route path="/party-summary" element={<PartySummary />} />
                        <Route path="/bestiary" element={<BestiaryBrowser />} />
                        <Route path="/bestiary/:creatureKey" element={<BestiaryBrowser />} />
                        <Route path="/gm" element={<GmLayout />}>
                          <Route index element={<GmDashboard />} />

                          {/* World area */}
                          <Route path="world" element={<Navigate to="/gm/world/quests" replace />} />
                          <Route path="world/quests" element={<GmQuests />} />
                          <Route path="world/reputation" element={<GmReputation />} />
                          <Route path="world/calendar" element={<GmCalendar />} />
                          <Route path="world/lore" element={<GmLore />} />
                          <Route path="world/shops" element={<GmShops />} />

                          {/* Catalog area */}
                          <Route path="catalog" element={<Navigate to="/gm/catalog/items" replace />} />
                          <Route path="catalog/items" element={<GmItems />} />
                          <Route path="catalog/spells" element={<GmSpells />} />
                          <Route path="catalog/effects" element={<GmEffects />} />
                          <Route path="catalog/runes" element={<GmRunes />} />
                          <Route path="catalog/armor-runes" element={<GmArmorRunes />} />
                          <Route path="catalog/images" element={<GmImages />} />
                          <Route path="catalog/monsters" element={<GmMonsters />} />
                          <Route path="catalog/traits" element={<GmTraits />} />

                          {/* Top-level areas */}
                          <Route path="characters" element={<GmCharacters />} />
                          <Route path="theme" element={<GmTheme />} />

                          {/* Encounter stays reachable until Slice 4 folds it into the Dashboard */}
                          <Route path="encounter" element={<GmEncounter />} />

                          {/* Redirects from the old flat paths (bookmarks / player deep links) */}
                          <Route path="quests" element={<Navigate to="/gm/world/quests" replace />} />
                          <Route path="reputation" element={<Navigate to="/gm/world/reputation" replace />} />
                          <Route path="calendar" element={<Navigate to="/gm/world/calendar" replace />} />
                          <Route path="lore" element={<Navigate to="/gm/world/lore" replace />} />
                          <Route path="items" element={<Navigate to="/gm/catalog/items" replace />} />
                          <Route path="spells" element={<Navigate to="/gm/catalog/spells" replace />} />
                          <Route path="effects" element={<Navigate to="/gm/catalog/effects" replace />} />
                          <Route path="images" element={<Navigate to="/gm/catalog/images" replace />} />
                          <Route path="traits" element={<Navigate to="/gm/catalog/traits" replace />} />
                        </Route>
                      </Routes>
                    </main>
                    <LoreDrawer />
                  </div>
                </Router>
              </LoreProvider>
            </TraitProvider>
          </CharacterProvider>
        </GameDateProvider>
      </ContentProvider>
      </PlayModeOverrideProvider>
    </SessionProvider>
  );
}

export default App;
