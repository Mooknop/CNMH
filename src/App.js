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
import './App.css';

function App() {
  return (
    <SessionProvider>
      <ContentProvider>
        <GameDateProvider>
          <CharacterProvider>
            <TraitProvider>
              <LoreProvider>
                <Router>
                  <div className="app-container">
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
