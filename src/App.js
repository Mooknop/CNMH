import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { SessionProvider } from './contexts/SessionContext';
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
import LoreDrawer from './components/shared/LoreDrawer';
import GmLayout from './pages/gm/GmLayout';
import GmDashboard from './pages/gm/GmDashboard';
import GmQuests from './pages/gm/GmQuests';
import GmReputation from './pages/gm/GmReputation';
import GmCalendar from './pages/gm/GmCalendar';
import GmLore from './pages/gm/GmLore';
import GmCharacters from './pages/gm/GmCharacters';
import GmItems from './pages/gm/GmItems';
import GmSpells from './pages/gm/GmSpells';
import GmEncounter from './pages/gm/GmEncounter';
import './App.css';

const IS_STAGING = process.env.REACT_APP_ENVIRONMENT === 'staging';

function StagingBanner() {
  if (!IS_STAGING) return null;
  return <div className="staging-banner">STAGING — not production</div>;
}

function App() {
  return (
    <SessionProvider>
      <ContentProvider>
        <GameDateProvider>
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
                        <Route path="/gm" element={<GmLayout />}>
                          <Route index element={<GmDashboard />} />
                          <Route path="quests" element={<GmQuests />} />
                          <Route path="reputation" element={<GmReputation />} />
                          <Route path="calendar" element={<GmCalendar />} />
                          <Route path="lore" element={<GmLore />} />
                          <Route path="characters" element={<GmCharacters />} />
                          <Route path="items" element={<GmItems />} />
                          <Route path="spells" element={<GmSpells />} />
                          <Route path="encounter" element={<GmEncounter />} />
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
    </SessionProvider>
  );
}

export default App;
