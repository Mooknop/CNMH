import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { CharacterProvider } from './contexts/CharacterContext';
import Navbar from './components/layout/Navbar';
import Dashboard from './pages/Dashboard';
import CharacterSheet from './pages/CharacterSheet';
import QuestTracker from './pages/QuestTracker';
import Lore from './pages/Lore';
import './App.css';

function App() {
  return (
    <CharacterProvider>
      <Router>
        <div className="app-container">
          <Navbar />
          <main className="main-content">
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/character/:id" element={<CharacterSheet />} />
              <Route path="/quests" element={<QuestTracker />} />
              <Route path="/lore" element={<Lore />} />
            </Routes>
          </main>
        </div>
      </Router>
    </CharacterProvider>
  );
}

export default App;