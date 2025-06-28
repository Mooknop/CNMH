import React from 'react';
import { HashRouter as Router, Routes, Route } from 'react-router-dom';
import { CharacterProvider } from './contexts/CharacterContext';
import { TraitProvider } from './contexts/TraitContext';
import { GameDateProvider } from './contexts/GameDateContext';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import CharacterSheet from './pages/CharacterSheet';
import QuestTracker from './pages/QuestTracker';
import PartyWealth from './pages/PartyWealth';
import Lore from './pages/Lore';
import GolarionCalendar from './pages/GolarionCalendar';
import PartySummary from './components/party/PartySummary';
import './App.css';

function App() {
  return (
    <GameDateProvider>
      <CharacterProvider>
        <TraitProvider>
          <Router>
            <div className="app-container">
              <Navbar />
              <main className="main-content">
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/character/:id" element={<CharacterSheet />} />
                  <Route path="/quests" element={<QuestTracker />} />
                  <Route path="/party-wealth" element={<PartyWealth />} />
                  <Route path="/lore" element={<Lore />} />
                  <Route path="/calendar" element={<GolarionCalendar />} />
                  <Route path="/party-summary" element={<PartySummary />} />
                </Routes>
              </main>
            </div>
          </Router>
        </TraitProvider>
      </CharacterProvider>
    </GameDateProvider>
  );
}

export default App;